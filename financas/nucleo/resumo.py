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


def contas_a_pagar(con, mes: str, itens: list[dict]) -> list[dict]:
    """Visão de boletos do mês: uma linha por conta (energia, aluguel, empréstimo...) e uma só por cartão,
    com o total da fatura do mês. O detalhe das compras fica em Lançamentos."""
    out = []
    cartoes = analises.cartao_a_pagar(con, mes)
    if mes > hoje().strftime("%Y-%m"):
        # fatura futura = parcelas que já vão cair nela + assinaturas no cartão (que saem do "a pagar" avulso)
        assin = -sum(i["falta"] for i in itens if i["falta"] < 0 and i["status"] != "cancelado"
                     and i.get("forma") in ("Cartão", "Pix no crédito"))
        if assin:
            if not cartoes:
                c = con.execute("""SELECT c.* FROM contas c LEFT JOIN transacoes t ON t.conta_id = c.id
                                   WHERE c.tipo = 'cartao' AND c.ativa = 1 GROUP BY c.id ORDER BY COUNT(t.id) DESC""").fetchone()
                if c:
                    cartoes = [{"conta_id": c["id"], "nome": c["nome"], "dia": c["dia_vencimento"], "fatura": 0,
                                "pago": 0, "a_pagar": 0, "previsao": True, "qtd": 0}]
            alvo = [c for c in cartoes if c.get("previsao")]   # fatura já importada não ganha previsão por cima
            if alvo:
                principal = max(alvo, key=lambda x: x["fatura"])
                principal["parcelas"] = principal["fatura"]
                principal["assinaturas"] = assin
                principal["fatura"] += assin
                principal["a_pagar"] += assin
    marcados = {k: v for k, v in previstos._ajustes(con, mes).items() if k.startswith("cartao:")}
    for c in cartoes:
        # "marcar paga" na fatura: vale o que vocês digitaram até o extrato do banco trazer o pagamento; o que o
        # extrato já mostra não conta de novo (só a parte que ainda não apareceu nele)
        x = marcados.get(f"cartao:{c['conta_id']}")
        c["pago_manual"] = 0
        if x and x["status"] == "realizado":
            informado = min(abs(x["valor"]) or c["fatura"], c["fatura"])
            c["pago_manual"] = max(0, informado - c["pago"])
            c["pago"] += c["pago_manual"]
            c["a_pagar"] = max(0, c["fatura"] - c["pago"])
            if c["a_pagar"] <= 500:          # diferença de centavos/arredondamento não deixa a fatura em aberto
                c["a_pagar"] = 0
        c["ajuste_id"] = x["id"] if x else None
        pago = c["a_pagar"] == 0
        # o valor da fatura como o banco cobra (créditos, estornos e o que já foi abatido antes de fechar já saíram)
        out.append({"descricao": f"Fatura · {c['nome']}", "valor": c["fatura"], "pago": c["pago"],
                    "previsao": c.get("previsao", False), "parcelas": c.get("parcelas"), "assinaturas": c.get("assinaturas"),
                    "chave": f"cartao:{c['conta_id']}", "ajuste_id": c.get("ajuste_id"), "pago_manual": c.get("pago_manual", 0),
                    "dia": c["dia"], "status": "realizado" if pago else "previsto", "falta": c["a_pagar"],
                    "cartao": True, "qtd": c["qtd"], "conta_id": c["conta_id"]})
    for i in itens:
        if i["valor"] >= 0 or i["status"] == "cancelado" or i.get("forma") in ("Cartão", "Pix no crédito"):
            continue
        out.append({"descricao": i["descricao"], "valor": abs(i["valor"]), "dia": i.get("dia"),
                    "status": i["status"], "falta": abs(i.get("falta") or 0), "cartao": False,
                    # para a tela Contas: como achar e ajustar este item
                    "chave": i["chave_auto"] or f"manual:{i['id']}", "manual": i["manual"],
                    "ajuste_id": i.get("ajuste_id"), "repete": bool(i.get("repete")), "origem": i["origem"]})
    out.sort(key=lambda x: (x["dia"] or 99, -x["valor"]))
    return out


def fluxo_diario(con, mes: str, saldo_inicial: int, itens: list[dict], contas: list[dict]) -> list[dict]:
    """Saldo das contas dia a dia: o realizado (extrato) até hoje e, daí em diante, a previsão com o que ainda
    vai entrar e sair no dia de cada conta. Cada ponto: {dia, saldo, previsto, entrou, saiu, eventos}."""
    ultimo = calendar.monthrange(int(mes[:4]), int(mes[5:7]))[1]
    atual = hoje().strftime("%Y-%m")
    corte = ultimo if mes < atual else 0 if mes > atual else hoje().day      # até onde vale o realizado
    mov: dict[int, dict] = {}
    for data, m in analises.movimento_diario(con, mes).items():      # lançamento de outro mês que conta neste: na borda
        d = 1 if data < f"{mes}-01" else ultimo if data[:7] > mes else int(data[8:10])
        d = min(d, corte) if corte else d
        mov.setdefault(d, {"entrou": 0, "saiu": 0})
        mov[d]["entrou"] += m["entrou"]
        mov[d]["saiu"] += m["saiu"]
    for i in itens:      # marcado como resolvido sem lançamento no extrato: conta no dia dele
        if i.get("ajuste_id") and i["status"] == "realizado":
            fora = max(0, abs(i["valor"]) - abs(i["realizado"]))
            if fora:
                d = min(max(1, i.get("dia") or 1), corte or ultimo, ultimo)
                mov.setdefault(d, {"entrou": 0, "saiu": 0})
                mov[d]["entrou" if i["valor"] > 0 else "saiu"] += fora
    for c in contas:
        if c.get("pago_manual"):
            d = min(max(1, c.get("dia") or 1), corte or ultimo, ultimo)
            mov.setdefault(d, {"entrou": 0, "saiu": 0})
            mov[d]["saiu"] += c["pago_manual"]
    futuro: dict[int, list] = {}

    def agenda(dia, nome, valor):
        d = min(ultimo, max(corte + 1 if corte < ultimo else ultimo, dia or ultimo))
        futuro.setdefault(d, []).append((nome, valor))
    if mes >= atual:
        for i in itens:      # o que ainda vai entrar
            if i["valor"] > 0 and i["status"] not in ("realizado", "cancelado") and (i.get("falta") or 0) > 0:
                agenda(i.get("dia"), i["descricao"], i["falta"])
        for c in contas:     # o que ainda vai sair (o cartão pelo que falta da fatura)
            if c["status"] != "realizado" and c["falta"]:
                agenda(c.get("dia"), c["descricao"], -c["falta"])
    out, saldo = [{"dia": 0, "saldo": saldo_inicial, "previsto": False, "entrou": 0, "saiu": 0, "eventos": []}], saldo_inicial
    for d in range(1, ultimo + 1):
        previsto = d > corte
        m = mov.get(d, {"entrou": 0, "saiu": 0})
        entrou, saiu, eventos = m["entrou"], m["saiu"], []
        for nome, valor in futuro.get(d, []) if previsto else []:
            entrou += max(0, valor)
            saiu += max(0, -valor)
            eventos.append({"nome": nome, "valor": valor})
        saldo += entrou - saiu
        out.append({"dia": d, "saldo": saldo, "previsto": previsto, "entrou": entrou, "saiu": saiu, "eventos": eventos})
    return out


def faturas_futuras(con, mes: str, meses: int = 8) -> list[dict]:
    """Cartão nos próximos meses: a fatura deste mês e a previsão das seguintes (parcelas + assinaturas)."""
    out = []
    for k in range(meses):
        m = somar_meses(mes, k)
        linhas = [c for c in contas_a_pagar(con, m, previstos.do_mes(con, m)["itens"]) if c["cartao"]]
        total = sum(c["valor"] for c in linhas)
        assin = sum(c.get("assinaturas") or 0 for c in linhas)
        previsao = any(c.get("previsao") for c in linhas)
        out.append({"mes": m, "total": total, "assinaturas": assin if previsao else 0,
                    "parcelas": total - assin if previsao else 0, "previsao": previsao})
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
    # regime de caixa no cartão: o que conta é o pagamento da fatura (já no extrato) e o que falta pagar dela;
    # as assinaturas previstas no cartão já estão dentro da fatura e saem do "a pagar"
    no_cartao = -sum(i["falta"] for i in prev["itens"] if i["falta"] < 0 and i.get("forma") in ("Cartão", "Pix no crédito"))
    contas = contas_a_pagar(con, mes, prev["itens"])
    # a fatura do mês já está inteira nas saídas: o que falta pagar dela sai do "pago" e vai para o "a pagar"
    cartao_falta = sum(c["falta"] for c in contas if c["cartao"]) if mes >= hoje().strftime("%Y-%m") else 0
    prev["a_pagar"] = prev["a_pagar"] - no_cartao + cartao_falta
    # marcado como já resolvido sem lançamento no extrato (ex.: recebi e não caiu como transação): conta como feito
    # pela parte que o extrato não mostrou, para não sumir do total
    feitos = [i for i in prev["itens"] if i.get("ajuste_id") and i["status"] == "realizado"]
    recebido_fora = sum(max(0, abs(i["valor"]) - abs(i["realizado"])) for i in feitos if i["valor"] > 0)
    pago_fora = sum(max(0, abs(i["valor"]) - abs(i["realizado"])) for i in feitos if i["valor"] < 0)
    pago_fora += sum(c.get("pago_manual") or 0 for c in contas if c["cartao"])
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
        # resultado realizado: o que já entrou menos o que já saiu no mês (o que de fato mexeu nas contas)
        "resultado_realizado": recebido - pago,
        # fechamento das contas: saldo no início do mês (Ajustes) + o realizado; a previsão soma o provisionado
        "fechamento": config_int(con, "saldo_contas_atual") + recebido - pago,
        "fechamento_previsto": config_int(con, "saldo_contas_atual") + recebido - pago + prev["a_receber"] - prev["a_pagar"],
        "cartao_a_pagar": cartao_falta,
        "saude": saude(entradas_prev, saldo_prev, orc) if mes >= hoje().strftime("%Y-%m") else
                 saude(tot["receitas"], tot["receitas"] - tot["despesas"], dict(orc, mes_decorrido=1.0)),
        "previstos": prev["itens"],
        "contas_a_pagar": contas,
        "fluxo_diario": fluxo_diario(con, mes, config_int(con, "saldo_contas_atual"), prev["itens"], contas),
        "faturas_futuras": faturas_futuras(con, mes),
        "gasto_total": sum(c["total"] for c in cats),
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
