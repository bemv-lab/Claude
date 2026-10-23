"""Backup: cópia consistente do banco (API de backup do SQLite) numa pasta escolhida, ex.: Google Drive."""
from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

MANTER = 30


def fazer(origem: Path, destino: Path, manter: int = MANTER) -> dict:
    origem, destino = Path(origem), Path(destino).expanduser()
    if not origem.exists():
        raise FileNotFoundError(f"Banco não encontrado: {origem}")
    destino.mkdir(parents=True, exist_ok=True)
    alvo = destino / f"{origem.stem}-{datetime.now():%Y-%m-%d_%H%M%S}.db"
    src = sqlite3.connect(str(origem))
    dst = sqlite3.connect(str(alvo))
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    antigos = sorted(destino.glob(f"{origem.stem}-*.db"))[:-manter]
    for a in antigos:
        a.unlink()
    return {"ok": True, "arquivo": str(alvo), "removidos": len(antigos),
            "tamanho_kb": round(alvo.stat().st_size / 1024)}
