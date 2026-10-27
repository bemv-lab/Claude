@echo off
rem Abre o Cérebro no Windows: dê dois cliques neste arquivo.
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta o Node 22.13 ou mais novo. Instale em https://nodejs.org e abra este arquivo de novo. & pause & exit /b 1)
if not exist data mkdir data
if not exist data\cerebro.db echo Aviso: nao achei data\cerebro.db. Vai abrir vazio. Para a demonstracao, copie o cerebro-demo.db para data\cerebro.db.
if not exist node_modules call npm ci --no-audit --no-fund
if not exist .next call npm run build
if not exist data\.segredo powershell -NoProfile -Command "[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}) -as [byte[]]) | Set-Content -NoNewline data\.segredo"
set /p CEREBRO_SEGREDO=<data\.segredo
set NODE_NO_WARNINGS=1
echo Cerebro abrindo em http://localhost:3000 (feche esta janela para parar)
start "" http://localhost:3000
call npm start
