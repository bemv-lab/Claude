"""Entradas fixas: salários e rendas que se repetem. O casal edita valor e dia; cada mudança vale a partir do mês
escolhido e os meses anteriores ficam como estavam. O que entra no extrato é ligado à entrada pelo texto do
extrato (padrão) e pelo dia mais próximo; o que falta é o que ainda vai entrar no mês."""
from __future__ import annotations

from .db import linhas
from .util import agora_iso, hoje, normalizar, somar_meses

CAMPOS = ("descricao", "padrao", "dia", "valor", "pessoa_id", "observacao")


def _mes_atual() -> str:
    return hoje().strftime("%Y-%m")


def _valida(d: dict) -> dict:
    out = {k: d[k] for k in CAMPOS if d.get(k) not in (None, "")}
    if "dia" in out:
        out["dia"] = int(out["dia"])
        if not 1 <= out["dia"] <= 31:
            raise ValueError("Dia deve estar entre 1 e 31")
    if "valor" in out:
        out["valor"] = int(out["valor"])
    return out


def criar(con, d: dict) -> int:
    campos = _valida(d)
    if not campos.get("descricao") or not campos.get("padrao") or "dia" not in campos or "valor" not in campos:
        raise ValueError("Informe nome, texto do extrato, dia e valor")
    campos["inicio"] = d.get("inicio") or _mes_atual()
    campos["criado_em"] = agora_iso()
    cur = con.execute(f"INSERT INTO rendas_fixas ({', '.join(campos)}) VALUES ({', '.join('?' * len(campos))})",
                      tuple(campos.values()))
    con.commit()
    return cur.lastrowid


def _linha(con, rid: int) -> dict:
    r = con.execute("SELECT * FROM rendas_fixas WHERE id = ?", (rid,)).fetchone()
    if not r:
        raise ValueError("Entrada não encontrada")
    return dict(r)


def alterar(con, rid: int, d: dict, a_partir: str | None = None) -> None:
    """Muda valor/dia/nome. Se a mudança é de um mês depois do início, o trecho anterior fica como estava."""
    row = _linha(con, rid)
    campos = _valida(d)
    a_partir = a_partir or _mes_atual()
    if a_partir <= row["inicio"]:
        if campos:
            con.execute(f"UPDATE rendas_fixas SET {', '.join(k + ' = ?' for k in campos)} WHERE id = ?",
                        (*campos.values(), rid))
    else:
        con.execute("UPDATE rendas_fixas SET fim = ? WHERE id = ?", (somar_meses(a_partir, -1), rid))
        nova = {k: row[k] for k in CAMPOS if row.get(k) is not None}
        nova.update(campos)
        nova.update(inicio=a_partir, fim=row["fim"], criado_em=agora_iso())
        con.execute(f"INSERT INTO rendas_fixas ({', '.join(nova)}) VALUES ({', '.join('?' * len(nova))})",
                    tuple(nova.values()))
    con.commit()


def encerrar(con, rid: int, a_partir: str | None = None) -> None:
    row = _linha(con, rid)
    a_partir = a_partir or _mes_atual()
    if a_partir <= row["inicio"]:
        con.execute("DELETE FROM rendas_fixas WHERE id = ?", (rid,))
    else:
        fim = somar_meses(a_partir, -1)
        if row["fim"] is None or row["fim"] > fim:          # nunca estende uma entrada que já tinha acabado
            con.execute("UPDATE rendas_fixas SET fim = ? WHERE id = ?", (fim, rid))
    con.commit()


def ativas(con, mes: str) -> list[dict]:
    return linhas(con.execute(
        """SELECT r.*, p.nome AS pessoa FROM rendas_fixas r LEFT JOIN pessoas p ON p.id = r.pessoa_id
           WHERE r.inicio <= ? AND (r.fim IS NULL OR r.fim >= ?) ORDER BY r.dia, r.id""", (mes, mes)))


def valor_mes(con, mes: str) -> int:
    return sum(r["valor"] for r in ativas(con, mes))


def _entradas_do_mes(con, mes: str) -> list[dict]:
    return linhas(con.execute(
        """SELECT t.id, t.data, t.descricao, t.valor FROM transacoes t
           JOIN contas c ON c.id = t.conta_id JOIN categorias cat ON cat.id = t.categoria_id
           WHERE t.tipo = 'normal' AND c.tipo != 'beneficio' AND cat.tipo = 'receita' AND t.valor > 0
             AND t.mes_ref = ? ORDER BY t.data""", (mes,)))


def do_mes(con, mes: str) -> list[dict]:
    """Cada entrada fixa do mês: quanto já entrou, quanto falta e o estado (recebido, a receber, parcial, não entrou)."""
    fixas = ativas(con, mes)
    ligados: dict[int, list[dict]] = {f["id"]: [] for f in fixas}
    for t in _entradas_do_mes(con, mes):
        alvo = normalizar(t["descricao"])
        cands = [f for f in fixas if normalizar(f["padrao"]) in alvo]
        if cands:
            dia = int(t["data"][8:10])
            f = min(cands, key=lambda f: abs(f["dia"] - dia))
            ligados[f["id"]].append(t)
    atual = _mes_atual()
    out = []
    for f in fixas:
        txs = ligados[f["id"]]
        recebido = sum(t["valor"] for t in txs)
        if recebido >= f["valor"] * 0.97:
            st = "recebido"
        elif mes >= atual:
            st = "a_receber"
        elif recebido > 0:
            st = "parcial"
        else:
            st = "nao_entrou"
        out.append({**f, "recebido": recebido, "falta": max(0, f["valor"] - recebido) if st == "a_receber" else 0,
                    "status": st, "lancamentos": [{"data": t["data"], "descricao": t["descricao"], "valor": t["valor"]}
                                                  for t in txs]})
    return out
