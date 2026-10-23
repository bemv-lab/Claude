"""Utilidades: dinheiro em centavos, datas, normalização de texto, parcelas."""
from __future__ import annotations

import calendar
import re
import unicodedata
from datetime import date, datetime, timedelta

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]


# ---------------------------------------------------------------- texto

def sem_acento(texto: str) -> str:
    nfkd = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalizar(texto: str) -> str:
    """Maiúsculas, sem acento, só letras/números/espaço, espaços colapsados."""
    t = sem_acento(texto).upper()
    t = re.sub(r"[^A-Z0-9/ ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# Prefixos de banco que não dizem nada sobre o estabelecimento.
_PREFIXOS = [
    "COMPRA COM CARTAO", "COM CARTAO", "COMPRA NO DEBITO", "COMPRA NO CREDITO", "COMPRA CARTAO", "COMPRA DEBITO", "COMPRA CREDITO",
    "COMPRA", "PAGAMENTO EFETUADO", "PAGAMENTO DE", "PAGAMENTO", "PAGTO", "PGTO", "DEB AUT", "DEBITO AUTOMATICO",
    "PIX ENVIADO", "PIX RECEBIDO", "PIX TRANSF", "PIX QRS", "PIX QR", "PIX", "TRANSFERENCIA ENVIADA",
    "TRANSFERENCIA RECEBIDA", "TRANSFERENCIA", "TED", "DOC", "TEF", "ENVIADO", "RECEBIDO",
    "CP ", "ELO ", "VISA ", "MASTERCARD ", "MC ", "EC ", "CARTAO",
]
_PALAVRAS_VAZIAS = {"DE", "DA", "DO", "DAS", "DOS", "E", "EM", "PARA", "LTDA", "SA", "S", "A", "ME",
                    "EIRELI", "BR", "BRA", "BRASIL", "SAO", "PAULO", "SP", "RJ", "MG", "COM", "WWW"}


def chave_estabelecimento(descricao: str) -> str:
    """Chave curta e estável do estabelecimento/pessoa, usada pelas regras aprendidas.

    "PIX ENVIADO - Maria Souza 12/09" -> "MARIA SOUZA"
    "IFOOD *RESTAURANTE X PARC 02/03" -> "IFOOD RESTAURANTE X"
    """
    t = normalizar(descricao)
    t = RE_PARCELA_FORTE.sub(" ", t)
    t = re.sub(r"\b\d+/\d+(/\d+)?\b", " ", t)
    mudou = True
    while mudou:
        mudou = False
        for p in _PREFIXOS:
            if t.startswith(p.strip() + " ") or t == p.strip():
                t = t[len(p.strip()):].strip()
                mudou = True
    tokens = [w for w in t.replace("/", " ").split()
              if not any(ch.isdigit() for ch in w) and len(w) >= 2 and w not in _PALAVRAS_VAZIAS]
    return " ".join(tokens[:3])


# ---------------------------------------------------------------- dinheiro

def parse_valor(texto) -> int | None:
    """Converte '-1.234,56', 'R$ 1.234,56', '1234.56', '(12,30)', '12,30 D' em centavos."""
    if texto is None:
        return None
    if isinstance(texto, (int, float)):
        return int(round(float(texto) * 100))
    s = str(texto).strip()
    if not s:
        return None
    negativo = False
    if s.startswith("(") and s.endswith(")"):
        negativo, s = True, s[1:-1]
    su = s.upper()
    if su.endswith(" D") or su.endswith("-D"):
        negativo, s = True, s[:-2]
    elif su.endswith(" C") or su.endswith("-C"):
        s = s[:-2]
    s = s.replace("R$", "").replace(" ", "").replace(" ", "")
    if s.startswith("-"):
        negativo, s = True, s[1:]
    elif s.startswith("+"):
        s = s[1:]
    if s.endswith("-"):
        negativo, s = True, s[:-1]
    if not re.fullmatch(r"[\d.,]+", s):
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):          # 1.234,56
            s = s.replace(".", "").replace(",", ".")
        else:                                    # 1,234.56
            s = s.replace(",", "")
    elif s.count(",") == 1:                      # 12,30 (vírgula decimal)
        s = s.replace(",", ".")
    elif "," in s:                               # 1,234,567
        s = s.replace(",", "")
    elif s.count(".") > 1:                       # 1.234.567
        s = s.replace(".", "")
    try:
        centavos = int(round(float(s) * 100))
    except ValueError:
        return None
    return -centavos if negativo else centavos


def brl(centavos: int | None, sinal: bool = False) -> str:
    if centavos is None:
        return "—"
    neg = centavos < 0
    inteiro, cent = divmod(abs(int(centavos)), 100)
    s = f"{inteiro:,}".replace(",", ".") + f",{cent:02d}"
    pre = "-" if neg else ("+" if sinal and centavos > 0 else "")
    return f"{pre}R$ {s}"


# ---------------------------------------------------------------- datas

def parse_data(texto: str) -> str | None:
    """Devolve 'AAAA-MM-DD' a partir de dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd ou OFX AAAAMMDD..."""
    if not texto:
        return None
    s = str(texto).strip()
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", s)              # OFX
    if m and "-" not in s[:8] and "/" not in s[:8]:
        y, mo, d = map(int, m.groups())
    else:
        m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
        if m:
            y, mo, d = map(int, m.groups())
        else:
            m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", s)
            if not m:
                return None
            d, mo, y = map(int, m.groups())
            if y < 100:
                y += 2000
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def data_br(iso: str | None) -> str:
    if not iso:
        return "—"
    y, m, d = iso[:10].split("-")
    return f"{d}/{m}/{y}"


def hoje() -> date:
    return date.today()


def mes_atual() -> str:
    return hoje().strftime("%Y-%m")


def limites_mes(mes: str) -> tuple[str, str]:
    y, m = map(int, mes.split("-"))
    ultimo = calendar.monthrange(y, m)[1]
    return f"{mes}-01", f"{mes}-{ultimo:02d}"


def somar_meses(mes: str, n: int) -> str:
    y, m = map(int, mes.split("-"))
    total = y * 12 + (m - 1) + n
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def nome_mes(mes: str) -> str:
    y, m = mes.split("-")
    return f"{MESES[int(m) - 1]} de {y}"


def dias_restantes_mes(ref: date | None = None) -> int:
    ref = ref or hoje()
    ultimo = calendar.monthrange(ref.year, ref.month)[1]
    return ultimo - ref.day + 1


def agora_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def dias_entre(a: str, b: str) -> int:
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)


def proxima_data_dia(dia: int, ref: date | None = None) -> date:
    """Próxima ocorrência do dia `dia` (a partir de hoje, inclusive)."""
    ref = ref or hoje()
    for k in range(0, 3):
        y, m = ref.year + (ref.month - 1 + k) // 12, (ref.month - 1 + k) % 12 + 1
        d = min(dia, calendar.monthrange(y, m)[1])
        alvo = date(y, m, d)
        if alvo >= ref:
            return alvo
    return ref + timedelta(days=30)


# ---------------------------------------------------------------- parcelas

RE_PARCELA_FORTE = re.compile(
    r"\b(?:PARC(?:ELA)?|PCL|PRC)\.?\s*(\d{1,2})\s*(?:/|DE)\s*(\d{1,2})\b")
RE_PARCELA_FRACA = re.compile(r"(?<![\d/])(\d{1,2})/(\d{1,2})(?![\d/])")


def detectar_parcela(descricao: str, cartao: bool, extra: str = "") -> tuple[int, int] | None:
    """Encontra 'PARC 03/10', 'Parcela 3 de 10' ou, em cartão, um '03/10' solto.

    Datas como '15/10' são descartadas porque a parcela atual não pode passar do total.
    """
    for texto in (extra, descricao):
        t = normalizar(texto)
        if not t:
            continue
        m = RE_PARCELA_FORTE.search(t)
        if m:
            a, tot = int(m.group(1)), int(m.group(2))
            if 1 <= a <= tot and 2 <= tot <= 72:
                return a, tot
    if cartao:
        t = normalizar(descricao)
        for m in RE_PARCELA_FRACA.finditer(t):
            a, tot = int(m.group(1)), int(m.group(2))
            if 1 <= a <= tot and 2 <= tot <= 48:
                return a, tot
    return None
