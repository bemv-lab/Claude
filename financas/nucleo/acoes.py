"""Plano de ação dos encontros de alinhamento do casal.

Cada encontro registra notas e compromissos ("não comprar roupas até o próximo encontro"). Um compromisso pode
ser ligado a uma categoria com um limite em R$ para o período (0 = não gastar nada): aí o sistema acompanha
sozinho, comparando com o mesmo número de dias antes do compromisso. Os livres são acompanhados pelo que vocês
registram em cada encontro. A análise compara dois períodos quaisquer (padrão: desde o último encontro contra o
intervalo anterior do mesmo tamanho).
"""
from __future__ import annotations

from datetime import date, timedelta

from .db import linhas
from .util import agora_iso, hoje

STATUS = {"ativa": "Em andamento", "cumprida": "Cumprida", "parcial": "Cumprida em parte",
          "nao_cumprida": "Não cumprida", "cancelada": "Cancelada"}


def _d(iso: str) -> date:
    return date.fromisoformat(iso[:10])


def gasto_categoria(con, categoria_id: int, ini: str, fim: str) -> dict:
    """Gasto da categoria no período, com o Flash (é gasto do mesmo jeito)."""
    itens = linhas(con.execute(
        """SELECT t.id, t.data, t.descricao, t.produto, -t.valor AS valor, c.nome AS conta
           FROM transacoes t JOIN contas c ON c.id = t.conta_id
           WHERE t.tipo = 'normal' AND t.categoria_id = ? AND t.data BETWEEN ? AND ? ORDER BY t.data""",
        (categoria_id, ini, fim)))
    return {"total": sum(i["valor"] for i in itens), "itens": itens}


def avaliar(con, a: dict) -> dict:
    """Situação do compromisso hoje."""
    a = dict(a)
    ref = hoje()
    ini, fim = _d(a["inicio"]), _d(a["fim"])
    ate = min(fim, ref)
    dias_total = (fim - ini).days + 1
    dias_passados = max(0, min(dias_total, (ate - ini).days + 1))
    a["dias_total"], a["dias_passados"] = dias_total, dias_passados
    a["dias_restantes"] = max(0, (fim - ref).days)
    a["encerrada"] = ref > fim
    a["status_nome"] = STATUS.get(a["status"], a["status"])
    a["registros"] = linhas(con.execute("SELECT * FROM acao_registros WHERE acao_id = ? ORDER BY data DESC, id DESC",
                                        (a["id"],)))
    if a["categoria_id"] and dias_passados:
        g = gasto_categoria(con, a["categoria_id"], a["inicio"], ate.isoformat())
        antes_fim = ini - timedelta(days=1)
        antes_ini = ini - timedelta(days=dias_passados)
        base = gasto_categoria(con, a["categoria_id"], antes_ini.isoformat(), antes_fim.isoformat())
        a["gasto"], a["itens"] = g["total"], g["itens"][-8:]
        a["gasto_antes"] = base["total"]
        a["periodo_antes"] = [antes_ini.isoformat(), antes_fim.isoformat()]
        a["economia"] = base["total"] - g["total"]
        limite = a["limite"]
        if limite is None:
            a["situacao"] = "melhor" if g["total"] < base["total"] else "igual" if g["total"] == base["total"] else "pior"
        elif limite == 0:
            a["situacao"] = "cumprindo" if g["total"] == 0 else "quebrou"
        else:
            ritmo = g["total"] / limite
            esperado = dias_passados / dias_total
            a["usado"] = round(ritmo, 3)
            a["situacao"] = ("quebrou" if g["total"] > limite else
                             "atencao" if ritmo > esperado + 0.15 else "cumprindo")
    else:
        ult = a["registros"][0] if a["registros"] else None
        a["situacao"] = {"cumprida": "cumprindo", "parcial": "atencao", "nao_cumprida": "quebrou"}.get(
            (ult or {}).get("status"), "sem_registro")
    return a


def encontros(con) -> list[dict]:
    out = []
    for e in linhas(con.execute("SELECT * FROM encontros ORDER BY data DESC, id DESC")):
        e["acoes"] = [avaliar(con, a) for a in con.execute(
            "SELECT a.*, c.nome AS categoria FROM acoes a LEFT JOIN categorias c ON c.id = a.categoria_id "
            "WHERE a.encontro_id = ? ORDER BY a.id", (e["id"],))]
        out.append(e)
    return out


def acoes_ativas(con) -> list[dict]:
    return [avaliar(con, a) for a in con.execute(
        "SELECT a.*, c.nome AS categoria FROM acoes a LEFT JOIN categorias c ON c.id = a.categoria_id "
        "WHERE a.status = 'ativa' ORDER BY a.fim, a.id")]


def _totais(con, ini: str, fim: str) -> dict:
    r = con.execute(
        """SELECT COALESCE(SUM(CASE WHEN t.valor > 0 AND cat.tipo = 'receita' THEN t.valor END), 0) AS entradas,
                  COALESCE(SUM(CASE WHEN cat.tipo IN ('despesa','divida') THEN -t.valor END), 0) AS saidas
           FROM transacoes t JOIN contas c ON c.id = t.conta_id LEFT JOIN categorias cat ON cat.id = t.categoria_id
           WHERE t.tipo = 'normal' AND c.tipo != 'beneficio' AND t.data BETWEEN ? AND ?""", (ini, fim)).fetchone()
    cats = {r["nome"]: r["total"] for r in con.execute(
        """SELECT cat.nome, -SUM(t.valor) AS total FROM transacoes t JOIN categorias cat ON cat.id = t.categoria_id
           WHERE t.tipo = 'normal' AND cat.tipo = 'despesa' AND t.data BETWEEN ? AND ? GROUP BY cat.nome""", (ini, fim))}
    return {"ini": ini, "fim": fim, "entradas": r["entradas"], "saidas": r["saidas"],
            "saldo": r["entradas"] - r["saidas"], "categorias": cats, "dias": (_d(fim) - _d(ini)).days + 1}


def analise(con, ini: str | None = None, fim: str | None = None,
            ini_antes: str | None = None, fim_antes: str | None = None) -> dict:
    """Compara dois períodos. Sem datas: do último encontro até hoje contra o intervalo anterior do mesmo
    tamanho (sem encontro: os últimos 30 dias)."""
    ref = hoje()
    if not ini:
        ult = con.execute("SELECT MAX(data) FROM encontros").fetchone()[0]
        ini = ult if ult and _d(ult) < ref else (ref - timedelta(days=29)).isoformat()
        fim = ref.isoformat()
    fim = fim or ref.isoformat()
    if not ini_antes:
        dias = (_d(fim) - _d(ini)).days + 1
        fim_antes = (_d(ini) - timedelta(days=1)).isoformat()
        ini_antes = (_d(ini) - timedelta(days=dias)).isoformat()
    a, b = _totais(con, ini_antes, fim_antes), _totais(con, ini, fim)
    # gasto por dia, para comparar períodos de tamanhos diferentes
    fa, fb = 1 / a["dias"], 1 / b["dias"]
    variacoes = []
    for nome in set(a["categorias"]) | set(b["categorias"]):
        va, vb = a["categorias"].get(nome, 0), b["categorias"].get(nome, 0)
        variacoes.append({"categoria": nome, "antes": va, "agora": vb,
                          "diferenca_por_dia": round(vb * fb - va * fa), "diferenca": vb - round(va * b["dias"] / a["dias"])})
    variacoes.sort(key=lambda x: x["diferenca"])
    return {"antes": a, "agora": b, "melhoraram": [v for v in variacoes if v["diferenca"] < -1000][:6],
            "pioraram": [v for v in reversed(variacoes) if v["diferenca"] > 1000][:6],
            "acoes": [avaliar(con, x) for x in con.execute(
                "SELECT a.*, c.nome AS categoria FROM acoes a LEFT JOIN categorias c ON c.id = a.categoria_id "
                "WHERE a.inicio <= ? AND a.fim >= ? ORDER BY a.id", (fim, ini))]}


def criar_encontro(con, data: str, titulo: str | None, notas: str | None) -> int:
    cur = con.execute("INSERT INTO encontros (data, titulo, notas, criado_em) VALUES (?,?,?,?)",
                      (data, titulo, notas, agora_iso()))
    con.commit()
    return cur.lastrowid


def criar_acao(con, d: dict) -> int:
    if not d.get("texto") or not d.get("inicio") or not d.get("fim"):
        raise ValueError("Compromisso, início e fim são obrigatórios")
    cur = con.execute("""INSERT INTO acoes (encontro_id, texto, categoria_id, limite, inicio, fim, responsavel, status,
                         criado_em) VALUES (?,?,?,?,?,?,?, 'ativa', ?)""",
                      (d.get("encontro_id"), d["texto"], d.get("categoria_id") or None, d.get("limite"),
                       d["inicio"], d["fim"], d.get("responsavel") or "Casal", agora_iso()))
    con.commit()
    return cur.lastrowid


def registrar(con, acao_id: int, status: str | None, nota: str | None, encontro_id: int | None = None,
              data: str | None = None) -> None:
    """Anota como foi o compromisso; status final (cumprida, parcial, não cumprida) encerra a ação."""
    con.execute("INSERT INTO acao_registros (acao_id, encontro_id, data, status, nota) VALUES (?,?,?,?,?)",
                (acao_id, encontro_id, data or hoje().isoformat(), status, nota))
    if status in ("cumprida", "parcial", "nao_cumprida", "cancelada"):
        con.execute("UPDATE acoes SET status = ? WHERE id = ?", (status, acao_id))
    con.commit()
