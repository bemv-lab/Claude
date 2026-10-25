"""Categorização: regras determinísticas -> heurísticas -> fila de dúvidas. Aprende com cada clique."""
from __future__ import annotations

import json

from .db import config
from .util import agora_iso, chave_estabelecimento, normalizar

# Categoria que o próprio banco manda no CSV (Inter, Nubank...) -> nossa categoria.
CATEGORIA_EXTERNA = {
    "RESTAURANTE": "Alimentação fora", "RESTAURANTES": "Alimentação fora", "ALIMENTACAO": "Alimentação fora",
    "LANCHONETE": "Alimentação fora", "SUPERMERCADO": "Mercado", "SUPERMERCADOS": "Mercado",
    "MERCADO": "Mercado", "TRANSPORTE": "Transporte", "TRANSPORTES": "Transporte", "COMBUSTIVEL": "Transporte",
    "POSTO DE GASOLINA": "Transporte", "SAUDE": "Saúde", "FARMACIA": "Saúde", "DROGARIA": "Saúde",
    "VESTUARIO": "Compras", "COMPRAS": "Compras", "ELETRONICOS": "Compras", "LOJA DE DEPARTAMENTO": "Compras",
    "LAZER": "Lazer", "ENTRETENIMENTO": "Lazer", "VIAGEM": "Lazer", "TURISMO": "Lazer", "HOTEL": "Lazer",
    "EDUCACAO": "Educação", "CASA": "Casa e manutenção", "CONSTRUCAO": "Casa e manutenção",
    "SERVICOS": None, "OUTROS": None, "DIVERSOS": None,
}



class Classificador:
    def __init__(self, con):
        self.con = con
        regras = [dict(r) for r in con.execute(
            "SELECT * FROM regras WHERE categoria_id IS NOT NULL OR tipo IS NOT NULL")]
        peso = {"manual": 3, "aprendida": 2, "semente": 1}
        self.regras = sorted(regras, key=lambda r: (peso.get(r["origem"], 1), len(r["padrao"])), reverse=True)
        self.nomes_casal = [normalizar(n) for n in json.loads(config(con, "nomes_casal", "[]") or "[]")]
        self.cat = {r["nome"]: r["id"] for r in con.execute("SELECT id, nome FROM categorias")}
        self.cat_tipo = {r["id"]: r["tipo"] for r in con.execute("SELECT id, tipo FROM categorias")}
        # primeiro nome do titular de cada conta (Pix "para si mesmo" é transferência entre contas dele)
        self.titular = {r["id"]: normalizar(r["nome"] or "").split(" ")[0]
                        for r in con.execute("SELECT c.id, p.nome FROM contas c LEFT JOIN pessoas p ON p.id = c.titular_id")}

    def _casa(self, regra, alvo_desc, alvo_chave, valor, conta_id):
        if regra["sinal"] == "saida" and valor > 0 or regra["sinal"] == "entrada" and valor < 0:
            return False
        if regra["conta_id"] and regra["conta_id"] != conta_id:
            return False
        p = f" {regra['padrao']} "
        return p in alvo_desc or p in alvo_chave

    def classificar(self, tx: dict, conta_tipo: str) -> dict:
        """Recebe descricao/valor/conta_id/categoria_externa; devolve os campos de classificação."""
        desc_n = normalizar(tx["descricao"])
        alvo_desc = f" {desc_n.replace('/', ' ')} "
        alvo_chave = f" {tx.get('chave') or chave_estabelecimento(tx['descricao'])} "
        valor = tx["valor"]
        res = {"categoria_id": None, "tipo": "normal", "escopo": "pessoal", "classificacao": "duvida",
               "sugestao_id": None, "motivo_duvida": None, "regra_id": None}

        # 1) regras (aprendidas vencem as de fábrica; a mais específica vence)
        achadas = [r for r in self.regras if self._casa(r, alvo_desc, alvo_chave, valor, tx.get("conta_id"))]
        if achadas:
            topo = achadas[0]
            empatadas = [r for r in achadas if r["origem"] == topo["origem"] and len(r["padrao"]) == len(topo["padrao"])
                         and r["categoria_id"] != topo["categoria_id"]]
            if empatadas:
                res.update(sugestao_id=topo["categoria_id"],
                           motivo_duvida="Mais de uma regra serve para este lançamento.")
                return res
            res.update(categoria_id=topo["categoria_id"], tipo=topo["tipo"] or "normal",
                       escopo=topo["escopo"] or "pessoal", classificacao="regra", regra_id=topo["id"])
            if topo["pessoa_id"]:
                res["pessoa_id"] = topo["pessoa_id"]
            if res["tipo"] == "fatura":
                res["categoria_id"] = self.cat.get("Pagamento de fatura")
            return res

        # 2) heurísticas
        if conta_tipo == "beneficio" and valor > 0:
            res.update(categoria_id=self.cat.get("Benefícios"), tipo="beneficio", classificacao="heuristica")
            return res
        ext = normalizar(tx.get("categoria_externa") or "")
        if ext and valor < 0:
            nome = CATEGORIA_EXTERNA.get(ext)
            if nome is None:
                nome = next((v for k, v in CATEGORIA_EXTERNA.items() if v and k in ext), None)
            if nome:
                res.update(categoria_id=self.cat.get(nome), classificacao="heuristica")
                return res
        if "ESTORNO" in desc_n or "REEMBOLSO" in desc_n or "CANCELAMENTO" in desc_n:
            res["motivo_duvida"] = "Estorno ou reembolso: de qual categoria era a compra?"
            return res
        tem_transf = any(w.startswith(("PIX", "TRANSF")) or w in ("TED", "DOC", "TEF") for w in desc_n.split())
        dono = self.titular.get(tx.get("conta_id"))
        if tem_transf and dono and dono != "CASAL" and f" {dono} " in alvo_desc:
            res.update(categoria_id=self.cat.get("Transferência entre contas"), tipo="transferencia",
                       classificacao="heuristica")
            return res
        if tem_transf and any(n and n in alvo_chave for n in self.nomes_casal):
            res.update(sugestao_id=self.cat.get("Transferência entre contas"),
                       motivo_duvida="Parece transferência entre vocês. Confirma?")
            return res
        if conta_tipo == "cartao" and valor > 0:
            if "PAGAMENTO" in desc_n or "PAGTO" in desc_n:
                res.update(categoria_id=self.cat.get("Pagamento de fatura"), tipo="fatura", classificacao="heuristica")
            else:
                res["motivo_duvida"] = "Crédito no cartão: estorno de compra ou pagamento da fatura?"
            return res
        if valor > 0:
            res["motivo_duvida"] = "Dinheiro entrando: é renda, reembolso ou transferência?"
        elif tem_transf:
            res["motivo_duvida"] = "Pix/transferência para alguém: o que foi?"
        else:
            res["motivo_duvida"] = "Estabelecimento novo."
        return res


def aprender(con, tx_id: int, categoria_id_: int | None, pessoa_id: int | None = None,
             escopo: str | None = None, tipo: str | None = None, lembrar: bool = True,
             divida_id: int | None = None) -> dict:
    """Classifica um lançamento e, se `lembrar`, cria a regra e aplica nos parecidos da fila."""
    tx = con.execute("SELECT t.*, c.tipo AS conta_tipo FROM transacoes t JOIN contas c ON c.id = t.conta_id "
                     "WHERE t.id = ?", (tx_id,)).fetchone()
    if not tx:
        raise ValueError("Lançamento não encontrado")
    cat_tipo = None
    if categoria_id_:
        r = con.execute("SELECT nome, tipo FROM categorias WHERE id = ?", (categoria_id_,)).fetchone()
        cat_tipo = r["tipo"]
        if tipo is None:
            tipo = {"transferencia": "fatura" if r["nome"] == "Pagamento de fatura" else "transferencia",
                    "investimento": "investimento"}.get(cat_tipo, "beneficio" if tx["conta_tipo"] == "beneficio"
                                                     and tx["valor"] > 0 and cat_tipo == "receita" else "normal")
    tipo = tipo or "normal"
    escopo = escopo or tx["escopo"] or "pessoal"
    campos = dict(categoria_id=categoria_id_, tipo=tipo, escopo=escopo, classificacao="manual",
                  motivo_duvida=None, sugestao_id=None)
    if pessoa_id:
        campos["pessoa_id"] = pessoa_id
    if divida_id is not None:
        campos["divida_id"] = divida_id or None
    con.execute(f"UPDATE transacoes SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                (*campos.values(), tx_id))
    if divida_id:
        con.execute("INSERT OR IGNORE INTO pagamentos_divida (divida_id, data, valor, transacao_id) "
                    "VALUES (?,?,?,?)", (divida_id, tx["data"], abs(tx["valor"]), tx_id))
    parecidos = 0
    chave = tx["chave"]
    if lembrar and chave and len(chave) >= 3:
        sinal = "entrada" if tx["valor"] > 0 else "saida"
        existente = con.execute("SELECT id FROM regras WHERE padrao = ? AND origem != 'semente' "
                                "AND COALESCE(sinal,'') = ?", (chave, sinal)).fetchone()
        if existente:
            con.execute("UPDATE regras SET categoria_id = ?, escopo = ?, tipo = ?, usos = usos + 1 WHERE id = ?",
                        (categoria_id_, escopo, tipo, existente["id"]))
        else:
            con.execute("INSERT INTO regras (padrao, categoria_id, escopo, tipo, sinal, origem, usos, criado_em) "
                        "VALUES (?,?,?,?,?, 'aprendida', 1, ?)",
                        (chave, categoria_id_, escopo, tipo, sinal, agora_iso()))
        cur = con.execute(
            "UPDATE transacoes SET categoria_id = ?, tipo = ?, escopo = ?, classificacao = 'regra', "
            "motivo_duvida = NULL, sugestao_id = NULL "
            "WHERE chave = ? AND classificacao = 'duvida' AND id != ? AND (valor > 0) = ?",
            (categoria_id_, tipo, escopo, chave, tx_id, tx["valor"] > 0))
        parecidos = cur.rowcount
    con.commit()
    return {"ok": True, "parecidos": parecidos, "categoria_tipo": cat_tipo}


def reclassificar_duvidas(con) -> int:
    """Passa as regras atuais de novo na fila (útil depois de criar/editar regras)."""
    cl = Classificador(con)
    n = 0
    for tx in con.execute("SELECT t.*, c.tipo AS conta_tipo FROM transacoes t JOIN contas c ON c.id = t.conta_id "
                          "WHERE t.classificacao = 'duvida'").fetchall():
        r = cl.classificar(dict(tx), tx["conta_tipo"])
        if r["classificacao"] != "duvida":
            con.execute("UPDATE transacoes SET categoria_id=?, tipo=?, escopo=?, classificacao=?, motivo_duvida=NULL, "
                        "sugestao_id=NULL WHERE id=?",
                        (r["categoria_id"], r["tipo"], r["escopo"], r["classificacao"], tx["id"]))
            n += 1
    con.commit()
    return n



def estornos_de_cartao(con, janela_dias: int = 90) -> int:
    """Crédito no cartão sem regra (estorno/devolução): leva a categoria da compra da mesma loja."""
    n = 0
    for t in con.execute("""SELECT t.* FROM transacoes t JOIN contas c ON c.id = t.conta_id
                            WHERE c.tipo = 'cartao' AND t.valor > 0 AND t.classificacao = 'duvida'
                            AND COALESCE(t.chave, '') != ''""").fetchall():
        compra = con.execute("""SELECT categoria_id, escopo FROM transacoes WHERE conta_id = ? AND chave = ? AND valor < 0
                                AND categoria_id IS NOT NULL AND ABS(julianday(data) - julianday(?)) <= ?
                                ORDER BY ABS(julianday(data) - julianday(?)) LIMIT 1""",
                             (t["conta_id"], t["chave"], t["data"], janela_dias, t["data"])).fetchone()
        if compra:
            con.execute("UPDATE transacoes SET categoria_id = ?, escopo = ?, classificacao = 'heuristica', "
                        "motivo_duvida = NULL, sugestao_id = NULL, observacao = 'Estorno da compra' WHERE id = ?",
                        (compra["categoria_id"], compra["escopo"], t["id"]))
            n += 1
    con.commit()
    return n


def reaplicar_manuais(con) -> int:
    """As regras que vocês criaram valem sobre a categoria que veio da planilha antiga ou de uma regra aprendida
    (ex.: Netflix estava em Lazer na planilha; vocês decidiram que é Assinaturas)."""
    regras = [dict(r) for r in con.execute(
        "SELECT r.* FROM regras r JOIN categorias c ON c.id = r.categoria_id WHERE r.origem = 'manual' "
        "AND r.tipo IS NULL AND c.tipo IN ('despesa','receita','divida') ORDER BY LENGTH(r.padrao) DESC")]
    if not regras:
        return 0
    n = 0
    for t in con.execute("SELECT id, descricao, chave, valor, conta_id, categoria_id, escopo FROM transacoes "
                         "WHERE classificacao IN ('importada','regra','heuristica') AND tipo = 'normal'").fetchall():
        alvo_desc = f" {normalizar(t['descricao']).replace('/', ' ')} "
        alvo_chave = f" {t['chave'] or ''} "
        for r in regras:
            if r["sinal"] == "saida" and t["valor"] > 0 or r["sinal"] == "entrada" and t["valor"] < 0:
                continue
            if r["conta_id"] and r["conta_id"] != t["conta_id"]:
                continue
            p = f" {r['padrao']} "
            if p in alvo_desc or p in alvo_chave:
                escopo = r["escopo"] or t["escopo"]
                if (r["categoria_id"], escopo) != (t["categoria_id"], t["escopo"]):
                    con.execute("UPDATE transacoes SET categoria_id = ?, escopo = ? WHERE id = ?",
                                (r["categoria_id"], escopo, t["id"]))
                    n += 1
                break
    con.commit()
    return n
