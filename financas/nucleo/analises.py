"""Análises: recorrentes/assinaturas, parcelamentos em aberto, totais por mês e categoria."""
from __future__ import annotations

from statistics import mean, median

from .util import hoje, limites_mes, somar_meses

# Lançamentos que contam como gasto/renda (fora transferências, faturas, aplicações e o cartão-benefício).
FILTRO_REAL = "t.tipo = 'normal' AND c.tipo != 'beneficio'"


def totais_mes(con, mes: str) -> dict:
    ini, fim = limites_mes(mes)
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
        WHERE {FILTRO_REAL} AND t.data BETWEEN ? AND ?""", (ini, fim)).fetchone()
    return dict(r)


def gasto_por_categoria(con, mes: str) -> list[dict]:
    ini, fim = limites_mes(mes)
    return [dict(r) for r in con.execute(f"""
        SELECT COALESCE(cat.id, 0) AS id, COALESCE(cat.nome, 'A classificar') AS nome,
               COALESCE(cat.cor, '#B9BEC7') AS cor, cat.orcamento AS orcamento, -SUM(t.valor) AS total, COUNT(*) AS qtd
        FROM transacoes t JOIN contas c ON c.id = t.conta_id
        LEFT JOIN categorias cat ON cat.id = t.categoria_id
        WHERE t.tipo = 'normal' AND t.data BETWEEN ? AND ?
          AND (cat.tipo IN ('despesa','divida') OR (t.categoria_id IS NULL AND t.valor < 0))
        GROUP BY 1 HAVING total > 0 ORDER BY total DESC""", (ini, fim))]


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


def recorrentes(con, meses: int = 6) -> list[dict]:
    """Mesma chave, valor parecido, em meses diferentes = gasto recorrente. Assinatura se a categoria for."""
    desde = limites_mes(somar_meses(hoje().strftime("%Y-%m"), -meses))[0]
    grupos: dict[str, list] = {}
    for r in con.execute("""
        SELECT t.chave, t.data, t.valor, t.descricao, t.conta_id, cat.nome AS categoria, cat.id AS categoria_id,
               co.nome AS conta
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
            "categoria_id": ultimo["categoria_id"], "conta": ultimo["conta"],
            "valor_medio": int(mean(parecidos)), "meses": len(por_mes), "assinatura": assinatura,
            "primeira": itens[0]["data"], "ultima": ultimo["data"],
            "proxima": somar_meses(ultimo["data"][:7], 1) + ultimo["data"][7:],
        })
    out.sort(key=lambda x: -x["valor_medio"])
    return out


def parcelamentos(con) -> list[dict]:
    """Compras parceladas agrupadas, com o que ainda falta pagar (renda futura comprometida).

    A mesma compra aparece com nomes diferentes conforme a fonte (fatura: "MERCADOLIVRE*MERCADOL"; planilha:
    "Mercado Livre") e com centavos de diferença entre parcelas. Por isso o agrupamento é pela conta, pelo
    total de parcelas, pelo valor (até 3% de diferença) e pela sequência: a parcela k+n cai n meses depois."""
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
        if g is None:
            g = {"id": r["id"], "descricao": r["descricao"], "chave": r["chave"], "conta": r["conta"],
                 "pessoa": r["pessoa"], "valor_parcela": valor, "parcela_atual": r["parcela_atual"],
                 "parcela_total": r["parcela_total"], "ultima_data": r["data"], "primeira_vista": r["data"],
                 "parcela_inicial": r["parcela_atual"]}
            candidatos.append(g)
            grupos.append(g)
        else:
            g.update(id=r["id"], descricao=r["descricao"], valor_parcela=valor, parcela_atual=r["parcela_atual"],
                     ultima_data=r["data"], chave=r["chave"])
    out = []
    mes_atual = hoje().strftime("%Y-%m")
    for g in grupos:
        # parcela vista pela última vez meses atrás já andou (o extrato daquele mês pode não ter vindo)
        passados = max(0, _meses_entre(g["ultima_data"][:7], mes_atual))
        faltam = max(0, g["parcela_total"] - g["parcela_atual"] - passados)
        g["parcela_atual"] = g["parcela_total"] - faltam if passados else g["parcela_atual"]
        g["ultima_data"] = max(g["ultima_data"], f"{mes_atual}-01") if passados else g["ultima_data"]
        g["faltam"] = faltam
        g["restante"] = faltam * g["valor_parcela"]
        g["total_compra"] = g["parcela_total"] * g["valor_parcela"]
        g["termina"] = somar_meses(g["ultima_data"][:7], faltam)
        if faltam > 0 or g["ultima_data"][:7] >= hoje().strftime("%Y-%m"):
            out.append(g)
    out.sort(key=lambda x: -x["restante"])
    return out


def _meses_entre(a: str, b: str) -> int:
    ya, ma = map(int, a.split("-"))
    yb, mb = map(int, b.split("-"))
    return (yb - ya) * 12 + (mb - ma)


def compromisso_futuro_parcelas(con, meses: int = 6) -> list[dict]:
    """Quanto das próximas faturas já está tomado por parcelas."""
    base = hoje().strftime("%Y-%m")
    agenda = {somar_meses(base, k): 0 for k in range(1, meses + 1)}
    for p in parcelamentos(con):
        for k in range(1, p["faltam"] + 1):
            m = somar_meses(p["ultima_data"][:7], k)
            if m in agenda:
                agenda[m] += p["valor_parcela"]
    return [{"mes": m, "valor": v} for m, v in agenda.items()]
