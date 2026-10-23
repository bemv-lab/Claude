"""Números da home: saldo do mês, quanto ainda dá para gastar, metas, alertas, fila de dúvidas."""
from __future__ import annotations

from . import alertas, analises, dividas
from .db import config_int, linhas
from .util import dias_restantes_mes, hoje, nome_mes, somar_meses


def orcamento(con, mes: str) -> dict:
    renda = alertas.renda_referencia(con, mes)
    compromissos = dividas.mensal_comprometido(con)
    poupanca = config_int(con, "meta_poupanca_mensal")
    fixo = config_int(con, "orcamento_mensal")
    automatico = not fixo
    limite = fixo or max(0, renda - compromissos - poupanca)
    tot = analises.totais_mes(con, mes)
    gasto = tot["despesas"] - tot["dividas"]      # dívidas já saíram do orçamento acima
    restante = limite - gasto
    atual = mes == hoje().strftime("%Y-%m")
    dias = dias_restantes_mes() if atual else 0
    return {"renda_referencia": renda, "compromissos_dividas": compromissos, "meta_poupanca": poupanca,
            "limite": limite, "automatico": automatico, "gasto": gasto, "restante": restante,
            "por_dia": int(restante / dias) if dias and restante > 0 else 0, "dias_restantes": dias,
            "percentual": round(gasto / limite, 3) if limite else None}


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
    ultima = con.execute("SELECT MAX(data) AS d FROM transacoes").fetchone()["d"]
    ultima_imp = con.execute("SELECT MAX(criado_em) AS d FROM importacoes WHERE status='ok'").fetchone()["d"]
    return {
        "mes": mes, "mes_nome": nome_mes(mes),
        "receitas": tot["receitas"], "despesas": tot["despesas"], "saldo": tot["receitas"] - tot["despesas"],
        "saldo_mes_anterior": ant["receitas"] - ant["despesas"], "despesas_mes_anterior": ant["despesas"],
        "entradas_pendentes": tot["entradas_pendentes"], "negocio": tot["negocio"],
        "orcamento": orcamento(con, mes),
        "categorias": cats[:6],
        "beneficios": [dict(r) for r in flash],
        "alertas": alertas.listar(con, 3),
        "duvidas": duvidas, "n_duvidas": n_duvidas,
        "metas": metas,
        "parcelas_restante": sum(p["restante"] for p in parc), "n_parcelamentos": len(parc),
        "dividas": {"total": painel["total_devido"], "mensal": painel["mensal_comprometido"],
                    "a_confirmar": painel["a_confirmar"]},
        "ultimo_lancamento": ultima, "ultima_importacao": ultima_imp,
        "vazio": ultima is None,
    }
