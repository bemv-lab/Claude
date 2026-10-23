"""Leitor de OFX (1.x SGML e 2.x XML) sem dependências."""
from __future__ import annotations

import re

from ..util import parse_data, parse_valor


def decodificar(conteudo: bytes) -> str:
    cabecalho = conteudo[:600].decode("ascii", "ignore").upper()
    if "CHARSET:1252" in cabecalho or "ISO-8859" in cabecalho or "USASCII" in cabecalho:
        ordem = ("cp1252", "utf-8")
    else:
        ordem = ("utf-8", "cp1252")
    for enc in ordem:
        try:
            return conteudo.decode(enc)
        except UnicodeDecodeError:
            continue
    return conteudo.decode("latin-1")


def eh_ofx(conteudo: bytes) -> bool:
    inicio = conteudo[:2000].decode("latin-1", "ignore").upper()
    return "OFXHEADER" in inicio or "<OFX>" in inicio


def _tag(bloco: str, nome: str) -> str | None:
    m = re.search(rf"<{nome}>\s*([^<\r\n]*)", bloco, re.I)
    return m.group(1).strip() if m and m.group(1).strip() else None


def ler(conteudo: bytes) -> dict:
    texto = decodificar(conteudo)
    cartao = bool(re.search(r"<CREDITCARDMSGSRSV1>|<CCSTMTRS>", texto, re.I))
    conta = _tag(texto, "ACCTID")
    banco = _tag(texto, "BANKID") or _tag(texto, "ORG")
    transacoes = []
    for bloco in re.findall(r"<STMTTRN>(.*?)(?=</STMTTRN>|<STMTTRN>|</BANKTRANLIST>)", texto, re.I | re.S):
        data = parse_data(_tag(bloco, "DTPOSTED") or _tag(bloco, "DTUSER") or "")
        valor = parse_valor(_tag(bloco, "TRNAMT"))
        if not data or valor is None:
            continue
        nome, memo = _tag(bloco, "NAME"), _tag(bloco, "MEMO")
        partes = [p for p in (nome, memo) if p]
        if len(partes) == 2 and (partes[0] in partes[1] or partes[1] in partes[0]):
            partes = [max(partes, key=len)]
        transacoes.append({
            "data": data, "valor": valor, "descricao": " - ".join(partes) or (_tag(bloco, "TRNTYPE") or "?"),
            "fitid": _tag(bloco, "FITID"), "extra": _tag(bloco, "TRNTYPE") or "",
        })
    return {"formato": "ofx", "cartao": cartao, "identificador": conta, "banco": banco,
            "transacoes": transacoes, "sinal_cartao_ja_negativo": True}
