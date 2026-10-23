"""Leitor de CSV dos bancos com detecção automática de colunas.

Reconhece pelo cabeçalho (mesmo com linhas de apresentação antes dele, como no extrato do Inter):
Inter conta e fatura, Banco do Brasil, Itaú, Nubank (fatura e conta), Flash e CSVs genéricos.
Quando não reconhece (ex.: a planilha antiga do casal), devolve as colunas para mapeamento manual.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re

from ..util import normalizar, parse_data, parse_valor, RE_PARCELA_FORTE

SINONIMOS = {
    "data": ["DATA", "DATA LANCAMENTO", "DATA DO LANCAMENTO", "DATA DA COMPRA", "DATA COMPRA", "DATE", "DT",
             "DATA MOVIMENTO", "DATA DA TRANSACAO", "DATA TRANSACAO", "QUANDO", "DIA"],
    "descricao": ["DESCRICAO", "HISTORICO", "LANCAMENTO", "TITLE", "ESTABELECIMENTO", "DETALHES", "MEMO",
                  "DESCRIPTION", "DESCRICAO DO LANCAMENTO", "NOME", "COMPLEMENTO", "TRANSACAO", "O QUE", "ITEM"],
    "valor": ["VALOR", "AMOUNT", "VALOR R", "VALOR RS", "VALOR EM R", "VALUE", "VALOR R$", "QUANTIA", "QUANTO", "PRECO", "TOTAL"],
    "debito": ["DEBITO", "SAIDA", "SAIDAS", "VALOR DEBITO"],
    "credito": ["CREDITO", "ENTRADA", "ENTRADAS", "VALOR CREDITO"],
    "portador": ["PORTADOR", "TITULAR", "NOME NO CARTAO", "CARTAO", "FINAL DO CARTAO", "CARTAO FINAL",
                 "USUARIO"],
    "parcela": ["PARCELA", "PARCELAS", "TIPO"],
    "categoria": ["CATEGORIA", "CATEGORY"],
    "tipo_lancamento": ["TIPO LANCAMENTO", "TIPO DE LANCAMENTO", "NATUREZA", "D/C", "DC", "CREDITO/DEBITO"],
    "identificador": ["IDENTIFICADOR", "ID", "N DOCUMENTO", "NO DOCUMENTO", "DOCUMENTO"],
}
IGNORAR_LINHA = re.compile(r"^(SALDO( ANTERIOR| DO DIA| FINAL| ATUAL| BLOQUEADO)?|S A L D O|TOTAL|SALDO EM)\b")


def decodificar(conteudo: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return conteudo.decode(enc)
        except UnicodeDecodeError:
            continue
    return conteudo.decode("latin-1")


def _delimitador(texto: str) -> str:
    amostra = texto[:5000]
    contagem = {d: amostra.count(d) for d in (";", ",", "\t", "|")}
    return max(contagem, key=contagem.get)


def linhas_csv(conteudo: bytes) -> list[list[str]]:
    texto = decodificar(conteudo)
    d = _delimitador(texto)
    return [[c.strip() for c in linha] for linha in csv.reader(io.StringIO(texto), delimiter=d)]


def _papel(cabecalho: str) -> str | None:
    h = normalizar(cabecalho).replace("/", " ").strip()
    if not h:
        return None
    for papel in ("tipo_lancamento", "data", "valor", "debito", "credito", "portador", "categoria",
                  "identificador", "descricao", "parcela"):
        for s in SINONIMOS[papel]:
            s2 = normalizar(s).replace("/", " ")
            if h == s2:
                return papel
    for papel in ("data", "valor", "descricao"):
        if any(h.startswith(normalizar(s) + " ") for s in SINONIMOS[papel]):
            return papel
    return None


def assinatura(cabecalho: list[str]) -> str:
    base = "|".join(normalizar(c) for c in cabecalho if c.strip())
    return hashlib.sha1(base.encode()).hexdigest()[:16]


def achar_cabecalho(linhas: list[list[str]]) -> tuple[int, dict] | None:
    """Procura nas primeiras 25 linhas uma que tenha data + valor (ou débito/crédito) + descrição."""
    for i, linha in enumerate(linhas[:25]):
        papeis: dict[str, list[int]] = {}
        for j, cel in enumerate(linha):
            p = _papel(cel)
            if p:
                papeis.setdefault(p, []).append(j)
        tem_valor = "valor" in papeis or ("debito" in papeis and "credito" in papeis)
        if "data" in papeis and tem_valor and "descricao" in papeis:
            return i, papeis
    return None


def _valor_celula(linha, idx):
    return linha[idx] if idx is not None and idx < len(linha) else ""


def extrair(linhas: list[list[str]], inicio: int, mapa: dict) -> list[dict]:
    """mapa: {data: idx, descricao: [idx...], valor: idx|None, debito, credito, portador, parcela,
              categoria, tipo_lancamento, identificador, conta, pessoa, inverter: bool}"""
    out = []
    for linha in linhas[inicio:]:
        if not any(linha):
            continue
        data = parse_data(_valor_celula(linha, mapa.get("data")))
        if not data:
            continue
        desc = " - ".join(x for x in (_valor_celula(linha, k) for k in mapa.get("descricao", [])) if x)
        if IGNORAR_LINHA.match(normalizar(desc)):
            continue
        if mapa.get("valor") is not None:
            valor = parse_valor(_valor_celula(linha, mapa["valor"]))
        else:
            deb = parse_valor(_valor_celula(linha, mapa.get("debito"))) or 0
            cred = parse_valor(_valor_celula(linha, mapa.get("credito"))) or 0
            valor = abs(cred) - abs(deb) if (deb or cred) else None
        if valor is None or valor == 0:
            continue
        tl = normalizar(_valor_celula(linha, mapa.get("tipo_lancamento")))
        if tl in ("SAIDA", "D", "DEBITO") and valor > 0:
            valor = -valor
        elif tl in ("ENTRADA", "C", "CREDITO") and valor < 0:
            valor = -valor
        if mapa.get("inverter"):
            valor = -valor
        out.append({
            "data": data, "valor": valor, "descricao": desc or "(sem descrição)",
            "extra": _valor_celula(linha, mapa.get("parcela")),
            "portador": _valor_celula(linha, mapa.get("portador")) or None,
            "categoria_externa": _valor_celula(linha, mapa.get("categoria")) or None,
            "fitid": _valor_celula(linha, mapa.get("identificador")) or None,
            "conta_texto": _valor_celula(linha, mapa.get("conta")) or None,
            "pessoa_texto": _valor_celula(linha, mapa.get("pessoa")) or None,
        })
    return out


def mapa_automatico(cabecalho: list[str], papeis: dict) -> dict:
    um = lambda p: papeis[p][0] if p in papeis else None
    descricao = list(papeis.get("descricao", []))
    parcela = um("parcela")
    # "Tipo" do Inter fatura traz "Parcela 2/5" ou "Compra à vista": vira parcela, não descrição.
    return {"data": um("data"), "descricao": descricao, "valor": um("valor"), "debito": um("debito"),
            "credito": um("credito"), "portador": um("portador"), "parcela": parcela,
            "categoria": um("categoria"), "tipo_lancamento": um("tipo_lancamento"),
            "identificador": um("identificador")}


def ler(conteudo: bytes, mapa_salvo: dict | None = None) -> dict:
    linhas = linhas_csv(conteudo)
    if mapa_salvo:
        inicio = mapa_salvo.get("linha_cabecalho", 0) + 1
        return {"formato": "csv", "transacoes": extrair(linhas, inicio, mapa_salvo),
                "cabecalho": linhas[inicio - 1] if linhas else [], "mapa": mapa_salvo}
    achado = achar_cabecalho(linhas)
    if not achado:
        idx = next((i for i, l in enumerate(linhas[:25]) if sum(1 for c in l if c) >= 2), 0)
        cab = linhas[idx] if linhas else []
        return {"formato": "csv", "precisa_mapear": True, "linha_cabecalho": idx, "cabecalho": cab,
                "amostra": linhas[idx + 1: idx + 6], "assinatura": assinatura(cab)}
    i, papeis = achado
    mapa = mapa_automatico(linhas[i], papeis)
    mapa["linha_cabecalho"] = i
    trans = extrair(linhas, i + 1, mapa)
    # Coluna "Tipo" que não traz parcela (ex.: "Compra", "Pix") é ruído: descarta.
    if mapa["parcela"] is not None and not any(RE_PARCELA_FORTE.search(normalizar(t["extra"] or "")) or
                                               re.search(r"\d+/\d+", t["extra"] or "") for t in trans):
        for t in trans:
            t["extra"] = ""
    return {"formato": "csv", "transacoes": trans, "cabecalho": linhas[i], "mapa": mapa,
            "assinatura": assinatura(linhas[i])}


SINONIMOS_PLANILHA = {
    "conta": ["CONTA", "BANCO", "CARTAO", "MEIO DE PAGAMENTO", "FORMA DE PAGAMENTO", "ORIGEM", "INSTITUICAO"],
    "pessoa": ["PESSOA", "QUEM", "RESPONSAVEL", "QUEM GASTOU", "DONO"],
}


def sugerir_mapa(cabecalho: list[str]) -> dict:
    """Sugestão inicial para a tela de mapeamento (o casal confirma ou troca)."""
    sug: dict = {"descricao": []}
    for j, cel in enumerate(cabecalho):
        h = normalizar(cel).replace("/", " ")
        papel = None
        for p, sins in SINONIMOS_PLANILHA.items():
            if h in [normalizar(s) for s in sins]:
                papel = p
        papel = papel or _papel(cel)
        if papel == "descricao":
            sug["descricao"].append(j)
        elif papel and papel not in sug:
            sug[papel] = j
    return sug
