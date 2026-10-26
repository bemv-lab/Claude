@echo off
rem Instalador do Prosperidade no Windows: Python (se faltar), leitor de PDF do Itau, pasta compartilhada e icone.
cd /d "%~dp0"
title Instalar Prosperidade
echo.
echo   Instalando o Prosperidade neste computador...
echo.
set "TENTOU="
:achar
py -3 --version >nul 2>&1 && (set "PY=py" & goto achou)
if exist "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" (set "PY=%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" & goto achou)
if exist "%WINDIR%\py.exe" (set "PY=%WINDIR%\py.exe" & goto achou)
if defined TENTOU goto semPython
set "TENTOU=1"
echo   O Python ainda nao esta instalado. Instalando agora (gratuito, leva alguns minutos)...
echo.
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
goto achar

:semPython
echo.
echo   Nao consegui instalar o Python sozinho.
echo   Vou abrir o site python.org: baixem, instalem marcando "Add Python to PATH"
echo   e depois deem dois cliques neste arquivo de novo.
start "" https://www.python.org/downloads/
pause
exit /b 1

:achou
echo   Python encontrado.
echo   Instalando o leitor de PDF do Itau...
"%PY%" -3 -m pip install --user --quiet --disable-pip-version-check pdfplumber || echo   (Sem o leitor de PDF por enquanto. O resto funciona.)
"%PY%" -3 instalar_atalho.py
