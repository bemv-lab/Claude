#!/bin/bash
# Abre o Cérebro no seu computador (Mac: dê dois cliques neste arquivo; Linux: ./iniciar.command).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1 || ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Falta o Node 22.13 ou mais novo. Instale em https://nodejs.org (botão LTS) e abra este arquivo de novo."; read -r -p "Enter para fechar"; exit 1
fi
mkdir -p data
if [ ! -f data/cerebro.db ]; then echo "Aviso: não achei data/cerebro.db. Vai abrir vazio. (Para a demonstração, copie o cerebro-demo.db para data/cerebro.db.)"; fi
[ -d node_modules ] || npm ci --no-audit --no-fund
[ -d .next ] || npm run build
# Uma chave de sessão só deste computador, criada na primeira vez.
[ -f data/.segredo ] || (head -c 32 /dev/urandom | base64 | tr -d '\n' > data/.segredo)
export CEREBRO_SEGREDO="$(cat data/.segredo)" NODE_NO_WARNINGS=1
echo "Cérebro abrindo em http://localhost:3000 (feche esta janela para parar)"
(sleep 4; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) &
npm start
