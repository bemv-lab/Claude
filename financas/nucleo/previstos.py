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

from . import analises, dividas, rendas
from .db import categoria_id, linhas
from .util import agora_iso, hoje, somar_meses


CONTAS_FIXAS = {"Aluguel", "Moradia", "Condomínio", "Energia", "Contas da casa", "Internet Fixa", "Internet Móvel", "IPTU",
                "Impostos", "Imposto LB", "Terapia", "Educação"}


def _gasto_variavel(con, mes: str, cartao: bool) -> int:
    """Gasto do dia a dia já lançado no mês (sem parcelas, dívidas e contas fixas)."""
    marcas = ",".join("?" * len(CONTAS_FIXAS))
    return con.execute(f"""
        SELECT COALESCE(-SUM(t.valor), 0) FROM transacoes t JOIN contas c ON c.id = t.conta_id
        JOIN categorias cat ON cat.id = t.categoria_id
        WHERE {analises.FILTRO_REAL} AND cat.tipo = 'despesa' AND t.mes_ref = ? AND t.parcela_total IS NULL
          AND t.divida_id IS NULL AND c.tipo {'=' if cartao else '!='} 'cartao' AND cat.nome NOT IN ({marcas})""",
                       (mes, *CONTAS_FIXAS)).fetchone()[0]


def _ajustes(con, mes: str) -> dict[str, dict]:
    out = {}
    for r in con.execute("SELECT * FROM previstos WHERE chave_auto IS NOT NULL AND (mes = ? OR mes = '*') "
                         "ORDER BY mes = '*' DESC, id", (mes,)):
        out[r["chave_auto"]] = dict(r)        # o ajuste do mês vence o "sempre"
    return out


def _realizado(con, campo: str, valor, mes: str, sinal: int) -> int:
    """Quanto já aconteceu no mês (pelo mês em que conta) para uma chave de estabelecimento ou categoria."""
    v = con.execute(f"""SELECT COALESCE(SUM(t.valor), 0) FROM transacoes t JOIN contas c ON c.id = t.conta_id
                        WHERE t.tipo = 'normal' AND t.{campo} = ? AND t.mes_ref = ?
                        AND t.valor {'>' if sinal > 0 else '<'} 0""", (valor, mes)).fetchone()[0]
    return abs(v)


def _realizado_chave(con, chave: str, mes: str, sinal: int) -> int:
    return _realizado(con, "chave", chave, mes, sinal)


def nome_bonito(chave: str) -> str:
    """'PADARIA DO JOAO' -> 'Padaria do Joao'."""
    pequenas = {"de", "da", "do", "das", "dos", "e"}
    return " ".join(w.lower() if w.lower() in pequenas else w.capitalize() for w in chave.split())


def automaticos(con, mes: str) -> list[dict]:
    from .planejamento import projecao
    itens = []
    # entradas fixas (editáveis em Início > Entradas fixas)
    for f in rendas.do_mes(con, mes):
        itens.append({"chave_auto": f"renda:{f['id']}", "origem": "renda", "descricao": f["descricao"],
                      "valor": f["valor"], "dia": f["dia"], "categoria": "Salário", "realizado": f["recebido_extrato"],
                      "renda_status": f["status"]})
    # contratos de dívida
    painel = dividas.painel(con)
    for d in painel["dividas"]:
        if d["termino"] == "quitada" or not d["mensal"] or not d["parcela_valor"]:
            continue
        if d["termino"] and d["termino"] < mes:
            continue
        # só conta como parcela do mês o que saiu depois da data-base (pagamento extra antes dela não abate)
        pago = sum(p["valor"] for p in d["pagamentos"] if p["data"][:7] == mes
                   and (not d.get("data_base") or p["data"] > d["data_base"]))
        itens.append({"chave_auto": f"divida:{d['id']}", "origem": "contrato", "descricao": d["nome"],
                      "valor": -d["mensal"], "dia": d["dia_vencimento"], "categoria": "Dívidas", "realizado": pago})
    # contas fixas (fora parcelas e dívidas, que já entraram acima)
    atual = hoje().strftime("%Y-%m")
    cartao = dividas.cartao_principal(con)
    # o cartão conta pelo mês da fatura: com a fatura do mês já fechada, o que vier no cartão é do mês seguinte
    fechada = mes == atual and cartao and cartao["dia_fechamento"] and hoje().day > cartao["dia_fechamento"]
    fixas = {True: 0, False: 0}          # no cartão / fora do cartão
    cancelados = {k for k, v in _ajustes(con, mes).items() if v["status"] == "cancelado" and v["mes"] == "*"}
    for r in analises.recorrentes(con):
        if r["divida"]:
            continue
        if f"conta:{r['chave']}" not in cancelados:
            fixas[r["forma"] in ("Cartão", "Pix no crédito")] += r["valor_medio"]
        feito = _realizado_chave(con, r["chave"], mes, -1)
        if fechada and r["forma"] in ("Cartão", "Pix no crédito") and not feito:
            continue
        itens.append({"chave_auto": f"conta:{r['chave']}", "origem": "conta_fixa", "descricao": nome_bonito(r["chave"]),
                      "valor": -r["valor_medio"], "dia": r["dia"], "categoria": r["categoria"], "forma": r["forma"],
                      "realizado": feito})
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
        if x and x["status"] == "cancelado" and x["mes"] == "*":   # "parar de prever": sai da lista
            continue
        a["ajuste_id"] = x["id"] if x else None
        a["ajuste_sempre"] = bool(x and x["mes"] == "*")
        if x and x["descricao"] and x["status"] != "cancelado":
            a["descricao"] = x["descricao"]
        if x and x["status"] == "cancelado":
            a["status"] = "cancelado"
        elif x and x["status"] == "realizado":
            a["status"] = "realizado"
            if x["valor"]:                       # o valor que de fato saiu ou entrou, digitado em "Já pago/recebido"
                a["valor"] = x["valor"]
        elif a.get("renda_status"):
            st = a["renda_status"]
            a["status"] = "realizado" if st == "recebido" else "previsto" if st == "a_receber" else st
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
        x = aj.get(f"manual:{m['id']}")          # ajuste só deste mês num previsto que se repete
        status, valor = (x["status"], x["valor"] if x["status"] == "previsto" else m["valor"]) if x else (m["status"], m["valor"])
        # um previsto com categoria se resolve sozinho quando o extrato traz o gasto (ex.: o boleto do aluguel)
        feito = _realizado(con, "categoria_id", m["categoria_id"], mes, 1 if valor > 0 else -1) if m["categoria_id"] else 0
        if status == "previsto" and feito >= abs(valor) * 0.97:
            status = "realizado"
        falta = max(0, abs(valor) - feito) * (1 if valor > 0 else -1) if status == "previsto" and not passado else 0
        itens.append({"id": m["id"], "chave_auto": None, "origem": "manual", "descricao": m["descricao"],
                      "valor": valor, "dia": m["dia"], "categoria": m["categoria"], "realizado": feito,
                      "status": status, "falta": falta, "ajuste_id": x["id"] if x else None, "manual": True, "observacao": m["observacao"],
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
