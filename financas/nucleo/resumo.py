"""Números da home: saldo do mês, quanto ainda dá para gastar, metas, alertas, fila de dúvidas."""
from __future__ import annotations

import re

import calendar
from statistics import median

from . import alertas, analises, dividas, previstos, rendas
from .db import config_int, linhas
from .util import brl, dias_restantes_mes, hoje, nome_mes, somar_meses


def orcamento(con, mes: str) -> dict:
    """Orçamento do mês = soma do orçado de cada categoria de gasto (Dívidas têm plano próprio).
    O gasto conta tudo dessas categorias, inclusive o que foi pago com o Flash, como o orçado."""
    cats = analises.gasto_por_categoria(con, mes)
    tipos = {r["id"]: r["tipo"] for r in con.execute("SELECT id, tipo FROM categorias")}
    limite = con.execute("SELECT COALESCE(SUM(orcamento), 0) FROM categorias WHERE tipo = 'despesa' AND ativa = 1"
                         ).fetchone()[0]
    n_orcadas = con.execute("SELECT COUNT(*) FROM categorias WHERE tipo = 'despesa' AND ativa = 1 AND orcamento > 0"
                            ).fetchone()[0]
    gasto = sum(c["total"] for c in cats if tipos.get(c["id"]) == "despesa" or c["id"] == 0)
    restante = limite - gasto
    atual = mes == hoje().strftime("%Y-%m")
    dias = dias_restantes_mes() if atual else 0
    y, m = map(int, mes.split("-"))
    total_dias = calendar.monthrange(y, m)[1]
    decorrido = (total_dias - dias + 1) / total_dias if atual else (1.0 if mes < hoje().strftime("%Y-%m") else 0.0)
    from .planejamento import orcamento_sugerido
    tipico = orcamento_sugerido(con)["total_tipico"]
    return {"limite": limite, "n_categorias": n_orcadas, "gasto": gasto, "restante": restante,
            "por_dia": int(restante / dias) if dias and restante > 0 else 0, "dias_restantes": dias,
            "percentual": round(gasto / limite, 3) if limite else None, "mes_decorrido": round(decorrido, 3),
            "tipico": tipico, "realista": bool(limite) and limite >= tipico * 0.9}


def saude(entradas: int, saldo_previsto: int, orc: dict) -> dict:
    """Leitura simples do mês: margem prevista e ritmo do gasto."""
    margem = saldo_previsto / entradas if entradas else 0
    ritmo = (orc["percentual"] or 0) - orc["mes_decorrido"]
    if saldo_previsto < 0 and margem < -0.02:
        return {"nivel": "critico", "titulo": "Saídas maiores que entradas",
                "texto": f"Pelo que já entrou e o que ainda vai entrar, as saídas passam das entradas em {brl(-saldo_previsto)} neste mês."}
    if saldo_previsto < 0:
        return {"nivel": "atencao", "titulo": "Fecha no zero",
                "texto": f"Entradas e saídas empatam quase: o mês fica {brl(-saldo_previsto)} no negativo. Qualquer gasto extra pesa."}
    if margem < 0.10 or ritmo > 0.10:
        motivo = ("a sobra prevista é pequena" if margem < 0.10
                  else f"o gasto está {ritmo:.0%} à frente do ritmo do mês")
        return {"nivel": "atencao", "titulo": "Atenção", "texto": f"Fecha no azul, mas {motivo}."}
    return {"nivel": "bom", "titulo": "Saudável",
            "texto": f"Deve sobrar {brl(saldo_previsto)} ({margem:.0%} do que entra). Bom mês para adiantar dívida."}


def _alertas_atuais(con) -> list[dict]:
    """Só o que vale para o mês atual e os próximos: alerta de mês passado sai da tela."""
    atual = hoje().strftime("%Y-%m")
    out = []
    for a in alertas.listar(con, 60):
        m = re.search(r"\d{4}-\d{2}", a.get("chave") or "")
        if m and m.group(0) < atual:
            continue
        out.append(a)
        if len(out) == 3:
            break
    return out


def home(con, mes: str | None = None) -> dict:
    mes = mes or hoje().strftime("%Y-%m")
    tot = analises.totais_mes(con, mes)
    ant = analises.totais_mes(con, somar_meses(mes, -1))
    medias = analises.media_categorias(con, mes)
    cats = analises.gasto_por_categoria(con, mes)
    for c in cats:
        c["media"] = int(medias.get(c["id"], 0))
    flash = con.execute("SELECT COALESCE(SUM(t.valor),0) AS saldo, c.nome FROM transacoes t "
                        "JOIN contas c ON c.id = t.conta_id WHERE c.tipo = 'beneficio' GROUP BY c.id").fetchall()
    duvidas = linhas(con.execute("""
        SELECT t.id, t.data, t.descricao, t.valor, t.motivo_duvida, t.sugestao_id, co.nome AS conta, p.nome AS pessoa
        FROM transacoes t JOIN contas co ON co.id = t.conta_id LEFT JOIN pessoas p ON p.id = t.pessoa_id
        WHERE t.classificacao = 'duvida' ORDER BY t.data DESC LIMIT 4"""))
    n_duvidas = con.execute("SELECT COUNT(*) FROM transacoes WHERE classificacao='duvida'").fetchone()[0]
    metas = linhas(con.execute("SELECT * FROM metas WHERE ativa = 1 ORDER BY prioridade, id LIMIT 4"))
    parc = analises.parcelamentos(con)
    painel = dividas.painel(con)
    orc = orcamento(con, mes)
    prev = previstos.do_mes(con, mes)
    # marcado como já resolvido sem lançamento no extrato (ex.: recebi e não caiu como transação): conta como feito
    # pela parte que o extrato não mostrou, para não sumir do total
    feitos = [i for i in prev["itens"] if i.get("ajuste_id") and i["status"] == "realizado"]
    recebido_fora = sum(max(0, abs(i["valor"]) - abs(i["realizado"])) for i in feitos if i["valor"] > 0)
    pago_fora = sum(max(0, abs(i["valor"]) - abs(i["realizado"])) for i in feitos if i["valor"] < 0)
    recebido = tot["receitas"] + recebido_fora
    pago = tot["despesas"] + pago_fora
    entradas_prev = recebido + prev["a_receber"]
    saidas_prev = pago + prev["a_pagar"]
    saldo_prev = entradas_prev - saidas_prev
    serie = []
    for k in range(5, -1, -1):
        m = somar_meses(mes, -k)
        t = analises.totais_mes(con, m)
        if m == mes:      # o mês atual usa os mesmos totais do Resultado do Início (recebido + a receber, etc.)
            t = {"receitas": entradas_prev, "despesas": saidas_prev}
        if t["receitas"] or t["despesas"]:
            serie.append({"mes": m, "entradas": t["receitas"], "saidas": t["despesas"],
                          "saldo": t["receitas"] - t["despesas"]})
    if serie:      # meses com extrato só de uma conta (ex.: antes de julho) distorcem a comparação
        ref = median(x["saidas"] for x in serie)
        while serie and serie[0]["saidas"] < ref * 0.4:
            serie.pop(0)
    agenda = analises.agenda_parcelas(con, mes, 1)[0]
    ultima = con.execute("SELECT MAX(data) AS d FROM transacoes").fetchone()["d"]
    ultima_imp = con.execute("SELECT MAX(criado_em) AS d FROM importacoes WHERE status='ok'").fetchone()["d"]
    return {
        "mes": mes, "mes_nome": nome_mes(mes),
        "receitas": tot["receitas"], "despesas": tot["despesas"], "saldo": tot["receitas"] - tot["despesas"],
        "saldo_mes_anterior": ant["receitas"] - ant["despesas"], "despesas_mes_anterior": ant["despesas"],
        "entradas_pendentes": tot["entradas_pendentes"], "negocio": tot["negocio"],
        "orcamento": orc,
        "entradas": {"recebido": recebido, "a_receber": prev["a_receber"], "previsto": entradas_prev},
        "saidas": {"pago": pago, "a_pagar": prev["a_pagar"], "previsto": saidas_prev,
                   "dividas": tot["dividas"]},
        "provisionado": {"entradas": prev["a_receber"], "saidas": prev["a_pagar"],
                         "manuais": prev["manuais_entradas"] + prev["manuais_saidas"]},
        "saldo_previsto": saldo_prev,
        "saldo_contas": config_int(con, "saldo_contas_atual"),
        "fechamento": config_int(con, "saldo_contas_atual") + prev["a_receber"] - prev["a_pagar"],
        "saude": saude(entradas_prev, saldo_prev, orc) if mes >= hoje().strftime("%Y-%m") else
                 saude(tot["receitas"], tot["receitas"] - tot["despesas"], dict(orc, mes_decorrido=1.0)),
        "previstos": prev["itens"],
        "rendas": rendas.do_mes(con, mes),
        "serie": serie,
        "parcelas_mes": agenda,
        "categorias": cats[:6],
        "beneficios": [dict(r) for r in flash],
        "alertas": _alertas_atuais(con),
        "duvidas": duvidas, "n_duvidas": n_duvidas,
        "metas": metas,
        "parcelas_restante": sum(p["restante"] for p in parc),
        "n_parcelamentos": sum(1 for p in parc if p["faltam"] > 0),
        "dividas": {"total": painel["total_devido"], "mensal": painel["mensal_comprometido"],
                    "a_confirmar": painel["a_confirmar"]},
        "ultimo_lancamento": ultima, "ultima_importacao": ultima_imp,
        "vazio": ultima is None,
    }
