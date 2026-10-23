"""Transferências entre as contas do casal: viram par e saem de receitas/despesas."""
from __future__ import annotations

from datetime import date

from .db import categoria_id
from .util import normalizar

def _parece_transferencia(desc: str) -> bool:
    return any(w.startswith(("PIX", "TRANSF", "ENVIO", "RECEBIMENTO")) or w in ("TED", "DOC", "TEF")
               for w in normalizar(desc).split())


def parear(con, janela_dias: int = 3) -> int:
    """Junta saída numa conta + entrada de mesmo valor em outra conta nossa, em até `janela_dias`."""
    cat = categoria_id(con, "Transferência entre contas")
    candidatas = con.execute(
        "SELECT t.id, t.conta_id, t.data, t.valor, t.descricao, t.classificacao FROM transacoes t "
        "JOIN contas c ON c.id = t.conta_id "
        "WHERE t.par_id IS NULL AND t.tipo IN ('normal','transferencia') AND t.divida_id IS NULL "
        "AND c.tipo IN ('corrente','investimento') AND t.classificacao != 'manual' "
        "ORDER BY t.data").fetchall()
    entradas: dict[int, list] = {}
    for t in candidatas:
        if t["valor"] > 0:
            entradas.setdefault(t["valor"], []).append(t)
    usados: set[int] = set()
    pares = 0
    for s in candidatas:
        if s["valor"] >= 0 or s["id"] in usados:
            continue
        d0 = date.fromisoformat(s["data"])
        melhor = None
        for e in entradas.get(-s["valor"], []):
            if e["id"] in usados or e["conta_id"] == s["conta_id"]:
                continue
            dist = abs((date.fromisoformat(e["data"]) - d0).days)
            if dist > janela_dias:
                continue
            if not (_parece_transferencia(s["descricao"]) or _parece_transferencia(e["descricao"])):
                continue
            if melhor is None or dist < melhor[0]:
                melhor = (dist, e)
        if melhor:
            e = melhor[1]
            usados.update({s["id"], e["id"]})
            for a, b in ((s["id"], e["id"]), (e["id"], s["id"])):
                con.execute("UPDATE transacoes SET tipo='transferencia', categoria_id=?, par_id=?, "
                            "classificacao='heuristica', motivo_duvida=NULL, sugestao_id=NULL WHERE id=?",
                            (cat, b, a))
            pares += 1
    con.commit()
    return pares

