"""Planilha de controle antiga ("Controle Financeiro N. Mês AA.xlsx", uma versão por mês).

Para o sistema, ela vale por três coisas:
  1. As compras dos cartões que não têm extrato próprio (Inter Cartão, BB Cartão, C6 Cartão) e o dinheiro vivo.
  2. As categorias de vocês: cada lançamento de conta (Inter, BB) que bate em data e valor com o extrato ensina
     a categoria; cada compra de cartão ensina uma regra pelo nome do estabelecimento.
  3. O orçado por categoria (aba Orçamento) e a lista de dívidas (aba Pagamentos).

Cada versão mensal é um recorte: linhas entram e saem conforme as faturas rolam. Por isso as versões são
somadas (união), contando o maior número de repetições de cada linha em um mesmo arquivo, para não perder
lançamentos legitimamente repetidos (duas mensalidades iguais no mesmo dia) nem duplicar os que aparecem
em duas versões.
"""
from __future__ import annotations

import calendar
import hashlib
import re
from collections import Counter, defaultdict
from datetime import date, datetime

from .db import CATEGORIA_PLANILHA, categoria_id, config, pessoa_id
from .importadores import xlsx
from .util import agora_iso, chave_estabelecimento, normalizar, somar_meses

MESES = {"janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
         "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

# forma de pagamento da planilha -> apelido da conta aqui. As "contas" (Inter Conta, BB Conta) não viram
# lançamentos: o extrato do banco é a fonte; a planilha só ensina as categorias.
FORMA_CARTAO = {"Inter Cartão": "inter-cartao", "BB Cartão": "bb-cartao", "C6 Cartão": "c6-cartao",
                "Dinheiro": "dinheiro"}
FORMA_CONTA = {"Inter Conta": "inter-conta", "BB Conta": "bb"}

NEGOCIO = ("ROCCO", "FACEBOOK", "SHOPIFY", "CAMPANHA")
GENERICOS = {"DINHEIRO", "AJUSTE", "PIX", "IOF", "PARCELAMENTO", "PARCELAMENTO INTER", "PARCELAMENTO FATURA",
             "SALDO", "ENTRADA DINHEIRO"}


def mes_do_arquivo(nome: str) -> str | None:
    """'Controle_Financeiro_10._Outubro_26__Itau.xlsx' -> '2026-10' (a fatura que vence naquele mês)."""
    m = re.search(r"(\d{1,2})\._?([A-Za-zÀ-ú]+)_?(\d{2})", nome)
    if not m:
        return None
    num, mes, ano = int(m.group(1)), normalizar(m.group(2)).lower(), int(m.group(3))
    return f"{2000 + ano:04d}-{MESES.get(mes, num):02d}"


def _cent(v) -> int | None:
    return None if v is None or isinstance(v, str) else int(round(float(v) * 100))


def _parcela(g, h):
    """Colunas G e H: 'Única' ou 3.0 / 10.0."""
    if isinstance(g, (int, float)) and isinstance(h, (int, float)) and h >= 1:
        return int(g), int(h)
    return None, None


def ler(conteudo: bytes, nome: str) -> dict:
    abas = xlsx.ler(conteudo, ["Lançamentos", "Orçamento", "Pagamentos"])
    linhas = []
    for r in abas.get("Lançamentos", [])[1:]:
        r = (r + [None] * 8)[:8]
        data, desc, cat, valor, forma, tipo, g, h = r
        if not isinstance(data, datetime) or valor is None or isinstance(valor, str) or not desc:
            continue
        k, n = _parcela(g, h)
        linhas.append({"data": data.date(), "descricao": str(desc).strip(), "categoria": (cat or "").strip(),
                       "valor": _cent(valor), "forma": (forma or "").strip(), "tipo": (tipo or "").strip(),
                       "k": k, "n": n})
    orcamento = {}
    for r in abas.get("Orçamento", [])[1:40]:
        r = (r + [None] * 4)[:4]
        if r[1] and isinstance(r[2], (int, float)) and str(r[1]).strip().lower() != "total":
            orcamento[str(r[1]).strip()] = _cent(r[2])
    pagamentos = []
    for r in abas.get("Pagamentos", [])[1:]:
        r = [c for c in (r + [None] * 6)[1:6]]
        if r[1]:
            pagamentos.append({"prioridade": r[0], "credor": r[1], "valor": r[2], "liquidacao": r[3], "status": r[4]})
    return {"mes": mes_do_arquivo(nome), "linhas": linhas, "orcamento": orcamento, "pagamentos": pagamentos}


def _categoria(con, nome: str) -> int | None:
    nome = CATEGORIA_PLANILHA.get(nome, nome)
    cid = categoria_id(con, nome)
    if cid is None and nome:
        con.execute("INSERT INTO categorias (nome, tipo, cor, ordem) VALUES (?, 'despesa', '#9AA0A6', 85)", (nome,))
        cid = categoria_id(con, nome)
    return cid


def _com_dia(mes: str, dia: int) -> date:
    y, m = map(int, mes.split("-"))
    return date(y, m, min(dia, calendar.monthrange(y, m)[1]))


def unir(versoes: list[dict], fechamento: int = 13, meses_com_fatura: set | None = None):
    """Soma as versões mensais. Cada parcela (k>=2) fica na janela da fatura da versão em que aparece
    (a data da planilha é a da compra original, longe do mês em que a parcela de fato cai). A fatura que vence
    em M cobre do dia fechamento+1 de M-1 ao dia fechamento de M."""
    contagem: dict[tuple, int] = {}
    primeiro_mes: dict[tuple, str] = {}
    exemplo: dict[tuple, dict] = {}
    for v in sorted(versoes, key=lambda x: x["mes"] or ""):
        por_arquivo = Counter()
        for l in v["linhas"]:
            # parcela (k>=2) é uma cobrança daquela fatura: a mesma linha em duas versões são dois meses
            # (a planilha nem sempre atualiza o número da parcela). Compra à vista é uma só, em qualquer versão.
            mes = v["mes"] if l["k"] and l["k"] >= 2 else None
            chave = (l["forma"], l["data"], l["descricao"], l["valor"], l["k"], l["n"], l["tipo"], l["categoria"], mes)
            por_arquivo[chave] += 1
            exemplo[chave] = l
            primeiro_mes.setdefault(chave, v["mes"])
        for chave, n in por_arquivo.items():
            contagem[chave] = max(contagem.get(chave, 0), n)
    saida, paradas = [], 0
    for chave, n in contagem.items():
        l = dict(exemplo[chave])
        if l["k"] and l["k"] >= 2 and primeiro_mes[chave] and not _parcela_coerente(l, primeiro_mes[chave]):
            paradas += n            # linha esquecida na planilha (ex.: parcela 8/9 de 2025 numa versão de 2026)
            continue
        if l["k"] and l["k"] >= 2 and primeiro_mes[chave]:
            mes = primeiro_mes[chave] if l["data"].day <= fechamento else somar_meses(primeiro_mes[chave], -1)
            l["data"] = _com_dia(mes, l["data"].day)
        saida.extend(dict(l) for _ in range(n))
    return sorted(saida, key=lambda x: (x["data"], x["forma"], x["descricao"])), paradas


def _parcela_coerente(l: dict, mes_fatura: str) -> bool:
    """A parcela k cai na fatura M se a própria data já é desse período ou se compra + (k-1 ou k) meses dá M."""
    janela = {somar_meses(mes_fatura, -1), mes_fatura}
    compra = l["data"].strftime("%Y-%m")
    return bool(janela & {compra, somar_meses(compra, l["k"] - 1), somar_meses(compra, l["k"])})


def _hash(conta_id, data, valor, k, n) -> str:
    return hashlib.sha1(f"{conta_id}|{data}|{valor}|{k or ''}|{n}".encode()).hexdigest()


def _eh_servico_de_divida(desc: str) -> bool:
    d = normalizar(desc)
    return d.startswith("PARCELAMENTO") or "PIX PARCELADO" in d


def importar(con, arquivos: list[tuple[str, bytes]]) -> dict:
    """Lê as versões da planilha, grava as compras de cartão/dinheiro e guarda as linhas de conta para aprender."""
    versoes = [ler(c, n) for n, c in arquivos]
    for v, (n, _) in zip(versoes, arquivos):
        if not v["mes"]:
            ultimo = max((l["data"] for l in v["linhas"]), default=date.today())
            v["mes"] = ultimo.strftime("%Y-%m")
    import json
    meses_fatura = set(json.loads(config(con, "faturas_inter", "[]") or "[]"))
    linhas, paradas = unir(versoes)
    corte = (con.execute("SELECT dia_fechamento FROM contas WHERE apelido = 'inter-cartao'").fetchone() or [13])[0] or 13
    janelas = [(f"{somar_meses(m, -1)}-{corte + 1:02d}", f"{m}-{corte:02d}") for m in meses_fatura]
    contas = {r["apelido"]: dict(r) for r in con.execute("SELECT * FROM contas")}
    casal = pessoa_id(con, "Casal")
    cat_transf = categoria_id(con, "Transferência entre contas")
    cat_divida = categoria_id(con, "Dívidas")
    cat_negocio = categoria_id(con, "Negócios")
    agora = agora_iso()
    res = {"versoes": len(versoes), "linhas": len(linhas), "parcelas_paradas": paradas, "na_fatura": 0, "cartoes_novos": 0, "cartoes_duplicadas": 0,
           "linhas_de_conta": 0, "regras_novas": 0}
    ocorrencia: Counter = Counter()
    por_chave: dict[str, Counter] = defaultdict(Counter)
    sentido: dict[str, Counter] = defaultdict(Counter)
    for l in linhas:
        valor = abs(l["valor"]) * (1 if l["tipo"].lower().startswith("receita") else -1)
        cat_nome = CATEGORIA_PLANILHA.get(l["categoria"], l["categoria"])
        if l["forma"] in FORMA_CONTA:
            res["linhas_de_conta"] += 1
            con.execute("INSERT OR IGNORE INTO planilha_linhas (forma, data, descricao, categoria, valor, mes_arquivo, "
                        "parcela_atual, parcela_total, chave_unica) VALUES (?,?,?,?,?,?,?,?,?)",
                        (l["forma"], l["data"].isoformat(), l["descricao"], cat_nome, valor, None, l["k"], l["n"],
                         _hash(l["forma"], l["data"], valor, l["descricao"], ocorrencia[(l["forma"], l["data"], l["descricao"], valor)])))
            ocorrencia[(l["forma"], l["data"], l["descricao"], valor)] += 1
            continue
        ap = FORMA_CARTAO.get(l["forma"])
        if not ap or ap not in contas:
            continue
        conta = contas[ap]
        chave = chave_estabelecimento(l["descricao"])
        cid = _categoria(con, l["categoria"]) if l["categoria"] else None
        tipo, escopo = "normal", "pessoal"
        if cat_nome == "Transferência entre contas":
            tipo = "transferencia"
        elif _eh_servico_de_divida(l["descricao"]) and valor < 0:
            cid = cat_divida
        if any(p in normalizar(l["descricao"]) for p in NEGOCIO):
            escopo = "negocio"
            cid = cat_negocio if cat_negocio and tipo == "normal" and cid != cat_divida else cid
        if chave and cid and tipo == "normal" and chave not in GENERICOS and len(chave) >= 3:
            por_chave[chave][cid] += 1
            sentido[chave]["entrada" if valor > 0 else "saida"] += 1
        data_iso = l["data"].isoformat()
        if ap == "inter-cartao" and any(a <= data_iso <= b for a, b in janelas):
            # a fatura de verdade desse período foi importada: ela vale; a planilha só empresta a categoria
            res["na_fatura"] += 1
            if cid:
                con.execute("""UPDATE transacoes SET categoria_id = ?, tipo = ?, escopo = ?, classificacao = 'importada',
                               motivo_duvida = NULL, sugestao_id = NULL
                               WHERE id = (SELECT id FROM transacoes WHERE conta_id = ? AND data = ? AND valor = ?
                                           AND classificacao = 'duvida' LIMIT 1)""",
                            (cid, tipo, escopo, conta["id"], data_iso, valor))
            continue
        k = (conta["id"], l["data"], valor, l["k"])
        n = ocorrencia[k]
        ocorrencia[k] += 1
        h = _hash(conta["id"], data_iso, valor, l["k"], n)
        if con.execute("SELECT 1 FROM transacoes WHERE hash = ?", (h,)).fetchone():
            res["cartoes_duplicadas"] += 1
            if cid:          # a mesma compra veio de outra fonte sem categoria: a planilha sabe qual é
                con.execute("UPDATE transacoes SET categoria_id = ?, tipo = ?, escopo = ?, classificacao = 'importada', "
                            "motivo_duvida = NULL, sugestao_id = NULL WHERE hash = ? AND classificacao = 'duvida'",
                            (cid, tipo, escopo, h))
            continue
        pessoa = casal if ap in ("inter-cartao", "dinheiro") else (conta["titular_id"] or casal)
        con.execute("""INSERT INTO transacoes (conta_id, data, descricao, chave, valor, pessoa_id, categoria_id, escopo,
                       tipo, parcela_atual, parcela_total, classificacao, hash, criado_em)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'importada', ?, ?)""",
                    (conta["id"], l["data"].isoformat(), l["descricao"], chave, valor, pessoa, cid, escopo, tipo,
                     l["k"], l["n"], h, agora))
        res["cartoes_novos"] += 1
    res["regras_novas"] = _regras_de_estabelecimentos(con, por_chave, sentido)
    # orçado por categoria: vale a versão mais recente da planilha
    recente = max(versoes, key=lambda v: v["mes"] or "")
    res["orcado"] = 0
    for nome, cent in recente["orcamento"].items():
        cid = categoria_id(con, CATEGORIA_PLANILHA.get(nome, nome))
        if cid and cent:
            con.execute("UPDATE categorias SET orcamento = ? WHERE id = ?", (cent, cid))
            res["orcado"] += 1
    res["pagamentos"] = recente["pagamentos"]
    res["orcamento_total"] = sum(v for k, v in recente["orcamento"].items() if v)
    con.commit()
    return res


def _regras_de_estabelecimentos(con, por_chave, sentido) -> int:
    """Uma regra por estabelecimento quando a planilha é consistente (>= 75% na mesma categoria)."""
    novas = 0
    for chave, cats in por_chave.items():
        cid, n = cats.most_common(1)[0]
        if n / sum(cats.values()) < 0.75:
            continue
        sinal = "entrada" if sentido[chave]["entrada"] > sentido[chave]["saida"] else "saida"
        if con.execute("SELECT 1 FROM regras WHERE padrao = ? AND origem != 'semente' AND COALESCE(sinal,'') = ?",
                       (chave, sinal)).fetchone():
            continue
        con.execute("INSERT INTO regras (padrao, categoria_id, sinal, origem, usos, criado_em) "
                    "VALUES (?,?,?, 'aprendida', 0, ?)", (chave, cid, sinal, agora_iso()))
        novas += 1
    return novas


def aprender_contas(con, tolerancia_dias: int = 3) -> dict:
    """Casa cada linha de conta da planilha com o lançamento do extrato (mesmo valor, até 3 dias de diferença)
    e passa a categoria de vocês para ele, criando a regra para os próximos."""
    from .categorizar import aprender, reclassificar_duvidas
    contas = {r["apelido"]: r["id"] for r in con.execute("SELECT id, apelido FROM contas")}
    nomes_categoria = {normalizar(r["nome"]): r["id"] for r in con.execute(
        "SELECT id, nome FROM categorias WHERE tipo IN ('despesa', 'receita')")}
    casadas = 0
    for pl in con.execute("SELECT * FROM planilha_linhas WHERE aprendida = 0 ORDER BY data, id").fetchall():
        conta_id = contas.get(FORMA_CONTA.get(pl["forma"]))
        if not conta_id:
            continue
        tx = con.execute(
            "SELECT id, tipo FROM transacoes WHERE conta_id = ? AND valor = ? AND classificacao != 'manual' "
            "AND par_id IS NULL AND estimado = 0 AND ABS(julianday(data) - julianday(?)) <= ? ORDER BY ABS(julianday(data) - julianday(?)) LIMIT 1",
            (conta_id, pl["valor"], pl["data"], tolerancia_dias, pl["data"])).fetchone()
        if not tx:
            continue
        if CATEGORIA_PLANILHA.get(pl["categoria"], pl["categoria"]) == "Transferência entre contas":
            # Na planilha "Transf. Contas" também guarda contas fixas pagas da conta ("Aluguel"), ajustes e
            # adiantamentos de salário. Só aproveita quando a descrição é o nome de uma categoria.
            cid = nomes_categoria.get(normalizar(pl["descricao"]))
            if not cid:
                continue
        else:
            cid = categoria_id(con, pl["categoria"]) if pl["categoria"] else None
        if cid is None and pl["categoria"]:
            cid = _categoria(con, pl["categoria"])
        if not cid:
            continue
        escopo = "negocio" if any(p in normalizar(pl["descricao"]) for p in NEGOCIO) else None
        aprender(con, tx["id"], cid, escopo=escopo, lembrar=True)
        con.execute("UPDATE planilha_linhas SET aprendida = 1 WHERE id = ?", (pl["id"],))
        casadas += 1
    con.commit()
    reclass = reclassificar_duvidas(con)
    pendentes = con.execute("SELECT COUNT(*) FROM planilha_linhas WHERE aprendida = 0").fetchone()[0]
    return {"casadas": casadas, "sem_par_no_extrato": pendentes, "reclassificadas": reclass}
