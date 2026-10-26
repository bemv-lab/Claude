"""Cria o ícone do Prosperidade na área de trabalho e liga os dois computadores à mesma pasta (rodar uma vez).

Para os dois usarem os mesmos dados, a pasta compartilhada fica no Google Drive (ex.: "Meu Drive/Prosperidade").
O primeiro computador leva para lá o banco que já existe; o segundo encontra o banco lá e passa a usá-lo.
Só um edita por vez; o outro fica em "Só consulta" até o primeiro fechar ou ficar 15 minutos parado.

Windows: dois cliques neste arquivo (ou `py instalar_atalho.py`). Cria o atalho na área de trabalho e no menu Iniciar.
Mac: no Terminal, `python3 instalar_atalho.py`. Cria o Prosperidade.app na mesa (dá para arrastar para o Dock).
Linux: `python3 instalar_atalho.py`.

O ícone abre o sistema; se ele já estiver aberto, só abre o navegador. Se mudarem a pasta `financas` de lugar,
rodem de novo.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import plistlib
import shutil
import sqlite3
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


def pastas_do_drive() -> list[Path]:
    """Onde o Google Drive para computador costuma montar o "Meu Drive"."""
    achadas = []
    if sys.platform == "win32":
        for letra in "GHIJKLMNOPQRSTUVWXYZDEF":
            achadas += [Path(f"{letra}:/{n}") for n in ("Meu Drive", "My Drive")]
    else:
        base = str(Path.home() / "Library" / "CloudStorage" / "GoogleDrive-*")
        achadas += [Path(p) for p in glob.glob(base + "/Meu Drive") + glob.glob(base + "/My Drive")]
    return [p for p in achadas if p.is_dir()]


def levar_dados(destino: Path) -> str:
    """Primeiro computador: copia o banco e os extratos daqui para a pasta compartilhada (nunca sobrescreve)."""
    destino.mkdir(parents=True, exist_ok=True)
    banco = destino / "financas.db"
    if banco.exists():
        return "Encontrei os dados de vocês na pasta compartilhada. Este computador vai usar esses dados."
    local = PASTA / "dados" / "financas.db"
    if not local.exists():
        return "A pasta compartilhada está vazia e não há dados neste computador: o sistema começa do zero."
    orig, dest = sqlite3.connect(str(local)), sqlite3.connect(str(banco))
    try:
        orig.backup(dest)
    finally:
        orig.close()
        dest.close()
    if (PASTA / "entrada").is_dir():
        shutil.copytree(PASTA / "entrada", destino / "entrada", dirs_exist_ok=True)
    return "Levei o banco e os extratos deste computador para a pasta compartilhada."


def configurar_pasta(pasta: str | None, nome: str | None, so_local: bool) -> None:
    arq = PASTA / "local.json"
    atual = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {}
    if so_local:
        arq.unlink(missing_ok=True)
        print("\n  Os dados ficam só neste computador.")
        return
    if pasta is None:
        sugestao = atual.get("pasta") or next((str(p / "Prosperidade") for p in pastas_do_drive()), "")
        print("\n  Para os dois computadores usarem os mesmos dados, os dados ficam numa pasta do Google Drive.")
        print("  (Enter aceita a sugestão; um traço - deixa os dados só neste computador.)")
        resp = input(f"  Pasta compartilhada [{sugestao or 'nenhuma encontrada'}]: ").strip().strip('"')
        if resp == "-" or (not resp and not sugestao):
            return configurar_pasta(None, None, True)
        pasta = resp or sugestao
    if nome is None:
        padrao = atual.get("nome") or ""
        nome = input(f"  Nome de quem usa este computador (ex.: Bárbara) [{padrao}]: ").strip() or padrao or "Este computador"
    destino = Path(pasta).expanduser()
    print("\n  " + levar_dados(destino))
    arq.write_text(json.dumps({"pasta": str(destino), "nome": nome}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  Pasta compartilhada: {destino}  ·  este computador: {nome}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Cria o ícone e liga este computador à pasta compartilhada")
    ap.add_argument("--pasta", help="pasta compartilhada (ex.: \"G:/Meu Drive/Prosperidade\")")
    ap.add_argument("--nome", help="nome de quem usa este computador (ex.: Bárbara)")
    ap.add_argument("--so-local", action="store_true", help="dados só neste computador, sem pasta compartilhada")
    ap.add_argument("--so-icone", action="store_true", help="só recria o ícone, sem mexer na pasta")
    a = ap.parse_args()
    (PASTA / "dados").mkdir(exist_ok=True)
    try:
        if not a.so_icone:
            configurar_pasta(a.pasta, a.nome, a.so_local)
        feitos = windows() if sys.platform == "win32" else mac() if sys.platform == "darwin" else linux()
        print("\n  Ícone criado:")
        for f in feitos:
            print("   ", f)
        print("\n  Dois cliques nele abrem o sistema no navegador.")
    except Exception as e:  # noqa: BLE001 - mostrar o erro para quem clicou duas vezes
        print(f"\n  Algo deu errado: {e}")
    if sys.platform == "win32":
        input("\n  Aperte Enter para fechar.")


if __name__ == "__main__":
    main()
