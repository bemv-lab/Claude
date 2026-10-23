"""Dívidas: reconhecimento de pagamentos nos extratos, saldo, término previsto, prioridade e simulações."""
from __future__ import annotations

import math
from datetime import date

from .db import categoria_id, config, linhas
from .util import brl, hoje, normalizar, proxima_data_dia, somar_meses

IOF_FIXO = 0.0038
IOF_DIARIO = 0.000082
JUROS_DESCONHECIDO_BANCO = 8.0   # % a.m. assumido para priorizar dívida de banco/cartão sem taxa informada


def _dist_dia(dia_tx: int, dia_alvo: int) -> int:
    d = abs(dia_tx - dia_alvo)
    return min(d, 31 - d)


def reconhecer_pagamentos(con) -> int:
    """Liga saídas dos extratos às dívidas (ex.: R$ 680,00 perto do dia 15 = consignado)."""
    cat = categoria_id(con, "Dívidas")
    novos = 0
    for d in con.execute("SELECT * FROM dividas WHERE status != 'quitada' "
                         "AND (reconhecer_valor IS NOT NULL OR COALESCE(reconhecer_texto,'') != '')").fetchall():
        texto = normalizar(d["reconhecer_texto"] or "")
        janela = d["reconhecer_janela"] if d["reconhecer_janela"] is not None else 4
        candidatas = con.execute(
            "SELECT t.* FROM transacoes t JOIN contas c ON c.id = t.conta_id "
            "WHERE t.valor < 0 AND t.divida_id IS NULL AND t.tipo = 'normal' AND c.tipo = 'corrente' "
            "AND t.classificacao != 'manual'").fetchall()
        for t in candidatas:
            valor = -t["valor"]
            ok = False
            if texto and texto in normalizar(t["descricao"]):
                ok = d["reconhecer_valor"] is None or abs(valor - d["reconhecer_valor"]) <= d["reconhecer_valor"] * 0.02
            elif not texto and d["reconhecer_valor"] and valor == d["reconhecer_valor"]:
                ok = d["dia_vencimento"] is None or _dist_dia(int(t["data"][8:10]), d["dia_vencimento"]) <= janela
            if ok:
                con.execute("UPDATE transacoes SET divida_id = ?, categoria_id = ?, classificacao = 'regra', "
                            "motivo_duvida = NULL, sugestao_id = NULL WHERE id = ?", (d["id"], cat, t["id"]))
                con.execute("INSERT OR IGNORE INTO pagamentos_divida (divida_id, data, valor, transacao_id) "
                            "VALUES (?,?,?,?)", (d["id"], t["data"], valor, t["id"]))
                novos += 1
    con.commit()
    return novos


def _meses_ate(mes_alvo: str, ref: date) -> int:
    y, m = map(int, mes_alvo.split("-"))
    return (y - ref.year) * 12 + (m - ref.month)


def _n_parcelas(saldo: int, parcela: int, juros: float) -> int | None:
    if not parcela or parcela <= 0 or saldo is None:
        return None
    if not juros:
        return math.ceil(saldo / parcela)
    i = juros / 100
    x = 1 - i * saldo / parcela
    if x <= 0:
        return None          # parcela não cobre os juros: a dívida não acaba
    return math.ceil(-math.log(x) / math.log(1 + i))


def estado(con, d) -> dict:
    """Saldo atual, saída mensal e término previsto de uma dívida."""
    d = dict(d)
    ref = hoje()
    pags = linhas(con.execute("SELECT * FROM pagamentos_divida WHERE divida_id = ? ORDER BY data DESC", (d["id"],)))
    depois = [p for p in pags if p["data"] > (d["data_base"] or "0000")]
    pago_depois = sum(p["valor"] for p in depois)
    restantes = None
    if d["parcelas_restantes"] is not None:
        restantes = max(0, d["parcelas_restantes"] - len(depois))
        saldo = restantes * (d["parcela_valor"] or 0)
    elif d["saldo_base"] is not None:
        saldo = max(0, d["saldo_base"] - pago_depois)
    else:
        saldo = None
    mensal = d["plano_mensal"] or d["parcela_valor"] or 0
    termino, aviso, mensal_necessario = None, None, None
    if d["status"] == "quitada" or saldo == 0:
        termino = "quitada"
    elif d["mes_final"]:
        termino = d["mes_final"]
    elif restantes:
        prox = proxima_data_dia(d["dia_vencimento"] or 15, ref)
        termino = somar_meses(prox.strftime("%Y-%m"), restantes - 1)
    elif d["plano_data_alvo"] and saldo:
        meses = max(1, _meses_ate(d["plano_data_alvo"][:7], ref))
        mensal_necessario = math.ceil(saldo / meses)
        termino = d["plano_data_alvo"][:7]
        if not d["plano_mensal"]:
            mensal = mensal_necessario
    elif saldo and mensal:
        n = _n_parcelas(saldo, mensal, d["juros_mensal"] or 0)
        if n is None:
            aviso = "A parcela não cobre nem os juros do mês: o saldo só cresce."
        else:
            termino = somar_meses(ref.strftime("%Y-%m"), n)
    if saldo is None:
        aviso = aviso or "Valor a confirmar."
    elif termino is None and not aviso:
        aviso = "Sem plano de pagamento ainda."
    ultimo = pags[0] if pags else None
    return {**d, "saldo_atual": saldo, "parcelas_restantes_atual": restantes, "mensal": mensal if saldo != 0 else 0,
            "mensal_necessario": mensal_necessario, "termino": termino, "aviso": aviso,
            "pagamentos": pags[:12], "ultimo_pagamento": ultimo,
            "negociacoes": linhas(con.execute("SELECT * FROM negociacoes WHERE divida_id = ? ORDER BY data DESC, id DESC",
                                              (d["id"],)))}


def _juros_efetivo(d) -> tuple[float, bool]:
    if d["juros_mensal"] is not None:
        return float(d["juros_mensal"]), False
    if d["tipo"] in ("cartao", "banco"):
        return JUROS_DESCONHECIDO_BANCO, True
    if d["tipo"] == "familia":
        return 0.0, False
    return 0.0, True


def prioridade(estados: list[dict]) -> list[dict]:
    """Ordem sugerida: urgência (cobrança/negativação) > juros mais caros > saldo menor (vitória rápida)."""
    ordem = []
    for e in estados:
        if e["termino"] == "quitada":
            continue
        j, estimado = _juros_efetivo(e)
        jt = f"{j:.1f}".replace(".", ",")
        if e["urgencia"] >= 2:
            motivo = "Urgente: cobrança ou negativação em andamento. Resolver primeiro evita custo e estresse."
        elif j >= 3:
            motivo = (f"Juros {'estimados ' if estimado else ''}de {jt}% ao mês: é a que mais cresce. "
                      "Cada real antecipado aqui rende mais que qualquer investimento conservador.")
        elif j > 0:
            motivo = f"Juros de {jt}% ao mês: vale antecipar depois das mais caras."
        elif estimado:
            motivo = "Juros não informados: preencham a taxa para a ordem ficar certa."
        elif e["tipo"] == "familia":
            motivo = "Sem juros: não é a mais cara, mas mantenham o combinado em dia para preservar a relação."
        else:
            motivo = "Sem juros informados."
        e2 = dict(e, juros_considerado=j, juros_estimado=estimado, motivo_prioridade=motivo)
        e2["_score"] = (e["urgencia"] or 0) * 100 + j * 5 - (e["saldo_atual"] or 0) / 1e8
        ordem.append(e2)
    ordem.sort(key=lambda x: x["_score"], reverse=True)
    for i, e in enumerate(ordem, 1):
        e["posicao"] = i
        e.pop("_score", None)
    return ordem


def painel(con) -> dict:
    estados = [estado(con, d) for d in con.execute("SELECT * FROM dividas ORDER BY ordem, id")]
    ativos = [e for e in estados if e["termino"] != "quitada"]
    return {
        "dividas": estados,
        "total_devido": sum(e["saldo_atual"] or 0 for e in ativos),
        "a_confirmar": [e["nome"] for e in ativos if e["saldo_atual"] is None],
        "mensal_comprometido": sum(e["mensal"] or 0 for e in ativos),
        "prioridade": [{"id": e["id"], "nome": e["nome"], "posicao": e["posicao"], "motivo": e["motivo_prioridade"]}
                       for e in prioridade(estados)],
    }


def mensal_comprometido(con) -> int:
    return painel(con)["mensal_comprometido"]


# ---------------------------------------------------------------- simulações

def simular_cartao(valor: int, fatura_sem_compra: int, vou_pagar: int | None, juros_rotativo: float,
                   juros_parcelamento: float = 9.0) -> dict:
    """Custo de pôr uma compra (ex.: MetaEds em 1x) no cartão. Pagar a fatura inteira = R$ 0 de juros."""
    fatura = fatura_sem_compra + valor
    pago = fatura if vou_pagar is None else min(vou_pagar, fatura)
    rotativo = max(0, fatura - pago)
    if rotativo == 0:
        return {"fatura": fatura, "rotativo": 0, "custo_1_mes": 0, "custo_12_meses": 0, "alerta": False,
                "mensagem": f"Pagando a fatura inteira ({brl(fatura)}) no vencimento, não há juros. "
                            "Só confirme que esse valor cabe no caixa do mês."}
    i = juros_rotativo / 100
    juros1 = rotativo * i
    iof1 = rotativo * (IOF_FIXO + IOF_DIARIO * 30)
    custo1 = round(juros1 + iof1)
    # Depois de 1 mês no rotativo o banco é obrigado a oferecer parcelamento; por lei (14.690/2023)
    # juros + encargos do rotativo/parcelamento não podem passar de 100% do valor original.
    ip = juros_parcelamento / 100
    pmt = rotativo * ip / (1 - (1 + ip) ** -12)
    custo12 = min(round(pmt * 12 - rotativo + custo1 + rotativo * IOF_FIXO), rotativo)
    taxa = f"{juros_rotativo:.1f}".replace(".", ",")
    return {
        "fatura": fatura, "rotativo": rotativo, "custo_1_mes": custo1, "custo_12_meses": custo12,
        "parcela_12x": round(pmt), "alerta": True,
        "mensagem": (f"{brl(rotativo)} ficariam no rotativo. Só no primeiro mês isso custa cerca de {brl(custo1)} "
                     f"(juros de {taxa}% a.m. + IOF). Se virar parcelamento em 12x, o custo total "
                     f"chega perto de {brl(custo12)}. Alternativas: negociar parcelas direto com o credor, "
                     "pagar parte à vista com reserva, ou adiar a compra até caber na fatura."),
    }


def simular_antecipacao(parcela: int, restantes: int, juros_mensal: float, antecipar: int) -> dict:
    """Quitar `antecipar` parcelas do fim hoje (desconto de juros, como manda o CDC art. 52 §2º)."""
    antecipar = max(0, min(antecipar, restantes))
    i = (juros_mensal or 0) / 100
    vp = 0.0
    for j in range(restantes - antecipar + 1, restantes + 1):
        vp += parcela / (1 + i) ** j if i else parcela
    nominal = parcela * antecipar
    return {"antecipar": antecipar, "pagar_hoje": round(vp), "nominal": nominal, "economia": round(nominal - vp),
            "restantes_depois": restantes - antecipar}


def juros_rotativo(con) -> float:
    try:
        return float(config(con, "juros_rotativo_mensal", "14.5"))
    except ValueError:
        return 14.5
