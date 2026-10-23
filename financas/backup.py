"""Copia o banco para uma pasta (ex.: Google Drive no computador). Guarda as 30 cópias mais recentes.

  python backup.py "G:/Meu Drive/Financas"      (Windows)
  python backup.py ~/"Google Drive/Financas"    (Mac)
  python backup.py                              usa a pasta salva em Ajustes
"""
import sys
from pathlib import Path

from nucleo import db
from nucleo.backup import fazer


def main():
    con = db.conectar(db.BANCO_REAL)
    pasta = sys.argv[1] if len(sys.argv) > 1 else db.config(con, "pasta_backup")
    if not pasta:
        print(__doc__)
        return 1
    if len(sys.argv) > 1:
        db.definir_config(con, "pasta_backup", pasta)
    con.close()
    r = fazer(db.BANCO_REAL, Path(pasta))
    print(f"Backup salvo em {r['arquivo']} ({r['tamanho_kb']} KB).")
    if r["removidos"]:
        print(f"{r['removidos']} cópia(s) antiga(s) removida(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
