"""Texto limpo para ler na gravação (sem cabeçalho e sem marcações), uma frase por linha.

Uso: python3 -I scripts/teleprompter.py roteiros/01-primeiro-botao.txt [mais roteiros...]
"""
import os
import re
import sys

for caminho in sys.argv[1:]:
    with open(caminho, encoding="utf-8") as fh:
        linhas = fh.read().splitlines()
    corpo = linhas[linhas.index("---") + 1:] if "---" in linhas else linhas
    texto = " ".join(l.strip() for l in corpo if l.strip() and not l.strip().startswith(("[", "#")))
    n = int(re.match(r"^0*(\d+)", os.path.basename(caminho)).group(1))
    print(f"=== Roteiro {n} ===")
    print(f"(fale: \"Roteiro {n}, take 1\" e espere 2 segundos em silêncio)")
    for frase in re.split(r"(?<=[.!?])\s+", texto):
        print(frase)
    print()
