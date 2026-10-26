"""Uso em dois computadores: o banco fica numa pasta sincronizada (Google Drive) e só um edita por vez.

O computador que está editando grava `em-uso.json` na pasta, com o nome dele, uma batida a cada minuto e a versão
do banco (um contador que sobe a cada edição). O outro computador fica em modo consulta enquanto:
  - a batida do primeiro for recente (ele está aberto e sendo usado), ou
  - o banco que chegou pelo Drive for mais antigo que a versão anunciada (a sincronização ainda não terminou).
Em consulta, as telas leem uma cópia local do banco e nada é gravado na pasta compartilhada.
Sem uso por 15 minutos, o computador que edita libera a vez sozinho.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path

ATIVO = timedelta(minutes=3)          # batida mais velha que isso: o outro saiu sem avisar
OCIOSO = timedelta(minutes=15)        # sem uso por esse tempo, libera a edição
RECHECAR = timedelta(seconds=20)


def versao_do_banco(caminho: Path) -> int:
    """Contador de edições gravado no próprio banco (leitura sem tocar no arquivo)."""
    if not caminho.exists():
        return 0
    try:
        con = sqlite3.connect(f"{caminho.resolve().as_uri()}?mode=ro", uri=True)
        try:
            r = con.execute("SELECT valor FROM config WHERE chave = 'versao_edicao'").fetchone()
        finally:
            con.close()
        return int(r[0]) if r and r[0] else 0
    except (sqlite3.Error, ValueError):
        return 0


def subir_versao(con) -> int:
    v = int((con.execute("SELECT valor FROM config WHERE chave = 'versao_edicao'").fetchone() or ["0"])[0] or 0) + 1
    con.execute("INSERT INTO config (chave, valor) VALUES ('versao_edicao', ?) "
                "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (str(v),))
    con.commit()
    return v


class Uso:
    def __init__(self, pasta: Path | None, nome: str, banco: Path, copia_local: Path):
        self.ativo = pasta is not None
        self.trava = pasta / "em-uso.json" if pasta else None
        self.nome, self.banco, self.copia_local = nome, banco, copia_local
        self.modo, self.motivo, self.dono = "edicao", "", False
        self.ultimo_uso = datetime.now()
        self._checado = None
        self._copia_de = None
        self._lock = threading.RLock()

    # ------------------------------------------------------------ trava
    def _ler(self) -> dict:
        try:
            return json.loads(self.trava.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _gravar(self, aberto: bool, versao: int | None = None) -> None:
        agora = datetime.now().isoformat(timespec="seconds")
        dados = {"maquina": self.nome, "aberto": aberto, "batida": agora,
                 "versao": versao_do_banco(self.banco) if versao is None else versao}
        tmp = self.trava.with_suffix(".tmp")
        tmp.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.trava)

    def avaliar(self, forcar: bool = False) -> str:
        """Decide se este computador edita ou só consulta (e pega a vez quando está livre)."""
        if not self.ativo:
            return "edicao"
        with self._lock:
            agora = datetime.now()
            if not forcar and self._checado and agora - self._checado < RECHECAR:
                return self.modo
            self._checado = agora
            t = self._ler()
            outro = t.get("maquina") and t["maquina"] != self.nome
            try:
                batida = datetime.fromisoformat(t.get("batida", ""))
            except ValueError:
                batida = datetime.min
            if outro and t.get("aberto") and agora - batida < ATIVO:
                self.modo, self.dono = "consulta", False
                self.motivo = (f"{t['maquina']} está usando o sistema agora. Aqui fica só para consulta; "
                               f"quando lá fechar (ou ficar 15 minutos sem uso), este computador volta a editar.")
            elif outro and versao_do_banco(self.banco) < int(t.get("versao") or 0):
                self.modo, self.dono = "consulta", False
                self.motivo = (f"O Google Drive ainda está trazendo as últimas mudanças feitas por {t['maquina']}. "
                               "Aguardem um minuto e atualizem a página.")
            else:
                self.modo, self.motivo = "edicao", ""
                if not self.dono or not t.get("aberto"):
                    self._gravar(True)
                    self.dono = True
            return self.modo

    def usou(self) -> None:
        self.ultimo_uso = datetime.now()

    def editou(self, versao: int) -> None:
        if self.ativo and self.dono:
            with self._lock:
                self._gravar(True, versao)

    def batida(self) -> None:
        """A cada minuto: mantém a vez enquanto há uso; libera depois de 15 minutos parado."""
        if not (self.ativo and self.dono):
            return
        with self._lock:
            if datetime.now() - self.ultimo_uso > OCIOSO:
                self.liberar()
            else:
                self._gravar(True)

    def liberar(self) -> None:
        if self.ativo and self.dono:
            with self._lock:
                self._gravar(False)
                self.dono = False
                self._checado = None

    # ------------------------------------------------------------ banco usado pelas telas
    def banco_para_ler(self) -> Path:
        if self.modo != "consulta":
            return self.banco
        marca = (self.banco.stat().st_mtime, self.banco.stat().st_size) if self.banco.exists() else None
        if marca and marca != self._copia_de:
            self.copia_local.parent.mkdir(parents=True, exist_ok=True)
            orig = sqlite3.connect(f"{self.banco.resolve().as_uri()}?mode=ro", uri=True)
            dest = sqlite3.connect(str(self.copia_local))
            try:
                orig.backup(dest)
            finally:
                orig.close()
                dest.close()
            self._copia_de = marca
        return self.copia_local if self.copia_local.exists() else self.banco

    def estado(self) -> dict:
        return {"compartilhado": self.ativo, "consulta": self.modo == "consulta", "motivo": self.motivo,
                "computador": self.nome}
