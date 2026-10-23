"""Importa tudo o que estiver em entrada/ (OFX/CSV), sem duplicar, e mostra o que mudou.

  python importar.py          importa para o banco real
  python importar.py --demo   recria o banco de demonstração com dados fictícios
"""
import argparse
import sys

from nucleo import db, demo
from nucleo.importacao import atualizar, resumo_texto


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--demo", action="store_true", help="recria o modo demo (dados fictícios)")
    ap.add_argument("--pasta", help="outra pasta de entrada (padrão: entrada/)")
    a = ap.parse_args()
    if a.demo:
        r = demo.criar()
        print("Modo demo recriado em dados/demo.db\n")
    else:
        con = db.conectar(db.BANCO_REAL)
        from pathlib import Path
        r = atualizar(con, Path(a.pasta) if a.pasta else db.ENTRADA_REAL)
        con.close()
    print(resumo_texto(r))
    if r["pendentes"]:
        print("\nArquivos que precisam de atenção estão marcados com '!'. "
              "CSV sem colunas reconhecidas: abra a interface (python app.py) > Importar > Mapear.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
