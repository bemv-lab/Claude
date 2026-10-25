"""Análises: recorrentes/assinaturas, parcelamentos em aberto, totais por mês e categoria."""
from __future__ import annotations

from datetime import date
from statistics import mean, median

from .db import linhas
from .util import hoje, limites_mes, normalizar, somar_meses

# Lançamentos que contam como gasto/renda (fora transferências, faturas, aplicações e o cartão-benefício).
FILTRO_REAL = "t.tipo = 'normal' AND c.tipo != 'beneficio'"


def totais_mes(con, mes: str) -> dict:
    """Totais do mês em regime de caixa: cartão pelo mês da fatura (t.mes_ref)."""
    r = con.execute(f"""
        SELECT
          COALESCE(SUM(CASE WHEN t.valor > 0 AND cat.tipo = 'receita' THEN t.valor END), 0) AS receitas,
          COALESCE(SUM(CASE WHEN (cat.tipo IN ('despesa','divida')) OR (t.categoria_id IS NULL AND t.valor < 0)
                       THEN -t.valor END), 0) AS despesas,
          COALESCE(SUM(CASE WHEN cat.tipo = 'divida' THEN -t.valor END), 0) AS dividas,
          COALESCE(SUM(CASE WHEN t.escopo = 'negocio' AND cat.tipo = 'despesa' THEN -t.valor END), 0) AS negocio,
          COALESCE(SUM(CASE WHEN t.categoria_id IS NULL AND t.valor > 0 THEN t.valor END), 0) AS entradas_pendentes,
          COALESCE(SUM(CASE WHEN c.tipo = 'cartao' AND t.valor < 0 THEN -t.valor END), 0) AS cartao
        FROM transacoes t JOIN contas c ON c.id = t.conta_id
        LEFT JOIN categorias cat ON cat.id = t.categoria_id
        WHERE {FILTRO_REAL} AND t.mes_ref = ?""", (mes,)).fetchone()
    return dict(r)


def gasto_por_categoria(con, mes: str) -> list[dict]:
    return [dict(r) for r in con.execute(f"""
        SELECT COALESCE(cat.id, 0) AS id, COALESCE(cat.nome, 'A classificar') AS nome,
               COALESCE(cat.cor, '#B9BEC7') AS cor, cat.orcamento AS orcamento, -SUM(t.valor) AS total, COUNT(*) AS qtd
        FROM transacoes t JOIN contas c ON c.id = t.conta_id
        LEFT JOIN categorias cat ON cat.id = t.categoria_id
        WHERE t.tipo = 'normal' AND t.mes_ref = ?
          AND (cat.tipo IN ('despesa','divida') OR (t.categoria_id IS NULL AND t.valor < 0))
        GROUP BY 1 HAVING total > 0 ORDER BY total DESC""", (mes,))]


def media_categorias(con, mes: str, meses: int = 3) -> dict[int, float]:
    """Média mensal por categoria nos `meses` anteriores a `mes` (só meses com dados)."""
    acum: dict[int, list[int]] = {}
    meses_com_dados = 0
    for k in range(1, meses + 1):
        m = somar_meses(mes, -k)
        linhas = gasto_por_categoria(con, m)
        if linhas:
            meses_com_dados += 1
        for l in linhas:
            acum.setdefault(l["id"], []).append(l["total"])
    if not meses_com_dados:
        return {}
    return {k: sum(v) / meses_com_dados for k, v in acum.items()}


def renda_media(con, mes: str, meses: int = 3) -> int:
    vals = [totais_mes(con, somar_meses(mes, -k))["receitas"] for k in range(1, meses + 1)]
    vals = [v for v in vals if v > 0]
    return int(mean(vals)) if vals else 0


def forma_pagamento(t: dict) -> str:
    """Como o lançamento foi pago, pelo tipo da conta e pelo texto do extrato."""
    d = normalizar(t.get("descricao") or "")
    if t.get("conta_tipo") == "cartao":
        return "Pix no crédito" if "PIX" in d else "Cartão"
    if t.get("conta_tipo") == "beneficio":
        return "Flash"
    if "PIX" in d:
        return "Pix"
    if "BOLETO" in d:
        return "Boleto"
    if "DEB AUT" in d or "DEBITO AUTOMATICO" in d or "CDC" in d:
        return "Débito automático"
    if "TED" in d.split() or "TRANSF" in d:
        return "Transferência"
    return "Débito em conta"


def recorrentes(con, meses: int = 6) -> list[dict]:
    """Mesma chave, valor parecido, em meses diferentes = gasto recorrente. Assinatura se a categoria for."""
    desde = limites_mes(somar_meses(hoje().strftime("%Y-%m"), -meses))[0]
    grupos: dict[str, list] = {}
    for r in con.execute("""
        SELECT t.chave, t.data, t.valor, t.descricao, t.conta_id, cat.nome AS categoria, cat.id AS categoria_id,
               cat.tipo AS categoria_tipo, co.nome AS conta, co.tipo AS conta_tipo, t.divida_id, t.escopo
        FROM transacoes t JOIN contas co ON co.id = t.conta_id LEFT JOIN categorias cat ON cat.id = t.categoria_id
        WHERE t.valor < 0 AND t.tipo = 'normal' AND t.parcela_total IS NULL AND t.data >= ?
          AND COALESCE(t.chave, '') != '' ORDER BY t.data""", (desde,)):
        grupos.setdefault(r["chave"], []).append(dict(r))
    out = []
    for chave, itens in grupos.items():
        por_mes: dict[str, list] = {}
        for i in itens:
            por_mes.setdefault(i["data"][:7], []).append(i)
        if len(por_mes) < 2:
            continue
        # um valor por mês (o mais parecido com a mediana)
        valores = [-min(v, key=lambda x: x["valor"])["valor"] for v in por_mes.values()]
        med = median(valores)
        parecidos = [v for v in valores if abs(v - med) <= max(med * 0.2, 300)]
        assinatura = itens[-1]["categoria"] == "Assinaturas"
        if len(parecidos) < (2 if assinatura else 3):
            continue
        if max(len(v) for v in por_mes.values()) > 2 and not assinatura:
            continue          # vários por mês = hábito (mercado, ifood), não conta fixa
        ultimo = itens[-1]
        out.append({
            "chave": chave, "descricao": ultimo["descricao"], "categoria": ultimo["categoria"],
            "categoria_id": ultimo["categoria_id"], "conta": ultimo["conta"], "forma": forma_pagamento(ultimo),
            "divida": bool(ultimo["divida_id"]) or ultimo["categoria_tipo"] == "divida", "escopo": ultimo["escopo"],
            "dia": int(median(int(i["data"][8:10]) for i in itens)),
            "valor_medio": int(mean(parecidos)), "meses": len(por_mes), "assinatura": assinatura,
            "primeira": itens[0]["data"], "ultima": ultimo["data"],
            "proxima": somar_meses(ultimo["data"][:7], 1) + ultimo["data"][7:],
        })
    out.sort(key=lambda x: -x["valor_medio"])
    return out


def mes_da_fatura(conta: dict, data_iso: str) -> str:
    """Mês em que o lançamento é pago: no cartão, o mês da fatura (depois do fechamento vai para a seguinte)."""
    from .db import mes_da_fatura as _m
    return _m(conta, data_iso)


def _ja_pago(conta: dict, mes: str, ref: date) -> bool:
    atual = ref.strftime("%Y-%m")
    if mes != atual:
        return mes < atual
    venc = conta["dia_vencimento"] if conta["tipo"] == "cartao" else None
    return not venc or ref.day >= venc


def parcelamentos(con, todos: bool = False) -> list[dict]:
    """Compras parceladas agrupadas, cada uma com todas as parcelas: as que já vieram nos extratos e as que ainda
    vão vir, cada parcela no mês em que é paga (no cartão, o mês da fatura).

    A mesma compra aparece com nomes diferentes conforme a fonte (fatura: "MERCADOLIVRE*MERCADOL"; planilha:
    "Mercado Livre") e com centavos de diferença entre parcelas. Por isso o agrupamento é pela conta, pelo
    total de parcelas, pelo valor (até 3% de diferença) e pela sequência: a parcela k+n cai n meses depois.
    Sem `todos`, devolve só as que ainda têm parcela a pagar."""
    contas = {r["id"]: dict(r) for r in con.execute("SELECT * FROM contas")}
    grupos: list[dict] = []
    por_chave: dict[tuple, list[dict]] = {}
    for r in con.execute("""
        SELECT t.*, co.nome AS conta, p.nome AS pessoa FROM transacoes t
        JOIN contas co ON co.id = t.conta_id LEFT JOIN pessoas p ON p.id = t.pessoa_id
        WHERE t.parcela_total IS NOT NULL AND t.valor < 0 AND t.tipo = 'normal'
        ORDER BY t.data, t.parcela_atual"""):
        valor = -r["valor"]
        candidatos = por_chave.setdefault((r["conta_id"], r["parcela_total"]), [])

        def serve(g):
            if abs(g["valor_parcela"] - valor) > max(100, g["valor_parcela"] * 0.03):
                return False
            passo = r["parcela_atual"] - g["parcela_atual"]
            meses = _meses_entre(g["ultima_data"][:7], r["data"][:7])
            return passo > 0 and abs(passo - meses) <= 1
        g = next((g for g in candidatos if serve(g)), None)
        oc = {"id": r["id"], "data": r["data"], "k": r["parcela_atual"], "valor": valor, "prevista": False,
              "mes": mes_da_fatura(contas[r["conta_id"]], r["data"])}
        if g is None:
            g = {"id": r["id"], "descricao": r["descricao"], "chave": r["chave"], "conta": r["conta"],
                 "conta_id": r["conta_id"], "conta_tipo": contas[r["conta_id"]]["tipo"],
                 "pessoa": r["pessoa"], "valor_parcela": valor, "parcela_atual": r["parcela_atual"],
                 "parcela_total": r["parcela_total"], "ultima_data": r["data"], "primeira_vista": r["data"],
                 "parcela_inicial": r["parcela_atual"], "produto": r["produto"], "categoria_id": r["categoria_id"],
                 "ocorrencias": [oc]}
            candidatos.append(g)
            grupos.append(g)
        else:
            g.update(id=r["id"], valor_parcela=valor, parcela_atual=r["parcela_atual"], ultima_data=r["data"],
                     chave=r["chave"], produto=g["produto"] or r["produto"])
            g["ocorrencias"].append(oc)
    ref = hoje()
    out = []
    for g in grupos:
        conta = contas[g["conta_id"]]
        oc = g["ocorrencias"]
        ult = oc[-1]
        for j in range(1, g["parcela_total"] - ult["k"] + 1):      # as que ainda não vieram em nenhum arquivo
            oc.append({"id": None, "data": None, "k": ult["k"] + j, "valor": g["valor_parcela"], "prevista": True,
                       "mes": somar_meses(ult["mes"], j)})
        for o in oc:
            o["pago"] = _ja_pago(conta, o["mes"], ref)
        abertas = [o for o in oc if not o["pago"]]
        g["faltam"] = len(abertas)
        g["restante"] = sum(o["valor"] for o in abertas)
        g["pagas"] = max((o["k"] for o in oc if o["pago"]), default=oc[0]["k"] - 1)
        g["parcela_atual"] = g["pagas"]
        g["proxima"] = abertas[0] if abertas else None
        g["total_compra"] = g["parcela_total"] * g["valor_parcela"]
        g["termina"] = oc[-1]["mes"]
        if todos or g["faltam"] > 0:
            out.append(g)
    out.sort(key=lambda x: -x["restante"])
    return out


def agenda_parcelas(con, inicio: str, meses: int) -> list[dict]:
    """Total de parcelas pago em cada mês (no cartão, pela fatura), já lançadas ou ainda por vir."""
    agenda = {somar_meses(inicio, k): {"valor": 0, "qtd": 0} for k in range(meses)}
    for g in parcelamentos(con, todos=True):
        for o in g["ocorrencias"]:
            if o["mes"] in agenda:
                agenda[o["mes"]]["valor"] += o["valor"]
                agenda[o["mes"]]["qtd"] += 1
    return [{"mes": m, **v} for m, v in agenda.items()]


def parcelas_do_mes(con, mes: str) -> list[dict]:
    """Cada parcela paga em `mes`, com a compra a que pertence."""
    out = []
    for g in parcelamentos(con, todos=True):
        for o in g["ocorrencias"]:
            if o["mes"] == mes:
                out.append({"grupo_id": g["id"], "descricao": g["descricao"], "produto": g["produto"],
                            "conta": g["conta"], "pessoa": g["pessoa"], "k": o["k"], "n": g["parcela_total"],
                            "valor": o["valor"], "data_compra": g["primeira_vista"], "prevista": o["prevista"],
                            "pago": o["pago"], "termina": g["termina"], "nova": o["k"] == 1,
                            "ultima": o["k"] == g["parcela_total"], "restante_depois": sum(
                                x["valor"] for x in g["ocorrencias"] if x["mes"] > mes)})
    out.sort(key=lambda x: -x["valor"])
    return out


def _meses_entre(a: str, b: str) -> int:
    ya, ma = map(int, a.split("-"))
    yb, mb = map(int, b.split("-"))
    return (yb - ya) * 12 + (mb - ma)


def compromisso_futuro_parcelas(con, meses: int = 6) -> list[dict]:
    """Quanto das próximas faturas já está tomado por parcelas (a partir do mês que vem)."""
    return [{"mes": a["mes"], "valor": a["valor"]}
            for a in agenda_parcelas(con, somar_meses(hoje().strftime("%Y-%m"), 1), meses)]


# ---------------------------------------------------------------- marketplaces

MARKETPLACES = ["AMAZON", "AMAZONMKTPLC", "AMAZONMKTCPI", "MERCADOLIVRE", "MERCADO LIVRE", "MERCADOLIV", "MELI",
                "PONTOCOMSHOP", "SHOPEE", "SHEIN", "ALIEXPRESS", "ALIPAY", "MAGALU", "MAGAZINE LUIZA", "MAGAZINELUIZA",
                "AMERICANAS COM", "TEMU", "CASAS BAHIA", "KABUM", "NETSHOES", "ZATTINI", "SUBMARINO", "ELO7"]
_NAO_MARKETPLACE = ["AMAZONPRIME", "AMAZON PRIME", "PRIME VIDEO", "AMAZON WEB", "AWS", "KINDLE UNLIMITED"]


def eh_marketplace(descricao: str) -> bool:
    d = f" {normalizar(descricao).replace('/', ' ')} "
    compacto = d.replace(" ", "")
    if any(n.replace(" ", "") in compacto for n in _NAO_MARKETPLACE):
        return False
    return any(f" {m} " in d or (len(m) > 6 and m.replace(" ", "") in compacto) for m in MARKETPLACES)


def compras_marketplace(con, so_sem_produto: bool = False, limite: int = 200) -> list[dict]:
    """Compras em marketplace, uma linha por compra (parceladas aparecem uma vez, pela primeira parcela vista)."""
    grupos = {o["id"]: g for g in parcelamentos(con, todos=True) for o in g["ocorrencias"] if o["id"]}
    vistos, out = set(), []
    for t in linhas(con.execute(
            """SELECT t.id, t.data, t.descricao, t.produto, -t.valor AS valor, t.parcela_atual, t.parcela_total,
                      c.nome AS conta, p.nome AS pessoa FROM transacoes t JOIN contas c ON c.id = t.conta_id
               LEFT JOIN pessoas p ON p.id = t.pessoa_id
               WHERE t.valor < 0 AND t.tipo = 'normal' ORDER BY t.data DESC, t.id DESC""")):
        if not eh_marketplace(t["descricao"]):
            continue
        g = grupos.get(t["id"])
        if g:
            if g["id"] in vistos:
                continue
            vistos.add(g["id"])
            t.update(produto=g["produto"], total=g["total_compra"], data_compra=g["primeira_vista"])
        if so_sem_produto and t["produto"]:
            continue
        out.append(t)
    out.sort(key=lambda x: x.get("data_compra") or x["data"], reverse=True)
    return out[:limite]


def salvar_produto(con, tx_id: int, produto: str) -> int:
    """Grava o que foi comprado; numa compra parcelada, vale para todas as parcelas."""
    ids = [tx_id]
    for g in parcelamentos(con, todos=True):
        oc = [o["id"] for o in g["ocorrencias"] if o["id"]]
        if tx_id in oc:
            ids = oc
            break
    con.executemany("UPDATE transacoes SET produto = ? WHERE id = ?", [((produto or "").strip() or None, i) for i in ids])
    con.commit()
    return len(ids)
