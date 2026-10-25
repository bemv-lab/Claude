"""Fase 2: orçamento realista, projeção de saldo e plano de quitação das dívidas.

Tudo parte do que vocês gastaram de verdade nos últimos meses completos. Contas essenciais que aparecem
todo mês (aluguel, energia) usam a mediana: um mês fora da curva, como o de dois aluguéis na mudança, não
puxa a conta. As demais usam a média, que não esconde os meses mais caros.
"""
from __future__ import annotations

import math
from statistics import mean, median

from . import analises, dividas, rendas
from .db import config_int, definir_config
from .util import hoje, limites_mes, somar_meses

MESES_REFERENCIA = 3
MARGEM_PROJECAO = 0.20       # o extra sugerido para as dívidas deixa 20% da sobra prevista como margem
CORTE_MAXIMO = 0.30          # nenhuma categoria variável é cortada em mais de 30%
# Contrato, moradia e saúde não entram no corte sugerido (cortar aqui não depende só de vontade).
ESSENCIAIS = {"Aluguel", "Moradia", "Condomínio", "Energia", "Contas da casa", "Internet Fixa", "IPTU", "Impostos",
              "Imposto LB", "Saúde", "Farmácia", "Terapia", "Educação", "Negócios"}


def meses_referencia(con, n: int = MESES_REFERENCIA) -> list[str]:
    """Os últimos `n` meses completos (antes do mês atual) que têm gastos."""
    atual = hoje().strftime("%Y-%m")
    out = []
    for k in range(1, 13):
        m = somar_meses(atual, -k)
        if analises.totais_mes(con, m)["despesas"] > 0:
            out.append(m)
        if len(out) == n:
            break
    return sorted(out)


def _valor_tipico(valores: list[int], essencial: bool) -> int:
    if not valores:
        return 0
    return int(median(valores)) if essencial and all(v > 0 for v in valores) else int(mean(valores))


def _por_categoria(con, meses: list[str], tipo_cat: str, so_avulsos: bool,
                   com_beneficio: bool = False, cartao: bool | None = None) -> dict[int, dict]:
    """Total por categoria em cada mês. `so_avulsos` tira parcelas de cartão e pagamentos de dívida
    (a projeção soma esses dois pelo calendário de cada um). `com_beneficio` inclui o que foi pago com o Flash,
    como faz a comparação com o orçado na Início."""
    sinal = "-" if tipo_cat == "despesa" else ""
    filtro = "AND t.parcela_total IS NULL AND t.divida_id IS NULL" if so_avulsos else ""
    base = "t.tipo = 'normal'" if com_beneficio else analises.FILTRO_REAL
    if cartao is not None:
        filtro += " AND c.tipo " + ("= 'cartao'" if cartao else "!= 'cartao'")
    acum: dict[int, dict] = {}
    for i, m in enumerate(meses):
        for r in con.execute(f"""
            SELECT cat.id, cat.nome, cat.orcamento, {sinal}SUM(t.valor) AS total
            FROM transacoes t JOIN contas c ON c.id = t.conta_id JOIN categorias cat ON cat.id = t.categoria_id
            WHERE {base} AND cat.tipo = ? AND t.mes_ref = ? {filtro}
            GROUP BY cat.id""", (tipo_cat, m)):
            c = acum.setdefault(r["id"], {"id": r["id"], "nome": r["nome"], "orcamento": r["orcamento"],
                                          "meses": [0] * len(meses)})
            c["meses"][i] = max(0, r["total"])
    for c in acum.values():
        c["tipico"] = _valor_tipico(c["meses"], c["nome"] in ESSENCIAIS or tipo_cat == "receita")
    return acum


def renda_prevista(con, meses: list[str] | None = None) -> dict:
    """Renda de um mês normal: as entradas fixas (salários, editáveis) mais as outras entradas típicas
    (renda extra, reembolsos), calculadas pelos meses de referência. Salário fica de fora do típico."""
    meses = meses or meses_referencia(con)
    cats = _por_categoria(con, meses, "receita", so_avulsos=False)
    outras = sum(c["tipico"] for c in cats.values() if c["nome"] != "Salário")
    fixas = [{"nome": f["descricao"], "tipico": f["valor"], "meses": []} for f in rendas.ativas(con, _mes_atual())]
    outras_fontes = [{"nome": c["nome"], "tipico": c["tipico"], "meses": c["meses"]}
                     for c in cats.values() if c["nome"] != "Salário" and c["tipico"]]
    return {"valor": sum(f["tipico"] for f in fixas) + outras, "informada": False, "outras": outras,
            "fontes": sorted(fixas + outras_fontes, key=lambda x: -x["tipico"])}


def _dividas_fixas_no_mes(painel: dict, mes: str) -> list[dict]:
    """Parcelas de contrato (consignado, empréstimos) que ainda caem em `mes`."""
    out = []
    for d in painel["dividas"]:
        if d["termino"] == "quitada" or not d["mensal"] or not d["parcela_valor"]:
            continue
        if d["termino"] and d["termino"] < mes:
            continue
        out.append({"nome": d["nome"], "valor": d["mensal"]})
    return out


def projecao(con, meses: int = 3) -> dict:
    """Resultado previsto dos próximos meses: renda − dia a dia − parcelas de cartão − dívidas de contrato."""
    ref = meses_referencia(con)
    renda = renda_prevista(con, ref)
    cats = _por_categoria(con, ref, "despesa", so_avulsos=True)
    dia_a_dia = sum(c["tipico"] for c in cats.values())
    painel = dividas.painel(con)
    base = hoje().strftime("%Y-%m")
    agenda = {x["mes"]: x["valor"] for x in analises.agenda_parcelas(con, somar_meses(base, 1), meses)}
    from .previstos import manuais_por_mes
    manuais = manuais_por_mes(con, [somar_meses(base, k) for k in range(1, meses + 1)])
    linhas, acumulado = [], 0
    for k in range(1, meses + 1):
        m = somar_meses(base, k)
        parcelas = agenda.get(m, 0)          # no cartão, pelo mês da fatura
        fixas = _dividas_fixas_no_mes(painel, m)
        total_dividas = sum(d["valor"] for d in fixas)
        man = manuais[m]
        renda_m = rendas.valor_mes(con, m) + renda["outras"]
        resultado = renda_m + man["entradas"] - dia_a_dia - parcelas - total_dividas - man["saidas"]
        acumulado += resultado
        linhas.append({"mes": m, "renda": renda_m, "dia_a_dia": dia_a_dia, "parcelas": parcelas,
                       "previstos_entradas": man["entradas"], "previstos_saidas": man["saidas"],
                       "previstos_itens": man["itens"],
                       "dividas": total_dividas, "dividas_itens": fixas, "resultado": resultado,
                       "acumulado": acumulado})
    return {"meses_referencia": ref, "renda": renda, "dia_a_dia": dia_a_dia,
            "dia_a_dia_categorias": sorted(({"nome": c["nome"], "tipico": c["tipico"]} for c in cats.values()
                                            if c["tipico"] > 0), key=lambda x: -x["tipico"]),
            "meses": linhas,
            "primeiro_positivo": next((x["mes"] for x in linhas if x["resultado"] >= 0), None)}


def _arred(v: float, para_cima: bool) -> int:
    """Arredonda para múltiplos de R$ 10 (em centavos)."""
    f = math.ceil if para_cima else math.floor
    return int(f(v / 1000) * 1000)


def orcamento_sugerido(con, liberar: int = 0) -> dict:
    """Orçado por categoria a partir do gasto real. Se o mês típico não fecha (ou se vocês querem liberar
    `liberar` por mês para dívidas e reserva), distribui o corte entre as categorias que dependem de escolha,
    no máximo 30% de cada, e diz quanto ainda faltaria."""
    ref = meses_referencia(con)
    proj = projecao(con, 1)
    deficit = max(0, -proj["meses"][0]["resultado"]) if proj["meses"] else 0
    alvo = deficit + max(0, liberar)
    cats = [c for c in _por_categoria(con, ref, "despesa", so_avulsos=False, com_beneficio=True).values() if c["tipico"] > 0]
    # o corte só conta o que sai das contas: gastar menos do Flash não libera dinheiro
    caixa = {k: c["tipico"] for k, c in _por_categoria(con, ref, "despesa", so_avulsos=False).items()}
    cortaveis = [dict(c, tipico=caixa.get(c["id"], 0)) for c in cats if c["nome"] not in ESSENCIAIS and caixa.get(c["id"])]
    corte = {c["id"]: 0.0 for c in cats}
    falta = float(alvo)
    livres = list(cortaveis)
    while falta > 1 and livres:          # proporcional ao tamanho, respeitando o teto de cada uma
        soma = sum(c["tipico"] for c in livres)
        proximos = []
        distribuido = 0.0
        for c in livres:
            quer = falta * c["tipico"] / soma
            teto = c["tipico"] * CORTE_MAXIMO - corte[c["id"]]
            dado = min(quer, teto)
            corte[c["id"]] += dado
            distribuido += dado
            if teto - dado > 1:
                proximos.append(c)
        falta -= distribuido
        if distribuido < 1:
            break
        livres = proximos
    itens = []
    for c in sorted(cats, key=lambda x: -x["tipico"]):
        essencial = c["nome"] in ESSENCIAIS
        cortar = corte[c["id"]] >= 500                     # menos de R$ 5 não vale a pena pedir
        sugestao = _arred(c["tipico"] - (corte[c["id"]] if cortar else 0), para_cima=True)
        itens.append({"id": c["id"], "nome": c["nome"], "meses": c["meses"], "tipico": c["tipico"],
                      "orcamento": c["orcamento"], "sugestao": sugestao, "essencial": essencial,
                      "_piso": c["tipico"] - caixa.get(c["id"], 0) * CORTE_MAXIMO if cortar else None})
    # arredondado para cima, o corte fica um pouco abaixo do alvo: completa de R$ 10 em R$ 10,
    # sempre na categoria com mais folga até o teto de 30%
    def total():
        return sum(max(0, i["tipico"] - i["sugestao"]) for i in itens)
    while alvo and total() < alvo:
        candidatas = [i for i in itens if i["_piso"] is not None and i["sugestao"] - 1000 >= i["_piso"]]
        if not candidatas:
            break
        max(candidatas, key=lambda i: i["sugestao"] - i["_piso"])["sugestao"] -= 1000
    for i in itens:
        i["corte"] = i["tipico"] - i["sugestao"]
        del i["_piso"]
    total_corte = total()
    return {"meses_referencia": ref, "itens": itens, "deficit": deficit, "liberar": max(0, liberar), "alvo": alvo,
            "corte_sugerido": total_corte,
            "falta_depois_do_corte": alvo - total_corte if alvo - total_corte >= 1000 else 0,   # < R$ 10 é arredondamento
            "total_tipico": sum(i["tipico"] for i in itens), "total_sugerido": sum(i["sugestao"] for i in itens),
            "total_orcado": sum(i["orcamento"] or 0 for i in itens)}


def aplicar_orcamento(con, itens: list[dict], limpar_outros: bool = True) -> int:
    """Grava o orçado de cada categoria e o total do mês (sem a categoria Dívidas, que tem plano próprio).
    Com `limpar_outros`, as categorias de gasto fora da lista ficam sem orçado: assim o total é a soma do que
    vocês de fato orçaram, sem sobras antigas da planilha."""
    if limpar_outros:
        ids = [int(i["id"]) for i in itens]
        con.execute(f"UPDATE categorias SET orcamento = NULL WHERE tipo = 'despesa' "
                    f"AND id NOT IN ({','.join('?' * len(ids)) or 'NULL'})", ids)
    for i in itens:
        con.execute("UPDATE categorias SET orcamento = ? WHERE id = ?", (i["orcamento"] or None, int(i["id"])))
    total = con.execute("SELECT COALESCE(SUM(orcamento), 0) FROM categorias WHERE tipo = 'despesa' AND ativa = 1"
                        ).fetchone()[0]
    definir_config(con, "orcamento_mensal", total)
    con.commit()
    return total


def plano_quitacao(con, extra_mensal: int, bola_de_neve: bool = True, limite_meses: int = 120) -> dict:
    """Mês a mês: contratos seguem o calendário; o valor extra vai para a dívida no topo da ordem sugerida
    (urgência > juros > saldo). Com bola de neve, a parcela de um contrato que termina passa a reforçar o extra.
    Antecipar parcelas de contrato aqui abate o valor de face: na prática o desconto de juros deixa ainda melhor."""
    painel = dividas.painel(con)
    ordem = [p["id"] for p in painel["prioridade"]]
    pri = {e["id"]: e for e in dividas.prioridade(painel["dividas"])}
    ds = []
    for e in painel["dividas"]:
        if e["termino"] == "quitada" or not e["saldo_atual"]:
            continue
        contrato = bool(e["parcela_valor"] and e["mensal"])
        ds.append({"id": e["id"], "nome": e["nome"], "saldo": float(e["saldo_atual"]), "inicial": e["saldo_atual"],
                   "parcela": e["mensal"] if contrato else (e["plano_mensal"] or 0), "contrato": contrato,
                   "juros": 0.0 if contrato else pri.get(e["id"], {}).get("juros_considerado", 0.0) / 100,
                   "juros_estimado": pri.get(e["id"], {}).get("juros_estimado", False) and not contrato,
                   # dívida de cartão: juros e encargos limitados a 100% do valor original (Lei 14.690/2023)
                   "teto_juros": float(e["saldo_atual"]) if e["tipo"] == "cartao" else None,
                   "quitada_em": None, "juros_pagos": 0.0, "pago": 0.0, "saldo_12": None})
    ds.sort(key=lambda d: ordem.index(d["id"]) if d["id"] in ordem else 99)
    base = hoje().strftime("%Y-%m")
    serie = [{"mes": base, "saldo": round(sum(d["saldo"] for d in ds))}]
    liberado = 0
    mes = base
    for k in range(1, limite_meses + 1):
        mes = somar_meses(base, k)
        if all(d["quitada_em"] for d in ds):
            break
        for d in ds:                       # juros do mês nas dívidas sem contrato
            if not d["quitada_em"] and d["juros"]:
                j = d["saldo"] * d["juros"]
                if d["teto_juros"] is not None:
                    j = max(0.0, min(j, d["teto_juros"] - d["juros_pagos"]))
                d["saldo"] += j
                d["juros_pagos"] += j
        sobra = float(extra_mensal + (liberado if bola_de_neve else 0))
        for d in ds:                       # parcelas e planos combinados
            if d["quitada_em"] or not d["parcela"]:
                continue
            pago = min(d["parcela"], d["saldo"])
            d["saldo"] -= pago
            d["pago"] += pago
            sobra += d["parcela"] - pago
        for d in ds:                       # o extra vai para a primeira da fila
            if sobra <= 0:
                break
            if d["quitada_em"] or d["saldo"] <= 0:
                continue
            pago = min(sobra, d["saldo"])
            d["saldo"] -= pago
            d["pago"] += pago
            sobra -= pago
        for d in ds:
            if not d["quitada_em"] and d["saldo"] <= 0.5:
                d["saldo"] = 0.0
                d["quitada_em"] = mes
                liberado += d["parcela"]
        serie.append({"mes": mes, "saldo": round(sum(d["saldo"] for d in ds))})
        if k == 12:
            for d in ds:
                d["saldo_12"] = round(d["saldo"])
    nunca = [d["nome"] for d in ds if not d["quitada_em"]]
    crescendo = [d["nome"] for d in ds if not d["quitada_em"] and d["saldo"] > d["inicial"]]
    return {
        "extra_mensal": extra_mensal, "bola_de_neve": bola_de_neve,
        "livre_em": None if nunca else max(d["quitada_em"] for d in ds) if ds else base,
        "juros_total": round(sum(d["juros_pagos"] for d in ds)),
        "nao_quitam": nunca, "crescendo": crescendo, "limite_meses": limite_meses,
        "dividas": [{"id": d["id"], "nome": d["nome"], "saldo_hoje": d["inicial"], "quitada_em": d["quitada_em"],
                     "juros_pagos": round(d["juros_pagos"]), "contrato": d["contrato"],
                     "juros_mensal": round(d["juros"] * 100, 2), "juros_estimado": d["juros_estimado"],
                     "parcela": d["parcela"], "saldo_em_12_meses": d["saldo_12"],
                     "teto_juros": d["teto_juros"] is not None} for d in ds],
        "serie": serie,
    }


def extra_sugerido(sobra_prevista: int, liberado_no_orcamento: int = 0) -> int:
    """80% da sobra prevista (a projeção é estimativa) mais o que o corte no orçamento libera,
    arredondado para baixo em R$ 50."""
    v = max(0, sobra_prevista) * (1 - MARGEM_PROJECAO) + max(0, liberado_no_orcamento)
    return int(v // 5000 * 5000)


def plano(con, extra_mensal: int | None = None, meses: int = 3, bola_de_neve: bool = True,
          liberar: int = 0) -> dict:
    """Tudo da tela Plano. Sem valor extra informado, usa o sugerido."""
    proj = projecao(con, meses)
    orc = orcamento_sugerido(con, liberar)
    sobra = proj["meses"][0]["resultado"] if proj["meses"] else 0
    sugerido = extra_sugerido(sobra, min(orc["corte_sugerido"], orc["alvo"]) - orc["deficit"])
    extra = sugerido if extra_mensal is None else max(0, extra_mensal)
    return {"projecao": proj, "orcamento": orc,
            "quitacao": plano_quitacao(con, extra, bola_de_neve),
            "sem_extra": {k: v for k, v in plano_quitacao(con, 0, bola_de_neve).items() if k != "serie"},
            "extra_sugerido": sugerido, "margem": MARGEM_PROJECAO}


def _mes_atual() -> str:
    return hoje().strftime("%Y-%m")
