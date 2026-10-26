#!/bin/bash
# Instalador do Prosperidade no Mac: Python, leitor de PDF do Itaú, pasta compartilhada e ícone.
cd "$(dirname "$0")"
echo
echo "  Instalando o Prosperidade neste Mac..."
echo
if ! python3 --version >/dev/null 2>&1; then
  echo "  O Mac vai pedir para instalar as Ferramentas de Linha de Comando (gratuito, da Apple)."
  echo "  Cliquem em Instalar e, quando terminar, abram este arquivo de novo."
  xcode-select --install >/dev/null 2>&1
  read -r -p "  Aperte Enter para fechar."
  exit 1
fi
echo "  Python encontrado. Instalando o leitor de PDF do Itaú..."
python3 -m pip install --user --quiet --disable-pip-version-check pdfplumber || echo "  (Sem o leitor de PDF por enquanto. O resto funciona.)"
python3 instalar_atalho.py
echo
read -r -p "  Aperte Enter para fechar."
