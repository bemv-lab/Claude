"""Cria o ícone do Prosperidade na área de trabalho (rodar uma vez).

Windows: dois cliques neste arquivo (ou `py instalar_atalho.py`). Cria o atalho na área de trabalho e no menu Iniciar.
Mac: no Terminal, `python3 instalar_atalho.py`. Cria o Prosperidade.app na mesa (dá para arrastar para o Dock).
Linux: `python3 instalar_atalho.py`.

O ícone abre o sistema; se ele já estiver aberto, só abre o navegador. Se mudarem a pasta `financas` de lugar,
rodem de novo.
"""
from __future__ import annotations

import os
import plistlib
import shlex
import subprocess
import sys
from pathlib import Path

PASTA = Path(__file__).resolve().parent
APP = PASTA / "app.py"
ICONES = PASTA / "atalho"
NOME = "Prosperidade"


def windows() -> list[str]:
    script = r"""
$sh = New-Object -ComObject WScript.Shell
foreach ($pasta in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = $sh.CreateShortcut((Join-Path $pasta ($env:P_NOME + '.lnk')))
  $lnk.TargetPath = $env:P_PYTHON
  $lnk.Arguments = '"' + $env:P_APP + '"'
  $lnk.WorkingDirectory = $env:P_PASTA
  $lnk.IconLocation = $env:P_ICONE
  $lnk.WindowStyle = 7
  $lnk.Description = 'Finanças do casal'
  $lnk.Save()
  Write-Output $lnk.FullName
}
"""
    env = dict(os.environ, P_NOME=NOME, P_PYTHON=sys.executable, P_APP=str(APP), P_PASTA=str(PASTA),
               P_ICONE=str(ICONES / "icone.ico"))
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
                       env=env, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip() or "o PowerShell não conseguiu criar o atalho")
    return [x for x in r.stdout.splitlines() if x.strip()]


def mac() -> list[str]:
    app = Path.home() / "Desktop" / f"{NOME}.app"
    exe = app / "Contents" / "MacOS" / NOME
    exe.parent.mkdir(parents=True, exist_ok=True)
    (app / "Contents" / "Resources").mkdir(exist_ok=True)
    (app / "Contents" / "Resources" / "icone.icns").write_bytes((ICONES / "icone.icns").read_bytes())
    with open(app / "Contents" / "Info.plist", "wb") as f:
        plistlib.dump({"CFBundleName": NOME, "CFBundleDisplayName": NOME, "CFBundleExecutable": NOME,
                       "CFBundleIdentifier": "local.prosperidade", "CFBundleIconFile": "icone.icns",
                       "CFBundlePackageType": "APPL", "LSUIElement": True}, f)
    # o servidor fica rodando em segundo plano; o app.py só abre o navegador se ele já estiver aberto
    exe.write_text(f"""#!/bin/bash
cd {shlex.quote(str(PASTA))}
nohup {shlex.quote(sys.executable)} app.py >> dados/app.log 2>&1 &
""")
    exe.chmod(0o755)
    subprocess.run(["touch", str(app)])          # o Finder relê o ícone
    return [str(app)]


def linux() -> list[str]:
    destino = Path.home() / "Desktop"
    destino = destino if destino.is_dir() else Path.home() / ".local" / "share" / "applications"
    destino.mkdir(parents=True, exist_ok=True)
    arq = destino / f"{NOME.lower()}.desktop"
    arq.write_text(f"""[Desktop Entry]
Type=Application
Name={NOME}
Comment=Finanças do casal
Exec={shlex.quote(sys.executable)} {shlex.quote(str(APP))}
Path={PASTA}
Icon={ICONES / 'icone.png'}
Terminal=false
""")
    arq.chmod(0o755)
    return [str(arq)]


def main() -> None:
    (PASTA / "dados").mkdir(exist_ok=True)
    try:
        feitos = windows() if sys.platform == "win32" else mac() if sys.platform == "darwin" else linux()
        print("\n  Ícone criado:")
        for f in feitos:
            print("   ", f)
        print("\n  Dois cliques nele abrem o sistema no navegador.")
    except Exception as e:  # noqa: BLE001 - mostrar o erro para quem clicou duas vezes
        print(f"\n  Não consegui criar o ícone: {e}")
    if sys.platform == "win32":
        input("\n  Aperte Enter para fechar.")


if __name__ == "__main__":
    main()
