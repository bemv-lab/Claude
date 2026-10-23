"""Pipeline de importação: ler -> normalizar -> deduplicar -> categorizar -> transferências -> dívidas -> alertas."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import alertas, dividas, planilha, transferencias
from .categorizar import Classificador
from .db import pessoa_id
from .importadores import csv_, ofx, pdf_itau, xlsx
from .util import agora_iso, chave_estabelecimento, detectar_parcela, normalizar

EXTENSOES = {".ofx", ".csv", ".txt", ".pdf", ".qfx", ".xlsx"}


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _contas(con) -> dict[int, dict]:
    return {r["id"]: dict(r) for r in con.execute("SELECT * FROM contas")}


def _resolver_conta_texto(contas: dict, texto: str | None) -> int | None:
    """Planilha: 'Nubank', 'Cartão Inter', 'BB'... -> id da conta."""
    if not texto:
        return None
    t = normalizar(texto)
    pistas = [("NUBANK", "nubank"), ("NU ", "nubank"), ("FLASH", "flash"), ("ITAU", "itau"),
              ("BANCO DO BRASIL", "bb"), ("BB", "bb")]
    for p, ap in pistas:
        if p in f" {t} ":
            return next((c["id"] for c in contas.values() if c["apelido"] == ap), None)
    if "INTER" in t:
        cartao = any(w in t for w in ("CARTAO", "CREDITO", "FATURA"))
        ap = "inter-cartao" if cartao else "inter-conta"
        return next((c["id"] for c in contas.values() if c["apelido"] == ap), None)
    for c in contas.values():
        if normalizar(c["nome"]) in t or t in normalizar(c["nome"]):
            return c["id"]
    return None


def _resolver_pessoa(con, conta: dict, portador: str | None, pessoa_texto: str | None, portadores) -> int:
    for texto in (pessoa_texto, portador):
        if not texto:
            continue
        t = normalizar(texto)
        for p in portadores:
            if p["conta_id"] == conta["id"] and normalizar(p["padrao"]) in t:
                return p["pessoa_id"]
        for nome in ("Bárbara", "Lucas", "Casal"):
            if normalizar(nome) in t:
                return pessoa_id(con, nome)
    if conta["tipo"] == "cartao" and any(p["conta_id"] == conta["id"] for p in portadores):
        return pessoa_id(con, "Casal")       # cartão compartilhado sem portador no extrato
    return conta["titular_id"] or pessoa_id(con, "Casal")


class Lote:
    """Uma rodada de importação (vários arquivos) com resumo do que mudou."""

    def __init__(self, con):
        self.con = con
        self.contas = _contas(con)
        self.portadores = [dict(r) for r in con.execute("SELECT * FROM portadores")]
        self.classificador = Classificador(con)
        self.arquivos: list[dict] = []
        self.duvidas_antes = con.execute("SELECT COUNT(*) FROM transacoes WHERE classificacao='duvida'").fetchone()[0]

    # ------------------------------------------------------------ um arquivo
    def arquivo(self, conteudo: bytes, nome: str, conta_id: int | None = None, mapa: dict | None = None,
                planilha: bool = False) -> dict:
        con = self.con
        h = _sha(conteudo)
        res = {"arquivo": nome, "conta": None, "formato": None, "novas": 0, "duplicadas": 0, "status": "ok",
               "mensagem": ""}
        ja = con.execute("SELECT id FROM importacoes WHERE hash_arquivo = ? AND status = 'ok'", (h,)).fetchone()
        if ja and not mapa:
            res.update(status="ja_importado", mensagem="Arquivo já importado antes.")
            self.arquivos.append(res)
            return res
        ext = Path(nome).suffix.lower()
        if ext == ".pdf" or pdf_itau.eh_pdf(conteudo):
            try:
                dados = pdf_itau.ler(conteudo)
            except pdf_itau.PdfIndisponivel as e:
                res.update(status="pdf", formato="pdf", mensagem=str(e))
                self.arquivos.append(res)
                return res
            if not dados:
                res.update(status="pdf", formato="pdf", mensagem="PDF não reconhecido: por enquanto só o extrato "
                                                                 "de conta corrente do Itaú. Use OFX ou CSV.")
                self.arquivos.append(res)
                return res
            if conta_id is None and dados.get("identificador"):
                conta_id = next((c["id"] for c in self.contas.values()
                                 if c["identificador"] and c["identificador"] in dados["identificador"]), None)
        elif ofx.eh_ofx(conteudo):
            dados = ofx.ler(conteudo)
            if conta_id is None and dados.get("identificador"):
                conta_id = next((c["id"] for c in self.contas.values()
                                 if c["identificador"] and c["identificador"] in dados["identificador"]), None)
        else:
            formato = "csv"
            if xlsx.eh_xlsx(conteudo):
                abas = xlsx.nomes_das_abas(conteudo)
                if "Lançamentos" in abas and "Val.Dados" in abas:
                    res.update(status="planilha", formato="xlsx",
                               mensagem="Planilha de controle: entra pelo importador da planilha (pasta planilha/).")
                    self.arquivos.append(res)
                    return res
                linhas = xlsx.linhas_texto(next(iter(xlsx.ler(conteudo, abas[:1]).values())))
                formato = "xlsx"
            else:
                linhas = csv_.linhas_csv(conteudo)
            perfil = None
            if not mapa:
                for i in range(min(25, len(linhas))):
                    r = con.execute("SELECT mapeamento FROM perfis_csv WHERE assinatura = ?",
                                    (csv_.assinatura(linhas[i]),)).fetchone()
                    if r:
                        perfil = json.loads(r["mapeamento"])
                        break
            mapa = mapa or perfil
            if mapa:
                dados = csv_.ler_linhas(linhas, mapa, formato)
                conta_id = conta_id or mapa.get("conta_fixa")
            else:
                dados = csv_.ler_linhas(linhas, None, formato)
                if planilha and not dados.get("precisa_mapear"):
                    dados = {**dados, "precisa_mapear": True, "linha_cabecalho": dados["mapa"]["linha_cabecalho"],
                             "amostra": linhas[dados["mapa"]["linha_cabecalho"] + 1:][:5]}
            if dados.get("precisa_mapear"):
                res.update(status="precisa_mapear", formato=formato,
                           mensagem="Não reconheci as colunas. Mapeie uma vez na tela Importar e eu lembro.",
                           cabecalho=dados["cabecalho"], amostra=dados.get("amostra", []),
                           linha_cabecalho=dados.get("linha_cabecalho", 0),
                           sugestao=csv_.sugerir_mapa(dados["cabecalho"]))
                self.arquivos.append(res)
                return res
        res["formato"] = dados["formato"]
        trans = dados["transacoes"]
        por_linha = bool(mapa and mapa.get("conta") is not None)
        if conta_id is None and not por_linha:
            res.update(status="sem_conta", mensagem="Não sei de qual conta é. Coloque na subpasta da conta "
                                                    "ou escolha a conta no envio.")
            self.arquivos.append(res)
            return res
        conta = self.contas.get(conta_id) if conta_id else None
        res["conta"] = conta["nome"] if conta else "várias (planilha)"

        # cartão: no CSV as compras vêm positivas; padroniza saída = negativo
        if conta and conta["tipo"] == "cartao" and not mapa:
            pos = sum(1 for t in trans if t["valor"] > 0)
            if pos > len(trans) - pos:
                for t in trans:
                    t["valor"] = -t["valor"]

        cur = con.execute("INSERT INTO importacoes (arquivo, hash_arquivo, conta_id, formato, status, criado_em) "
                          "VALUES (?,?,?,?, 'processando', ?)", (nome, h, conta_id, res["formato"], agora_iso()))
        imp_id = cur.lastrowid
        ocorrencias: dict[tuple, int] = {}
        for t in trans:
            c = conta
            if por_linha:
                c = self.contas.get(_resolver_conta_texto(self.contas, t.get("conta_texto")) or conta_id or -1)
                if not c:
                    res["mensagem"] += f" Linha sem conta reconhecida: {t.get('conta_texto')!r}."
                    continue
            parcela = detectar_parcela(t["descricao"], c["tipo"] == "cartao", t.get("extra") or "")
            k = (c["id"], t["data"], t["valor"], parcela[0] if parcela else None)
            n = ocorrencias.get(k, 0)
            ocorrencias[k] = n + 1
            hash_tx = hashlib.sha1(f"{c['id']}|{t['data']}|{t['valor']}|{k[3] or ''}|{n}".encode()).hexdigest()
            if con.execute("SELECT 1 FROM transacoes WHERE hash = ?", (hash_tx,)).fetchone():
                res["duplicadas"] += 1
                continue
            chave = chave_estabelecimento(t["descricao"])
            item = {"descricao": t["descricao"], "valor": t["valor"], "conta_id": c["id"], "chave": chave,
                    "categoria_externa": t.get("categoria_externa")}
            cl = self.classificador.classificar(item, c["tipo"])
            if t.get("categoria_externa") and mapa and mapa.get("categoria") is not None:
                cat = con.execute("SELECT id, tipo FROM categorias WHERE lower(nome) = lower(?)",
                                  (t["categoria_externa"].strip(),)).fetchone()
                if cat:
                    cl.update(categoria_id=cat["id"], classificacao="importada", motivo_duvida=None)
            pessoa = cl.get("pessoa_id") or _resolver_pessoa(con, c, t.get("portador"), t.get("pessoa_texto"),
                                                             self.portadores)
            con.execute("""INSERT INTO transacoes (conta_id, data, descricao, chave, valor, pessoa_id, categoria_id,
                           escopo, tipo, parcela_atual, parcela_total, classificacao, sugestao_id, motivo_duvida,
                           categoria_externa, portador, fitid, hash, importacao_id, criado_em)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (c["id"], t["data"], t["descricao"].strip(), chave, t["valor"], pessoa, cl["categoria_id"],
                         cl["escopo"], cl["tipo"], parcela[0] if parcela else None,
                         parcela[1] if parcela else None, cl["classificacao"], cl["sugestao_id"],
                         cl["motivo_duvida"], t.get("categoria_externa"), t.get("portador"), t.get("fitid"),
                         hash_tx, imp_id, agora_iso()))
            if cl.get("regra_id"):
                con.execute("UPDATE regras SET usos = usos + 1 WHERE id = ?", (cl["regra_id"],))
            res["novas"] += 1
        con.execute("UPDATE importacoes SET novas=?, duplicadas=?, status='ok', mensagem=? WHERE id=?",
                    (res["novas"], res["duplicadas"], res["mensagem"].strip(), imp_id))
        con.commit()
        self.arquivos.append(res)
        return res

    # ------------------------------------------------------------ pasta entrada/
    def pasta(self, raiz: Path) -> None:
        preparar_pastas(self.con, raiz)
        pastas = {c["pasta"]: c["id"] for c in self.contas.values() if c["pasta"]}
        planilhas = []
        for arq in sorted(raiz.rglob("*")):
            if not arq.is_file() or arq.suffix.lower() not in EXTENSOES or arq.name.startswith(".") \
                    or arq.name.upper().startswith("LEIA-ME"):
                continue
            rel = arq.relative_to(raiz).parts
            sub = rel[0] if len(rel) > 1 else None
            if sub and sub.startswith("_"):
                continue
            bruto = arq.read_bytes()
            if sub == "planilha" and xlsx.eh_xlsx(bruto) and "Val.Dados" in xlsx.nomes_das_abas(bruto):
                planilhas.append(("/".join(rel), bruto))
                continue
            r = self.arquivo(bruto, "/".join(rel), pastas.get(sub), planilha=(sub == "planilha"))
            r["caminho"] = "/".join(rel)
        if planilhas:
            self.planilha(planilhas)

    def planilha(self, arquivos: list[tuple[str, bytes]]) -> dict:
        """Planilha de controle antiga: compras de cartão/dinheiro entram; categorias de vocês viram regras."""
        novos = [(n, c) for n, c in arquivos
                 if not self.con.execute("SELECT 1 FROM importacoes WHERE hash_arquivo = ? AND status = 'ok'",
                                         (_sha(c),)).fetchone()]
        for n, c in arquivos:
            if (n, c) not in novos:
                self.arquivos.append({"arquivo": n, "conta": "planilha", "formato": "xlsx", "novas": 0,
                                      "duplicadas": 0, "status": "ja_importado", "mensagem": ""})
        if not novos:
            return {}
        r = planilha.importar(self.con, novos)
        self.planilha_resumo = r
        for n, c in novos:
            self.con.execute("INSERT INTO importacoes (arquivo, hash_arquivo, formato, novas, duplicadas, status, "
                             "mensagem, criado_em) VALUES (?,?, 'xlsx', ?, ?, 'ok', 'planilha', ?)",
                             (n, _sha(c), r["cartoes_novos"], r["cartoes_duplicadas"], agora_iso()))
        self.arquivos.append({"arquivo": f"planilha/ ({len(novos)} versões)", "conta": "cartões e dinheiro",
                              "formato": "xlsx", "novas": r["cartoes_novos"], "duplicadas": r["cartoes_duplicadas"],
                              "status": "ok", "mensagem": ""})
        self.con.commit()
        return r

    # ------------------------------------------------------------ depois de importar
    def finalizar(self) -> dict:
        con = self.con
        pares = transferencias.parear(con)
        aprendizado = planilha.aprender_contas(con) if con.execute(
            "SELECT 1 FROM planilha_linhas WHERE aprendida = 0 LIMIT 1").fetchone() else {}
        pagamentos = dividas.reconhecer_pagamentos(con)
        novos_alertas = alertas.gerar(con)
        duvidas = con.execute("SELECT COUNT(*) FROM transacoes WHERE classificacao='duvida'").fetchone()[0]
        novas = sum(a["novas"] for a in self.arquivos)
        return {
            "arquivos": self.arquivos,
            "novas": novas,
            "duplicadas": sum(a["duplicadas"] for a in self.arquivos),
            "transferencias": pares,
            "planilha": getattr(self, "planilha_resumo", None), "aprendizado_planilha": aprendizado,
            "pagamentos_divida": pagamentos,
            "duvidas": duvidas,
            "duvidas_novas": max(0, duvidas - self.duvidas_antes),
            "alertas_novos": novos_alertas,
            "pendentes": [a for a in self.arquivos if a["status"] not in ("ok", "ja_importado")],
        }


def preparar_pastas(con, raiz: Path) -> None:
    """Cria entrada/<conta>/ para cada conta cadastrada (e entrada/planilha/)."""
    raiz.mkdir(parents=True, exist_ok=True)
    for r in con.execute("SELECT pasta FROM contas WHERE COALESCE(pasta, '') != ''"):
        (raiz / r["pasta"]).mkdir(exist_ok=True)
    (raiz / "planilha").mkdir(exist_ok=True)


def atualizar(con, pasta: Path) -> dict:
    lote = Lote(con)
    lote.pasta(pasta)
    return lote.finalizar()


def resumo_texto(r: dict) -> str:
    linhas = []
    for a in r["arquivos"]:
        if a["status"] == "ok":
            linhas.append(f"  ✓ {a['arquivo']} → {a['conta']}: {a['novas']} novos, {a['duplicadas']} já existiam")
        elif a["status"] != "ja_importado":
            linhas.append(f"  ! {a['arquivo']}: {a['mensagem']}")
    ja = sum(1 for a in r["arquivos"] if a["status"] == "ja_importado")
    if ja:
        linhas.append(f"  · {ja} arquivo(s) já importados antes (ignorados)")
    if not r["arquivos"]:
        linhas.append("  Nenhum extrato em entrada/. Baixe o OFX/CSV do app do banco e salve na subpasta da conta.")
    linhas += [
        "",
        f"Lançamentos novos: {r['novas']}  ·  duplicados ignorados: {r['duplicadas']}",
        f"Transferências entre contas reconhecidas: {r['transferencias']}",
        f"Pagamentos de dívida reconhecidos: {r['pagamentos_divida']}",
    ]
    pl, ap = r.get("planilha"), r.get("aprendizado_planilha")
    if pl:
        linhas.append(f"Planilha: {pl['versoes']} versões somadas · {pl['cartoes_novos']} compras de cartão/dinheiro · "
                      f"{pl['regras_novas']} regras de estabelecimento · {pl['orcado']} categorias com orçado · "
                      f"{pl['parcelas_paradas']} parcelas antigas esquecidas na planilha ignoradas")
    if ap:
        linhas.append(f"Categorias de vocês aprendidas dos extratos: {ap['casadas']} lançamentos casados com a planilha "
                      f"({ap['sem_par_no_extrato']} linhas da planilha sem par no extrato)")
    linhas += [
        f"Fila de dúvidas: {r['duvidas']} ({r['duvidas_novas']} novas)",
        f"Alertas novos: {r['alertas_novos']}",
    ]
    return "\n".join(linhas)
