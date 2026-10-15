"""Converte o resultado do conector do Google Drive (download_file_content) em arquivo.

O conector devolve o arquivo em base64; quando é grande, a sessão salva a resposta em um .txt (JSON).
Uso: python3 -I scripts/drive_para_arquivo.py <resposta.txt> <saida.mp4>
"""
import base64
import json
import sys

dados = json.load(open(sys.argv[1]))
conteudo = base64.b64decode(dados["content"])
open(sys.argv[2], "wb").write(conteudo)
print(f"ok {sys.argv[2]}: {len(conteudo)/1e6:.1f} MB ({dados.get('title', '')}, {dados.get('mimeType', '')})")
