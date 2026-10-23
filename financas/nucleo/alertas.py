"""Motor de alertas: cada regra liga/desliga em Ajustes. Tom direto, gentil, sempre com uma ação."""
from __future__ import annotations

import json
from datetime import timedelta

from . import analises, dividas
from .db import config_int
from .util import agora_iso, brl, data_br, dias_restantes_mes, hoje, limites_mes, nome_mes, somar_meses


def _ativos(con) -> dict[str, dict]:
    return {r["tipo"]: json.loads(r["parametros"] or "{}")
            for r in con.execute("SELECT * FROM config_alertas WHERE ativo = 1")}


def renda_referencia(con, mes: str) -> int:
    fixa = config_int(con, "renda_mensal_esperada")
    if fixa:
        return fixa
    return max(analises.renda_media(con, mes), analises.totais_mes(con, mes)["receitas"])


def _parcelamento(con, p, mes):
    out = []
    renda = renda_referencia(con, mes) or None
    for g in analises.parcelamentos(con):
        recente = g["parcela_atual"] == 1 or g["primeira_vista"] >= limites_mes(somar_meses(mes, -1))[0]
        pct = f" ({g['valor_parcela'] / renda:.0%} da renda mensal)" if renda else ""
        out.append(dict(
            chave=f"parcelamento:{g['chave']}:{g['parcela_total']}:{g['valor_parcela']}",
            severidade=3 if recente else 2,
            titulo=f"Compra parcelada: {g['descricao'][:40]}",
            mensagem=(f"{g['parcela_atual']}/{g['parcela_total']} de {brl(g['valor_parcela'])}{pct} no "
                      f"{g['conta']}{' · ' + g['pessoa'] if g['pessoa'] else ''}. Ainda faltam {g['faltam']} parcelas: "
                      f"{brl(g['restante'])} da renda futura já estão comprometidos até {nome_mes(g['termina'])}."),
            acao=("Conversem sobre essa compra. Se ainda dá para cancelar ou pagar à vista com desconto, "
                  "geralmente sai mais barato." if recente else
                  "Já está em andamento: só não somem outra parcela até essa terminar."),
            transacao_id=g["id"]))
    return out


def _categoria_acima(con, p, mes):
    out = []
    medias = analises.media_categorias(con, mes)
    fator, minimo = p.get("fator", 1.3), p.get("minimo", 10000)
    for c in analises.gasto_por_categoria(con, mes):
        m = medias.get(c["id"])
        if not m or c["id"] == 0 or c["total"] < minimo or c["total"] <= m * fator:
            continue
        out.append(dict(chave=f"categoria:{mes}:{c['id']}", severidade=2,
                        titulo=f"{c['nome']} acima da média",
                        mensagem=f"Em {nome_mes(mes)} já foram {brl(c['total'])} em {c['nome']}, "
                                 f"contra uma média de {brl(int(m))} nos meses anteriores ({c['total'] / m - 1:+.0%}).",
                        acao="Abram os lançamentos dessa categoria e vejam o que puxou o valor para cima."))
    return out


def _fatura_orcamento(con, p, mes):
    limite = config_int(con, "limite_fatura_mensal")
    if not limite:
        return []
    gasto = analises.totais_mes(con, mes)["cartao"]
    if gasto < limite * p.get("percentual", 0.8):
        return []
    passou = gasto >= limite
    return [dict(chave=f"fatura:{mes}", severidade=3 if passou else 2,
                 titulo="Cartão passou do limite combinado" if passou else "Cartão perto do limite combinado",
                 mensagem=f"Compras no cartão em {nome_mes(mes)}: {brl(gasto)} de {brl(limite)} combinados "
                          f"({gasto / limite:.0%}).",
                 acao="Segurem compras não essenciais no cartão até a virada da fatura.")]


def _assinatura_nova(con, p, mes):
    out = []
    desde = limites_mes(somar_meses(mes, -1))[0]
    for r in analises.recorrentes(con):
        if r["primeira"] >= desde:
            out.append(dict(chave=f"assinatura:{r['chave']}", severidade=2,
                            titulo=f"Nova cobrança recorrente: {r['chave'].title()}",
                            mensagem=f"{brl(r['valor_medio'])} por mês desde {data_br(r['primeira'])} "
                                     f"({brl(r['valor_medio'] * 12)} por ano).",
                            acao="Se não estão usando, cancelem antes da próxima cobrança."))
    # assinatura que apareceu pela primeira vez neste mês (ainda sem histórico)
    ini, fim = limites_mes(mes)
    for r in con.execute("""
        SELECT t.id, t.chave, t.valor, t.data FROM transacoes t JOIN categorias c ON c.id = t.categoria_id
        WHERE c.nome = 'Assinaturas' AND t.valor < 0 AND t.data BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM transacoes t2 WHERE t2.chave = t.chave AND t2.data < ?)""",
                         (ini, fim, ini)):
        out.append(dict(chave=f"assinatura:{r['chave']}", severidade=1,
                        titulo=f"Assinatura nova: {(r['chave'] or '').title()}",
                        mensagem=f"Primeira cobrança de {brl(-r['valor'])} em {data_br(r['data'])}.",
                        acao="Foi de propósito? Se for teste grátis, anotem a data para cancelar.",
                        transacao_id=r["id"]))
    return out


def _fora_padrao(con, p, mes):
    out = []
    fator, minimo = p.get("fator", 3), p.get("minimo", 20000)
    ini, fim = limites_mes(mes)
    for t in con.execute("""
        SELECT t.id, t.descricao, t.valor, t.data, t.categoria_id, c.nome AS categoria FROM transacoes t
        JOIN categorias c ON c.id = t.categoria_id
        WHERE t.valor < 0 AND t.tipo = 'normal' AND c.tipo = 'despesa' AND t.data BETWEEN ? AND ?
          AND -t.valor >= ?""", (ini, fim, minimo)):
        hist = [-r["valor"] for r in con.execute(
            "SELECT valor FROM transacoes WHERE categoria_id = ? AND valor < 0 AND data < ? AND data >= ?",
            (t["categoria_id"], ini, limites_mes(somar_meses(mes, -6))[0]))]
        if len(hist) < 4:
            continue
        hist.sort()
        med = hist[len(hist) // 2]
        if -t["valor"] >= med * fator:
            out.append(dict(chave=f"fora_padrao:{t['id']}", severidade=2,
                            titulo=f"Gasto alto em {t['categoria']}",
                            mensagem=f"{t['descricao'][:50]}: {brl(-t['valor'])} em {data_br(t['data'])}. "
                                     f"O normal nessa categoria fica perto de {brl(med)}.",
                            acao="Se foi planejado, tudo certo. Se não, vale entender o que aconteceu.",
                            transacao_id=t["id"]))
    return out


def _vencimentos(con, p, mes):
    out = []
    dias = p.get("dias", 3)
    h = hoje()
    for d in dividas.painel(con)["dividas"]:
        if not d["dia_vencimento"] or d["termino"] == "quitada":
            continue
        alvo = dividas.proxima_data_dia(d["dia_vencimento"], h)
        pago_mes = any(pg["data"][:7] == alvo.strftime("%Y-%m") for pg in d["pagamentos"])
        if (alvo - h).days <= dias and not pago_mes:
            out.append(dict(chave=f"venc:{d['id']}:{alvo}", severidade=3 if (alvo - h).days <= 1 else 2,
                            titulo=f"{d['nome']} vence {'hoje' if alvo == h else 'em ' + data_br(alvo.isoformat())}",
                            mensagem=f"Parcela de {brl(d['parcela_valor'] or d['mensal'])}.",
                            acao="Deixem o valor separado na conta de onde sai o pagamento."))
        # passou do dia + folga e não achamos o pagamento no extrato
        venc_mes = h.replace(day=min(d["dia_vencimento"], 28))
        folga = d["reconhecer_janela"] or 4
        if h > venc_mes + timedelta(days=folga) and not any(pg["data"][:7] == h.strftime("%Y-%m")
                                                              for pg in d["pagamentos"]):
            out.append(dict(chave=f"venc_nao_achado:{d['id']}:{h.strftime('%Y-%m')}", severidade=2,
                            titulo=f"Não achei o pagamento de {d['nome']} deste mês",
                            mensagem="Pode ser que o extrato ainda não tenha sido importado, ou que o pagamento "
                                     "tenha saído com outro valor.",
                            acao="Importem o extrato mais recente ou classifiquem o pagamento na fila de dúvidas."))
    for c in con.execute("SELECT * FROM contas WHERE tipo = 'cartao' AND ativa = 1 AND dia_vencimento IS NOT NULL"):
        alvo = dividas.proxima_data_dia(c["dia_vencimento"], h)
        if (alvo - h).days <= dias:
            out.append(dict(chave=f"venc_fatura:{c['id']}:{alvo}", severidade=2,
                            titulo=f"Fatura {c['nome']} vence em {data_br(alvo.isoformat())}",
                            mensagem="Pagar o valor total evita juros do rotativo (os mais caros do mercado).",
                            acao="Confiram o valor no app e agendem o pagamento integral."))
    return out


def _saldo_negativo(con, p, mes):
    if mes != hoje().strftime("%Y-%m"):
        return []
    renda = renda_referencia(con, mes)
    if not renda:
        return []
    tot = analises.totais_mes(con, mes)
    dia = hoje().day
    dias_mes = dia + dias_restantes_mes() - 1
    if dia < 5:
        return []
    projetado = tot["despesas"] / dia * dias_mes
    if projetado <= renda:
        return []
    return [dict(chave=f"saldo_neg:{mes}", severidade=3, titulo="No ritmo atual, o mês fecha no vermelho",
                 mensagem=f"Gastos projetados para {nome_mes(mes)}: {brl(int(projetado))}, para uma renda de "
                          f"{brl(renda)}. Diferença de {brl(int(projetado - renda))}.",
                 acao="Escolham uma ou duas categorias para segurar até o fim do mês.")]


def _fila(con, p, mes):
    n = con.execute("SELECT COUNT(*) FROM transacoes WHERE classificacao = 'duvida'").fetchone()[0]
    if n < p.get("minimo", 8):
        return []
    return [dict(chave="fila_duvidas", severidade=1, titulo=f"{n} lançamentos esperando vocês",
                 mensagem="Cada clique ensina o sistema: os parecidos se classificam sozinhos depois.",
                 acao="Abram a fila de dúvidas e classifiquem os primeiros.")]


GERADORES = {
    "parcelamento": _parcelamento, "categoria_acima_media": _categoria_acima,
    "fatura_orcamento": _fatura_orcamento, "assinatura_nova": _assinatura_nova,
    "gasto_fora_padrao": _fora_padrao, "vencimento_proximo": _vencimentos,
    "saldo_projetado_negativo": _saldo_negativo, "fila_duvidas": _fila,
}


def gerar(con, mes: str | None = None) -> int:
    """Recalcula todos os alertas ligados. Devolve quantos alertas são novos."""
    mes = mes or hoje().strftime("%Y-%m")
    ativos = _ativos(con)
    agora = agora_iso()
    con.execute("UPDATE alertas SET ativo = 0")
    novos = 0
    for tipo, fn in GERADORES.items():
        if tipo not in ativos:
            continue
        for a in fn(con, ativos[tipo], mes):
            existe = con.execute("SELECT id FROM alertas WHERE chave = ?", (a["chave"],)).fetchone()
            if existe:
                con.execute("UPDATE alertas SET titulo=?, mensagem=?, acao=?, severidade=?, ativo=1, atualizado_em=? "
                            "WHERE id=?", (a["titulo"], a["mensagem"], a.get("acao"), a["severidade"], agora,
                                           existe["id"]))
            else:
                con.execute("INSERT INTO alertas (tipo, chave, severidade, titulo, mensagem, acao, transacao_id, "
                            "criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?)",
                            (tipo, a["chave"], a["severidade"], a["titulo"], a["mensagem"], a.get("acao"),
                             a.get("transacao_id"), agora, agora))
                novos += 1
    con.commit()
    return novos


def listar(con, limite: int | None = None, incluir_dispensados=False) -> list[dict]:
    sql = "SELECT * FROM alertas WHERE ativo = 1" + ("" if incluir_dispensados else " AND dispensado = 0")
    sql += " ORDER BY severidade DESC, criado_em DESC"
    if limite:
        sql += f" LIMIT {int(limite)}"
    return [dict(r) for r in con.execute(sql)]
