"""Primeira carga de dados reais: copia os arquivos para entrada/<conta>/, importa tudo de uma vez e aplica
os ajustes que vocês combinaram (dívidas, valores estimados), que ficam em um arquivo LOCAL fora do git.

  python carga_inicial.py --ajustes dados/ajustes.json \\
      inter-conta=Extrato1.ofx inter-conta=Extrato2.ofx bb=bb-julho.xlsx itau=itau.pdf flash=flash.csv \\
      planilha=Controle-julho.xlsx planilha=Controle-agosto.xlsx

O arquivo de ajustes (JSON) pode ter:
  "config":              {"nomes_casal": ["BARBARA", "LUCAS"], ...}      valores em centavos onde for dinheiro
  "dividas_atualizar":   [{"nome": "...", "campos": {"saldo_base": 100000, ...}}]
  "dividas_novas":       [{"nome": "...", "tipo": "...", ...}]
  "classificar":         [{"conta": "bb", "data": "AAAA-MM-DD", "valor": 2942, "categoria": "..."}]
  "portadores":          [{"conta": "inter-cartao", "padrao": "final do cartão", "pessoa": "Lucas"}]
  "regras":              [{"padrao": "NOME NO EXTRATO", "categoria": "Salário", "sinal": "entrada", "escopo": "pessoal"}]
  "negociacoes":         [{"divida": "...", "data": "AAAA-MM-DD", "texto": "..."}]
  "lancamentos_estimados": [{"conta": "itau", "data": "AAAA-MM-DD", "descricao": "...", "valor": 112763,
                             "categoria": "Salário"}]     (ficam marcados como "estimado")
  "rendas_fixas":        [{"descricao": "Salário", "padrao": "TEXTO DO EXTRATO", "dia": 15, "valor": 650000, "inicio": "AAAA-MM"}]
  "competencia":         [{"conta": "bb", "data": "AAAA-MM-DD", "valor": -290000, "mes": "AAAA-MM"}]
  "previstos":           [{"mes": "AAAA-MM", "ate": "AAAA-MM", "dia": 29, "descricao": "...", "valor": -290000}]
                          (com "chave_auto", ajusta um previsto automático; "mes": "*" vale para todos os meses)
  "orcamento":           "realista"   grava o orçado sugerido pelo gasto real (tela Plano) em cada categoria
Pode rodar de novo: nada duplica.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

from nucleo import db
from nucleo.categorizar import Classificador
from nucleo.importacao import Lote, resumo_texto
from nucleo.util import agora_iso, chave_estabelecimento


def copiar(entrada: Path, pares: list[str]) -> list[Path]:
    copiados = []
    for par in pares:
        conta, _, caminho = par.partition("=")
        origem = Path(caminho).expanduser()
        if not conta or not origem.is_file():
            raise SystemExit(f"Argumento inválido (use conta=arquivo): {par}")
        limpo = re.sub(r"^[0-9a-f]{8}-", "", origem.name)          # tira o prefixo do anexo
        destino = entrada / conta / limpo
        destino.parent.mkdir(parents=True, exist_ok=True)
        if not destino.exists() or destino.read_bytes() != origem.read_bytes():
            shutil.copyfile(origem, destino)
        copiados.append(destino)
    return copiados


def aplicar_dividas(con, aj: dict) -> list[str]:
    log = []
    for d in aj.get("dividas_atualizar", []):
        campos = d["campos"]
        cur = con.execute(f"UPDATE dividas SET {', '.join(k + ' = ?' for k in campos)} WHERE nome = ?",
                          (*campos.values(), d["nome"]))
        log.append(f"{'atualizada' if cur.rowcount else 'NÃO ENCONTRADA'}: {d['nome']}")
    for d in aj.get("dividas_novas", []):
        if con.execute("SELECT 1 FROM dividas WHERE nome = ?", (d["nome"],)).fetchone():
            continue
        d = {**d, "criado_em": agora_iso()}
        d.setdefault("data_base", agora_iso()[:10])
        con.execute(f"INSERT INTO dividas ({', '.join(d)}) VALUES ({', '.join('?' * len(d))})", tuple(d.values()))
        log.append(f"nova: {d['nome']}")
    for n in aj.get("negociacoes", []):
        r = con.execute("SELECT id FROM dividas WHERE nome = ?", (n["divida"],)).fetchone()
        if r and not con.execute("SELECT 1 FROM negociacoes WHERE divida_id = ? AND data = ? AND texto = ?",
                                 (r["id"], n["data"], n["texto"])).fetchone():
            con.execute("INSERT INTO negociacoes (divida_id, data, texto) VALUES (?,?,?)",
                        (r["id"], n["data"], n["texto"]))
    con.commit()
    return log


def aplicar_classificacoes(con, aj: dict) -> int:
    """Lançamentos avulsos que vocês classificaram e que não viram regra (ex.: um Pix anulado)."""
    n = 0
    for c in aj.get("classificar", []):
        cid = db.categoria_id(con, c["categoria"])
        tipo = "transferencia" if c["categoria"] == "Transferência entre contas" else "normal"
        cur = con.execute("""UPDATE transacoes SET categoria_id = ?, tipo = ?, classificacao = 'manual', motivo_duvida = NULL,
                             observacao = ? WHERE conta_id = (SELECT id FROM contas WHERE apelido = ?) AND data = ?
                             AND ABS(valor) = ? AND classificacao = 'duvida'""",
                          (cid, tipo, c.get("observacao"), c["conta"], c["data"], c["valor"]))
        n += cur.rowcount
    con.commit()
    return n


def aplicar_portadores(con, aj: dict) -> int:
    """Quem usa cada cartão (final do cartão no extrato -> pessoa)."""
    n = 0
    for p in aj.get("portadores", []):
        conta = con.execute("SELECT id FROM contas WHERE apelido = ?", (p["conta"],)).fetchone()
        pessoa = db.pessoa_id(con, p["pessoa"])
        if conta and pessoa and not con.execute("SELECT 1 FROM portadores WHERE conta_id = ? AND padrao = ?",
                                                (conta["id"], p["padrao"])).fetchone():
            con.execute("INSERT INTO portadores (conta_id, pessoa_id, padrao, papel) VALUES (?,?,?,?)",
                        (conta["id"], pessoa, p["padrao"], p.get("papel", "titular")))
            n += 1
    con.commit()
    return n


def aplicar_regras(con, aj: dict) -> int:
    n = 0
    for r in aj.get("regras", []):
        if con.execute("SELECT 1 FROM regras WHERE padrao = ? AND origem = 'manual'", (r["padrao"],)).fetchone():
            continue
        con.execute("INSERT INTO regras (padrao, categoria_id, escopo, tipo, sinal, origem, criado_em) "
                    "VALUES (?,?,?,?,?, 'manual', ?)",
                    (r["padrao"], db.categoria_id(con, r["categoria"]), r.get("escopo"), r.get("tipo"),
                     r.get("sinal"), agora_iso()))
        n += 1
    con.commit()
    return n


def aplicar_estimados(con, aj: dict) -> int:
    novos = 0
    cl = Classificador(con)
    for e in aj.get("lancamentos_estimados", []):
        conta = con.execute("SELECT * FROM contas WHERE apelido = ?", (e["conta"],)).fetchone()
        h = hashlib.sha1(f"estimado|{conta['id']}|{e['data']}|{e['valor']}|{e['descricao']}".encode()).hexdigest()
        if con.execute("SELECT 1 FROM transacoes WHERE hash = ?", (h,)).fetchone():
            continue
        cat = db.categoria_id(con, e["categoria"]) if e.get("categoria") else None
        tipo = "normal"
        if cat is None:
            r = cl.classificar({"descricao": e["descricao"], "valor": e["valor"], "conta_id": conta["id"],
                                "chave": chave_estabelecimento(e["descricao"])}, conta["tipo"])
            cat, tipo = r["categoria_id"], r["tipo"]
        con.execute("""INSERT INTO transacoes (conta_id, data, descricao, chave, valor, pessoa_id, categoria_id, tipo,
                       escopo, classificacao, estimado, observacao, hash, criado_em)
                       VALUES (?,?,?,?,?,?,?,?,?, 'regra', 1, ?, ?, ?)""",
                    (conta["id"], e["data"], e["descricao"], chave_estabelecimento(e["descricao"]), e["valor"],
                     conta["titular_id"], cat, tipo, e.get("escopo", "pessoal"),
                     e.get("observacao", "Estimado: sem extrato nesse período."), h, agora_iso()))
        novos += 1
    con.commit()
    return novos


def aplicar_rendas(con, aj: dict) -> int:
    """Entradas que se repetem (salários), com valor e dia editáveis depois pelo app."""
    from nucleo import rendas
    n = 0
    for r in aj.get("rendas_fixas", []):
        if not con.execute("SELECT 1 FROM rendas_fixas WHERE descricao = ? AND inicio = ? AND dia = ?",
                           (r["descricao"], r["inicio"], r["dia"])).fetchone():
            rendas.criar(con, r)
            n += 1
    return n


def aplicar_competencias(con, aj: dict) -> int:
    """Lançamentos que contam em outro mês (ex.: salário de outubro pago em 28/09)."""
    n = 0
    for c in aj.get("competencia", []):
        cur = con.execute("""UPDATE transacoes SET competencia = ?, observacao = COALESCE(?, observacao)
                             WHERE conta_id = (SELECT id FROM contas WHERE apelido = ?) AND data = ? AND valor = ?""",
                          (c["mes"], c.get("observacao"), c["conta"], c["data"], c["valor"]))
        n += cur.rowcount
    db.atualizar_mes_ref(con)
    return n


def aplicar_previstos(con, aj: dict) -> int:
    from nucleo import previstos
    n = 0
    for p in aj.get("previstos", []):
        if p.get("chave_auto"):
            previstos.salvar(con, p)
            n += 1
        elif not con.execute("SELECT 1 FROM previstos WHERE chave_auto IS NULL AND mes = ? AND descricao = ?",
                             (p["mes"], p["descricao"])).fetchone():
            previstos.salvar(con, p)
            n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("arquivos", nargs="*", help="conta=caminho (contas: inter-conta, inter-cartao, bb, itau, "
                                                "flash, nubank, planilha)")
    ap.add_argument("--ajustes", help="JSON local com dívidas, estimativas e configurações")
    ap.add_argument("--banco", default=str(db.BANCO_REAL))
    ap.add_argument("--entrada", default=str(db.ENTRADA_REAL))
    a = ap.parse_args()
    con = db.conectar(a.banco)
    entrada = Path(a.entrada)
    copiar(entrada, a.arquivos)
    aj = json.loads(Path(a.ajustes).read_text(encoding="utf-8")) if a.ajustes else {}
    for k, v in aj.get("config", {}).items():
        db.definir_config(con, k, json.dumps(v) if isinstance(v, list) else v)
    aplicar_regras(con, aj)          # antes de importar: já entram classificados
    aplicar_portadores(con, aj)
    lote = Lote(con)
    lote.pasta(entrada)
    print("\n".join(aplicar_dividas(con, aj)))
    print(f"{aplicar_estimados(con, aj)} lançamento(s) estimado(s) criado(s)")
    r = lote.finalizar()
    if aplicar_classificacoes(con, aj):
        from nucleo import alertas
        alertas.gerar(con)
        r["duvidas"] = con.execute("SELECT COUNT(*) FROM transacoes WHERE classificacao='duvida'").fetchone()[0]
    aplicar_competencias(con, aj)
    aplicar_rendas(con, aj)
    aplicar_previstos(con, aj)
    if aj.get("orcamento") == "realista":
        from nucleo import alertas, planejamento
        sug = planejamento.orcamento_sugerido(con)
        planejamento.aplicar_orcamento(con, [{"id": i["id"], "orcamento": i["sugestao"]} for i in sug["itens"]])
        alertas.gerar(con)
    print(resumo_texto(r))
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
