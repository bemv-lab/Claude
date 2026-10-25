"""Previstos do mês: o que ainda vai entrar e sair, além do que já está nos extratos.

Automáticos (o sistema deduz sozinho):
  - renda: entradas que se repetem nos últimos meses (salários), com o que falta chegar no mês;
  - contratos: parcelas de dívida com valor fixo (Sicoob, CDC, Mercado Pago) que ainda não saíram;
  - contas fixas: gastos que se repetem todo mês (aluguel, assinaturas) e ainda não apareceram;
  - dia a dia: o gasto variável que ainda deve acontecer até o fim do mês (estimativa proporcional).
Manuais (vocês lançam): qualquer entrada ou saída prevista, só num mês ou repetindo até um mês.
Cada automático pode ser ajustado à mão: outro valor, "já resolvido" ou "não vai acontecer" (no mês ou sempre).
"""
from __future__ import annotations

import calendar
from statistics import median

from . import analises, dividas
from .db import categoria_id, linhas
from .util import agora_iso, hoje, limites_mes, somar_meses


def _ajustes(con, mes: str) -> dict[str, dict]:
    out = {}
    for r in con.execute("SELECT * FROM previstos WHERE chave_auto IS NOT NULL AND (mes = ? OR mes = '*') "
                         "ORDER BY mes = '*' DESC, id", (mes,)):
        out[r["chave_auto"]] = dict(r)        # o ajuste do mês vence o "sempre"
    return out


def _realizado_chave(con, chave: str, mes: str, sinal: int) -> int:
    ini, fim = limites_mes(mes)
    v = con.execute(f"""SELECT COALESCE(SUM(t.valor), 0) FROM transacoes t JOIN contas c ON c.id = t.conta_id
                        WHERE {analises.FILTRO_REAL} AND t.chave = ? AND t.data BETWEEN ? AND ?
                        AND t.valor {'>' if sinal > 0 else '<'} 0""", (chave, ini, fim)).fetchone()[0]
    return abs(v)


def _renda_recorrente(con, ref_meses: list[str]) -> list[dict]:
    """Entradas da categoria de receita com a mesma chave em pelo menos 2 dos meses de referência."""
    por_chave: dict[str, dict] = {}
    for i, m in enumerate(ref_meses):
        ini, fim = limites_mes(m)
        for r in con.execute(f"""
            SELECT t.chave, MIN(t.descricao) AS descricao, SUM(t.valor) AS total, MIN(t.data) AS primeira,
                   cat.nome AS categoria, cat.id AS categoria_id
            FROM transacoes t JOIN contas c ON c.id = t.conta_id JOIN categorias cat ON cat.id = t.categoria_id
            WHERE {analises.FILTRO_REAL} AND cat.tipo = 'receita' AND t.valor > 0 AND COALESCE(t.chave,'') != ''
              AND t.data BETWEEN ? AND ? GROUP BY t.chave""", (ini, fim)):
            c = por_chave.setdefault(r["chave"], {"chave": r["chave"], "descricao": r["descricao"],
                                                  "categoria": r["categoria"], "categoria_id": r["categoria_id"],
                                                  "totais": [], "dias": []})
            c["totais"].append(r["total"])
            c["dias"].append(int(r["primeira"][8:10]))
    return [dict(c, valor=int(median(c["totais"])), dia=int(median(c["dias"])))
            for c in por_chave.values() if len(c["totais"]) >= 2]


def nome_bonito(chave: str) -> str:
    """'PADARIA DO JOAO' -> 'Padaria do Joao'."""
    pequenas = {"de", "da", "do", "das", "dos", "e"}
    return " ".join(w.lower() if w.lower() in pequenas else w.capitalize() for w in chave.split())


def _nome_renda(c: dict) -> str:
    return f"{c['categoria']} · {nome_bonito(c['chave'])}"


def automaticos(con, mes: str) -> list[dict]:
    from .planejamento import meses_referencia, projecao
    ref = meses_referencia(con)
    itens = []
    # renda
    for c in _renda_recorrente(con, ref):
        itens.append({"chave_auto": f"renda:{c['chave']}", "origem": "renda", "descricao": _nome_renda(c),
                      "valor": c["valor"], "dia": c["dia"], "categoria": c["categoria"],
                      "realizado": _realizado_chave(con, c["chave"], mes, +1)})
    # contratos de dívida
    painel = dividas.painel(con)
    for d in painel["dividas"]:
        if d["termino"] == "quitada" or not d["mensal"] or not d["parcela_valor"]:
            continue
        if d["termino"] and d["termino"] < mes:
            continue
        pago = sum(p["valor"] for p in d["pagamentos"] if p["data"][:7] == mes)
        itens.append({"chave_auto": f"divida:{d['id']}", "origem": "contrato", "descricao": d["nome"],
                      "valor": -d["mensal"], "dia": d["dia_vencimento"], "categoria": "Dívidas", "realizado": pago})
    # contas fixas (fora parcelas e dívidas, que já entraram acima)
    fixas = 0
    for r in analises.recorrentes(con):
        if r["divida"]:
            continue
        fixas += r["valor_medio"]
        itens.append({"chave_auto": f"conta:{r['chave']}", "origem": "conta_fixa", "descricao": nome_bonito(r["chave"]),
                      "valor": -r["valor_medio"], "dia": r["dia"], "categoria": r["categoria"], "forma": r["forma"],
                      "realizado": _realizado_chave(con, r["chave"], mes, -1)})
    # dia a dia variável até o fim do mês
    atual = hoje().strftime("%Y-%m")
    if mes >= atual:
        y, m = map(int, mes.split("-"))
        total_dias = calendar.monthrange(y, m)[1]
        fracao = (total_dias - hoje().day + 1) / total_dias if mes == atual else 1.0
        variavel = max(0, projecao(con, 1)["dia_a_dia"] - fixas)
        if variavel:
            itens.append({"chave_auto": "variavel", "origem": "variavel",
                          "descricao": "Dia a dia até o fim do mês (estimativa)" if mes == atual else "Dia a dia (estimativa)",
                          "valor": -int(variavel * fracao), "dia": None, "categoria": None, "realizado": 0,
                          "estimativa": True})
    return itens


def _manuais(con, mes: str) -> list[dict]:
    return linhas(con.execute(
        """SELECT p.*, c.nome AS categoria FROM previstos p LEFT JOIN categorias c ON c.id = p.categoria_id
           WHERE p.chave_auto IS NULL AND p.mes <= ? AND COALESCE(p.ate, p.mes) >= ? ORDER BY p.dia, p.id""",
        (mes, mes)))


def do_mes(con, mes: str) -> dict:
    """Entradas e saídas do mês: o que já aconteceu, o que ainda falta e o total esperado."""
    aj = _ajustes(con, mes)
    passado = mes < hoje().strftime("%Y-%m")
    itens = []
    for a in automaticos(con, mes):
        x = aj.get(a["chave_auto"])
        a["ajuste_id"] = x["id"] if x else None
        a["ajuste_sempre"] = bool(x and x["mes"] == "*")
        if x and x["status"] == "cancelado":
            a["status"] = "cancelado"
        elif x and x["status"] == "realizado":
            a["status"] = "realizado"
        else:
            if x:
                a["valor"] = x["valor"]
                a["ajustado"] = True
            a["status"] = "realizado" if abs(a["realizado"]) >= abs(a["valor"]) * 0.97 or passado else "previsto"
        falta = 0 if a["status"] != "previsto" else max(0, abs(a["valor"]) - abs(a["realizado"]))
        a["falta"] = falta if a["valor"] > 0 else -falta
        a["manual"] = False
        itens.append(a)
    for m in _manuais(con, mes):
        falta = m["valor"] if m["status"] == "previsto" and not passado else 0
        itens.append({"id": m["id"], "chave_auto": None, "origem": "manual", "descricao": m["descricao"],
                      "valor": m["valor"], "dia": m["dia"], "categoria": m["categoria"], "realizado": 0,
                      "status": m["status"], "falta": falta, "manual": True, "observacao": m["observacao"],
                      "repete": bool(m["ate"] and m["ate"] != m["mes"]), "mes_inicio": m["mes"], "ate": m["ate"],
                      "no_plano": bool(m["no_plano"])})
    itens.sort(key=lambda i: (i["status"] == "cancelado", i["dia"] or 99))
    a_receber = sum(i["falta"] for i in itens if i["falta"] > 0)
    a_pagar = -sum(i["falta"] for i in itens if i["falta"] < 0)
    return {"mes": mes, "itens": itens, "a_receber": a_receber, "a_pagar": a_pagar,
            "manuais_entradas": sum(i["falta"] for i in itens if i["manual"] and i["falta"] > 0),
            "manuais_saidas": -sum(i["falta"] for i in itens if i["manual"] and i["falta"] < 0)}


def manuais_por_mes(con, meses: list[str]) -> dict[str, dict]:
    """Soma dos previstos manuais de cada mês (para a projeção do Plano)."""
    out = {}
    for m in meses:
        ms = [x for x in _manuais(con, m) if x["status"] == "previsto" and x["no_plano"]]
        out[m] = {"entradas": sum(x["valor"] for x in ms if x["valor"] > 0),
                  "saidas": -sum(x["valor"] for x in ms if x["valor"] < 0), "itens": ms}
    return out


def salvar(con, dados: dict, pid: int | None = None) -> int:
    campos = {k: dados.get(k) for k in ("mes", "ate", "dia", "descricao", "valor", "chave_auto", "status", "observacao",
                                        "no_plano")
              if k in dados}
    if "categoria" in dados and dados["categoria"]:
        campos["categoria_id"] = categoria_id(con, dados["categoria"])
    elif "categoria_id" in dados:
        campos["categoria_id"] = dados["categoria_id"] or None
    if pid:
        con.execute(f"UPDATE previstos SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?", (*campos.values(), pid))
    else:
        if campos.get("chave_auto"):          # um ajuste por automático e mês
            con.execute("DELETE FROM previstos WHERE chave_auto = ? AND mes = ?", (campos["chave_auto"], campos["mes"]))
        campos.setdefault("status", "previsto")
        campos["criado_em"] = agora_iso()
        cur = con.execute(f"INSERT INTO previstos ({', '.join(campos)}) VALUES ({', '.join('?' * len(campos))})",
                          tuple(campos.values()))
        pid = cur.lastrowid
    con.commit()
    return pid


def apagar(con, pid: int) -> None:
    con.execute("DELETE FROM previstos WHERE id = ?", (pid,))
    con.commit()
