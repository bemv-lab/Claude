"""Leitor de .xlsx só com a biblioteca padrão (zipfile + xml): sem instalar nada.

Devolve cada aba como lista de linhas; células viram str, float ou datetime. Fórmulas valem pelo último
valor calculado que o Excel/Google guardou no arquivo.
"""
from __future__ import annotations

import io
import re
import zipfile
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
_M = "{%s}" % NS["m"]
_R = "{%s}" % NS["r"]
_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
EPOCA = datetime(1899, 12, 30)
FORMATOS_DATA = set(range(14, 23)) | {27, 30, 36, 45, 46, 47, 50, 57}
_RE_DATA_CUSTOM = re.compile(r"[dmyhs]", re.I)


def eh_xlsx(conteudo: bytes) -> bool:
    return conteudo[:2] == b"PK" and b"xl/" in conteudo[:4000] + conteudo[-4000:]


def _texto(si) -> str:
    return "".join(t.text or "" for t in si.iter(_M + "t"))


def _estilos_de_data(z: zipfile.ZipFile) -> set[int]:
    """Índices de estilo (cellXfs) que formatam a célula como data."""
    if "xl/styles.xml" not in z.namelist():
        return set()
    raiz = ET.fromstring(z.read("xl/styles.xml"))
    personalizados = {}
    for nf in raiz.iter(_M + "numFmt"):
        fmt = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.', "", nf.get("formatCode", ""))
        personalizados[int(nf.get("numFmtId"))] = bool(_RE_DATA_CUSTOM.search(fmt))
    datas = set()
    xfs = raiz.find(_M + "cellXfs")
    for i, xf in enumerate(xfs if xfs is not None else []):
        fid = int(xf.get("numFmtId", 0))
        if fid in FORMATOS_DATA or personalizados.get(fid):
            datas.add(i)
    return datas


def _coluna(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def nomes_das_abas(conteudo: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        return [s.get("name") for s in wb.iter(_M + "sheet")]


def ler(conteudo: bytes, abas: list[str] | None = None) -> dict[str, list[list]]:
    """{nome_da_aba: [[célula, ...], ...]}; `abas` limita o que é lido (arquivos grandes)."""
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        comp = z.namelist()
        compartilhadas = []
        if "xl/sharedStrings.xml" in comp:
            compartilhadas = [_texto(si) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(_M + "si")]
        datas = _estilos_de_data(z)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).iter(_REL + "Relationship")}
        saida: dict[str, list[list]] = {}
        for aba in wb.iter(_M + "sheet"):
            nome = aba.get("name")
            if abas is not None and nome not in abas:
                continue
            alvo = rels[aba.get(_R + "id")]
            caminho = alvo.lstrip("/") if alvo.startswith("/") else "xl/" + alvo
            linhas: list[list] = []
            for linha in ET.fromstring(z.read(caminho)).iter(_M + "row"):
                idx = int(linha.get("r")) - 1
                while len(linhas) <= idx:
                    linhas.append([])
                celulas = linhas[idx]
                for c in linha.iter(_M + "c"):
                    col = _coluna(c.get("r"))
                    t, v = c.get("t"), c.find(_M + "v")
                    if t == "inlineStr":
                        valor = _texto(c.find(_M + "is"))
                    elif v is None or v.text is None:
                        continue
                    elif t == "s":
                        valor = compartilhadas[int(v.text)]
                    elif t in ("str", "e"):
                        valor = v.text
                    elif t == "b":
                        valor = bool(int(v.text))
                    else:
                        valor = float(v.text)
                        if int(c.get("s", 0)) in datas:
                            valor = EPOCA + timedelta(days=valor)
                    while len(celulas) <= col:
                        celulas.append(None)
                    celulas[col] = valor
            saida[nome] = linhas
        return saida


def linhas_texto(linhas: list[list]) -> list[list[str]]:
    """Converte para o mesmo formato do leitor de CSV (tudo texto, datas em dd/mm/aaaa)."""
    def txt(v):
        if v is None:
            return ""
        if isinstance(v, datetime):
            return v.strftime("%d/%m/%Y")
        if isinstance(v, float):
            return str(int(v)) if v.is_integer() else repr(v)
        return str(v).strip()
    return [[txt(c) for c in l] for l in linhas]
