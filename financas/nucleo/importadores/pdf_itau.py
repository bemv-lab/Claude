"""Leitor do extrato em PDF do Itaú (o app só entrega a conta corrente em PDF).

Precisa de `pdfplumber` (pip install pdfplumber), só para PDF. O resto do sistema não depende dele.
O PDF tem texto de verdade (não é imagem), então não há OCR: cada lançamento é uma linha
"dd/mm/aaaa DESCRIÇÃO valor", com débito negativo. As linhas "SALDO DO DIA" são ignoradas.
"""
from __future__ import annotations

import io
import re

from ..util import parse_data, parse_valor

RE_LINHA = re.compile(r"^(\d{2}/\d{2}/\d{4})\s+(.+?)\s+(-?[\d.]+,\d{2})$")
RE_CONTA = re.compile(r"ag[eê]ncia:\s*(\d+)\s+conta:\s*([\d-]+)", re.I)
RE_PERIODO = re.compile(r"per[ií]odo de visualiza[cç][aã]o:\s*(\d{2}/\d{2}/\d{4})\s+at[eé]\s+(\d{2}/\d{2}/\d{4})", re.I)
RE_DATA_COLADA = re.compile(r"(?<=[A-Za-z])\d{2}/\d{2}$")     # "PIX TRANSF BARBARA16/10": o app cola a data


class PdfIndisponivel(RuntimeError):
    pass


def eh_pdf(conteudo: bytes) -> bool:
    return conteudo[:5] == b"%PDF-"


def texto_do_pdf(conteudo: bytes) -> str:
    try:
        import pdfplumber
    except ImportError as e:
        raise PdfIndisponivel("Para ler PDF, instale uma vez: pip install pdfplumber") from e
    with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
        return "\n".join((pg.extract_text() or "") for pg in pdf.pages)


def ler_texto(texto: str) -> dict:
    if "extrato conta" not in texto.lower() or not RE_CONTA.search(texto):
        return {}
    ag, conta = RE_CONTA.search(texto).groups()
    transacoes = []
    for linha in texto.splitlines():
        m = RE_LINHA.match(linha.strip())
        if not m:
            continue
        data, desc, valor = m.groups()
        if desc.upper().startswith("SALDO"):
            continue
        v = parse_valor(valor)
        d = parse_data(data)
        if d and v:
            transacoes.append({"data": d, "valor": v, "descricao": RE_DATA_COLADA.sub("", desc).strip()})
    per = RE_PERIODO.search(texto)
    return {"formato": "pdf", "banco": "Itaú", "identificador": conta, "agencia": ag, "transacoes": transacoes,
            "periodo": (parse_data(per.group(1)), parse_data(per.group(2))) if per else None}


def ler(conteudo: bytes) -> dict:
    return ler_texto(texto_do_pdf(conteudo))
