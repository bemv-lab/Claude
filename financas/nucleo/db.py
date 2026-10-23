"""Banco SQLite: esquema, conexão e cadastro inicial (contas, pessoas, categorias, regras, dívidas)."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .util import agora_iso

RAIZ = Path(__file__).resolve().parent.parent
PASTA_DADOS = RAIZ / "dados"
BANCO_REAL = PASTA_DADOS / "financas.db"
BANCO_DEMO = PASTA_DADOS / "demo.db"
ENTRADA_REAL = RAIZ / "entrada"
ENTRADA_DEMO = PASTA_DADOS / "demo-entrada"

ESQUEMA = """
CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, cor TEXT
);
CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY,
  apelido TEXT NOT NULL UNIQUE,          -- slug estável
  nome TEXT NOT NULL,
  instituicao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('corrente','cartao','beneficio','investimento')),
  titular_id INTEGER REFERENCES pessoas(id),
  pasta TEXT,                            -- subpasta em entrada/
  identificador TEXT,                    -- conta/cartão no OFX (ACCTID), para reconhecer o arquivo
  dia_vencimento INTEGER, dia_fechamento INTEGER,
  limite INTEGER,
  ativa INTEGER NOT NULL DEFAULT 1,
  observacao TEXT
);
CREATE TABLE IF NOT EXISTS portadores (       -- quem usa cada cartão (titular/adicional)
  id INTEGER PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  pessoa_id INTEGER NOT NULL REFERENCES pessoas(id),
  padrao TEXT NOT NULL,                 -- trecho do nome ou final do cartão no extrato
  papel TEXT DEFAULT 'titular'
);
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa','receita','divida','investimento','transferencia')),
  cor TEXT, fixa INTEGER DEFAULT 0, ordem INTEGER DEFAULT 100, ativa INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS importacoes (
  id INTEGER PRIMARY KEY,
  arquivo TEXT, hash_arquivo TEXT, conta_id INTEGER, formato TEXT,
  novas INTEGER DEFAULT 0, duplicadas INTEGER DEFAULT 0,
  status TEXT, mensagem TEXT, criado_em TEXT
);
CREATE INDEX IF NOT EXISTS ix_imp_hash ON importacoes(hash_arquivo);
CREATE TABLE IF NOT EXISTS transacoes (
  id INTEGER PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  data TEXT NOT NULL,
  descricao TEXT NOT NULL,
  chave TEXT,                            -- chave do estabelecimento (regras aprendidas)
  valor INTEGER NOT NULL,                -- centavos; negativo = saída
  pessoa_id INTEGER REFERENCES pessoas(id),
  categoria_id INTEGER REFERENCES categorias(id),
  escopo TEXT NOT NULL DEFAULT 'pessoal' CHECK (escopo IN ('pessoal','negocio')),
  tipo TEXT NOT NULL DEFAULT 'normal'
       CHECK (tipo IN ('normal','transferencia','fatura','investimento','beneficio')),
  parcela_atual INTEGER, parcela_total INTEGER,
  classificacao TEXT NOT NULL DEFAULT 'duvida'
       CHECK (classificacao IN ('regra','heuristica','manual','duvida','importada')),
  sugestao_id INTEGER REFERENCES categorias(id),
  motivo_duvida TEXT,
  par_id INTEGER,                        -- a outra ponta de uma transferência
  divida_id INTEGER REFERENCES dividas(id),
  categoria_externa TEXT, portador TEXT, fitid TEXT,
  hash TEXT NOT NULL UNIQUE,
  importacao_id INTEGER REFERENCES importacoes(id),
  observacao TEXT,
  criado_em TEXT
);
CREATE INDEX IF NOT EXISTS ix_tx_data ON transacoes(data);
CREATE INDEX IF NOT EXISTS ix_tx_conta ON transacoes(conta_id, data);
CREATE INDEX IF NOT EXISTS ix_tx_chave ON transacoes(chave);
CREATE TABLE IF NOT EXISTS regras (
  id INTEGER PRIMARY KEY,
  padrao TEXT NOT NULL,                  -- texto normalizado que a descrição deve conter
  categoria_id INTEGER REFERENCES categorias(id),
  pessoa_id INTEGER REFERENCES pessoas(id),
  escopo TEXT, tipo TEXT,
  conta_id INTEGER REFERENCES contas(id),
  sinal TEXT CHECK (sinal IN ('saida','entrada') OR sinal IS NULL),
  origem TEXT NOT NULL DEFAULT 'semente',   -- semente | aprendida | manual
  usos INTEGER DEFAULT 0,
  criado_em TEXT
);
CREATE TABLE IF NOT EXISTS perfis_csv (
  id INTEGER PRIMARY KEY, assinatura TEXT UNIQUE, nome TEXT, mapeamento TEXT, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS dividas (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL, credor TEXT, tipo TEXT,      -- consignado | familia | cartao | banco | outro
  saldo_base INTEGER,                    -- saldo devedor na data_base (NULL = a confirmar)
  data_base TEXT,
  parcela_valor INTEGER, dia_vencimento INTEGER,
  parcelas_restantes INTEGER,            -- na data_base
  parcelas_total INTEGER, data_inicio TEXT,
  valor_emprestado INTEGER,              -- opcional: dá a taxa implícita do contrato
  mes_final TEXT,                        -- AAAA-MM
  juros_mensal REAL,                     -- % ao mês (NULL = desconhecido; 0 = sem juros)
  status TEXT DEFAULT 'ativa',           -- ativa | negociando | acordo | quitada
  forma_pagamento TEXT,                  -- pix | cartao_1x | boleto | ...
  reconhecer_valor INTEGER,              -- valor exato a procurar nos extratos
  reconhecer_texto TEXT,                 -- trecho da descrição (ex.: nome de quem recebe)
  reconhecer_janela INTEGER DEFAULT 4,   -- dias de folga em torno do vencimento
  plano_mensal INTEGER, plano_data_alvo TEXT,
  urgencia INTEGER DEFAULT 0,            -- 0 normal, 1 atenção, 2 urgente (negativação, cobrança)
  observacao TEXT, ordem INTEGER DEFAULT 100, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS pagamentos_divida (
  id INTEGER PRIMARY KEY,
  divida_id INTEGER NOT NULL REFERENCES dividas(id),
  data TEXT NOT NULL, valor INTEGER NOT NULL,
  transacao_id INTEGER UNIQUE REFERENCES transacoes(id),
  observacao TEXT
);
CREATE TABLE IF NOT EXISTS negociacoes (
  id INTEGER PRIMARY KEY,
  divida_id INTEGER NOT NULL REFERENCES dividas(id),
  data TEXT NOT NULL, texto TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL, chave TEXT NOT NULL UNIQUE,
  severidade INTEGER NOT NULL DEFAULT 1,  -- 3 alta, 2 média, 1 baixa
  titulo TEXT NOT NULL, mensagem TEXT NOT NULL, acao TEXT,
  transacao_id INTEGER, ativo INTEGER DEFAULT 1, dispensado INTEGER DEFAULT 0,
  criado_em TEXT, atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS config_alertas (
  tipo TEXT PRIMARY KEY, nome TEXT, descricao TEXT, ativo INTEGER DEFAULT 1, parametros TEXT
);
CREATE TABLE IF NOT EXISTS metas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, faixa TEXT DEFAULT 'medio',
  valor_alvo INTEGER NOT NULL, guardado INTEGER DEFAULT 0, prazo TEXT,
  prioridade INTEGER DEFAULT 100, ativa INTEGER DEFAULT 1, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);
"""

PESSOAS = [("Bárbara", "#B4637A"), ("Lucas", "#3F6FB5"), ("Casal", "#0F766E")]

# nome, tipo, cor, fixa, ordem
CATEGORIAS = [
    ("Salário", "receita", "#0F766E", 0, 1),
    ("Renda extra", "receita", "#14918A", 0, 2),
    ("Rendimentos", "receita", "#3BA99C", 0, 3),
    ("Benefícios", "receita", "#7AB8A8", 0, 4),
    ("Moradia", "despesa", "#5B6C8F", 1, 10),
    ("Contas da casa", "despesa", "#7486A8", 1, 11),
    ("Mercado", "despesa", "#C08A3E", 0, 12),
    ("Alimentação fora", "despesa", "#D9774B", 0, 13),
    ("Transporte", "despesa", "#8A7FB8", 0, 14),
    ("Saúde", "despesa", "#C25B6E", 0, 15),
    ("Educação", "despesa", "#4E8FB0", 1, 16),
    ("Lazer", "despesa", "#B87FA6", 0, 17),
    ("Assinaturas", "despesa", "#6E7FD1", 1, 18),
    ("Compras", "despesa", "#A68A64", 0, 19),
    ("Cuidados pessoais", "despesa", "#C79AA6", 0, 20),
    ("Casa e manutenção", "despesa", "#8C9A6E", 0, 21),
    ("Presentes e doações", "despesa", "#B5845A", 0, 22),
    ("Tarifas e juros", "despesa", "#A65151", 0, 23),
    ("Impostos", "despesa", "#7D7D7D", 0, 24),
    ("Negócios", "despesa", "#2F7F6F", 0, 25),
    ("Outros", "despesa", "#9AA0A6", 0, 90),
    ("Dívidas", "divida", "#8E4B4B", 1, 30),
    ("Investimentos e reserva", "investimento", "#2E8B57", 0, 40),
    ("Transferência entre contas", "transferencia", "#A0A7B4", 0, 50),
    ("Pagamento de fatura", "transferencia", "#A0A7B4", 0, 51),
]

# padrão (normalizado), categoria, extras  — primeira camada: regras determinísticas
REGRAS_SEMENTE = [
    # alimentação fora
    *[(p, "Alimentação fora", {}) for p in [
        "IFOOD", "IFD", "RAPPI", "ZE DELIVERY", "MCDONALDS", "MC DONALDS", "BURGER KING", "BK BRASIL",
        "SUBWAY", "OUTBACK", "STARBUCKS", "HABIBS", "RESTAURANTE", "LANCHONETE", "PIZZARIA",
        "PADARIA", "CHURRASCARIA", "SUSHI", "CAFETERIA", "COCO BAMBU", "SPOLETO", "GIRAFFAS"]],
    # mercado
    *[(p, "Mercado", {}) for p in [
        "CARREFOUR", "ASSAI", "ATACADAO", "PAO DE ACUCAR", "EXTRA HIPER", "SUPERMERCADO", "MERCADO",
        "HORTIFRUTI", "SAMS CLUB", "DIA BRASIL", "BIG BOMPRECO", "MAKRO", "ST MARCHE", "OBA HORTI",
        "SONDA", "GUANABARA", "ZONA SUL", "PREZUNIC", "SAVEGNAGO", "MUFFATO", "CONDOR", "ANGELONI"]],
    # transporte
    *[(p, "Transporte", {}) for p in [
        "UBER", "99 TAXI", "99APP", "99 POP", "CABIFY", "POSTO", "SHELL", "IPIRANGA", "PETROBRAS",
        "BR MANIA", "ESTACIONAMENTO", "ESTAPAR", "SEM PARAR", "CONECTCAR", "VELOE", "METRO",
        "BILHETE UNICO", "RIOCARD", "LATAM", "GOL LINHAS", "AZUL LINHAS", "DETRAN", "IPVA"]],
    # saúde
    *[(p, "Saúde", {}) for p in [
        "DROGASIL", "DROGA RAIA", "RAIA", "PAGUE MENOS", "DROGARIA", "FARMACIA", "PANVEL",
        "UNIMED", "HAPVIDA", "AMIL", "SULAMERICA SAUDE", "BRADESCO SAUDE", "LABORATORIO",
        "CLINICA", "HOSPITAL", "ODONTO", "DENTAL", "FLEURY", "DASA"]],
    # assinaturas
    *[(p, "Assinaturas", {}) for p in [
        "NETFLIX", "SPOTIFY", "DISNEY", "PRIME VIDEO", "AMAZON PRIME", "AMAZONPRIME", "HBO", "MAX ",
        "GLOBOPLAY", "DEEZER", "YOUTUBE PREMIUM", "YOUTUBEPREMIUM", "APPLE COM BILL", "APPLE COM",
        "GOOGLE ONE", "GOOGLE STORAGE", "ICLOUD", "CANVA", "CHATGPT", "OPENAI", "ANTHROPIC",
        "CLAUDE AI", "PARAMOUNT", "CRUNCHYROLL", "MICROSOFT", "ADOBE", "DROPBOX", "SMARTFIT",
        "SMART FIT", "BLUEFIT", "TOTALPASS", "WELLHUB", "GYMPASS"]],
    # contas da casa
    *[(p, "Contas da casa", {}) for p in [
        "ENEL", "CEMIG", "LIGHT SA", "COPEL", "CELESC", "CPFL", "COELBA", "NEOENERGIA", "EQUATORIAL",
        "SABESP", "CEDAE", "COPASA", "SANEPAR", "EMBASA", "COMGAS", "NATURGY", "ULTRAGAZ",
        "LIQUIGAS", "SUPERGASBRAS", "VIVO", "CLARO", "TIM ", "OI FIBRA", "NET SERVICOS",
        "SKY ", "INTERNET"]],
    # moradia
    *[(p, "Moradia", {}) for p in ["ALUGUEL", "CONDOMINIO", "IMOBILIARIA", "QUINTOANDAR", "QUINTO ANDAR", "IPTU"]],
    # compras
    *[(p, "Compras", {}) for p in [
        "AMAZON", "MERCADOLIVRE", "MERCADO LIVRE", "MERCADOPAGO", "SHOPEE", "SHEIN", "ALIEXPRESS",
        "MAGAZINE LUIZA", "MAGALU", "CASAS BAHIA", "AMERICANAS", "RENNER", "RIACHUELO",
        "ZARA", "CENTAURO", "NETSHOES", "LEROY MERLIN", "TOK STOK", "KABUM", "FAST SHOP"]],
    # educação
    *[(p, "Educação", {}) for p in ["ESCOLA", "COLEGIO", "FACULDADE", "UNIVERSIDADE", "CURSO",
                                    "UDEMY", "ALURA", "HOTMART", "LIVRARIA"]],
    # lazer
    *[(p, "Lazer", {}) for p in ["CINEMA", "CINEMARK", "INGRESSO", "SYMPLA", "EVENTIM", "TEATRO",
                                 "AIRBNB", "BOOKING", "HOTEL", "STEAM", "PLAYSTATION", "XBOX"]],
    # cuidados pessoais
    *[(p, "Cuidados pessoais", {}) for p in ["SALAO", "BARBEARIA", "BOTICARIO", "NATURA", "SEPHORA",
                                             "MANICURE", "ESTETICA"]],
    # tarifas e juros
    *[(p, "Tarifas e juros", {}) for p in ["TARIFA", "IOF", "JUROS", "ENCARGOS", "MULTA", "ANUIDADE",
                                           "CESTA DE SERVICOS", "MORA"]],
    # impostos
    *[(p, "Impostos", {}) for p in ["DARF", "DAS SIMPLES", "PGDAS", "RECEITA FEDERAL", "GRU"]],
    # negócio (Rocco Kids): ferramentas e anúncios
    *[(p, "Negócios", {"escopo": "negocio"}) for p in [
        "SHOPIFY", "FACEBK", "FACEBOOK", "META ADS", "META PLATFORMS", "GOOGLE ADS", "RUNWAY",
        "METRICOOL", "MELHOR ENVIO", "CORREIOS", "ROCCO KIDS", "ROCO KIDS", "YAMPI", "NUVEMSHOP"]],
    # receitas
    *[(p, "Salário", {"sinal": "entrada"}) for p in ["SALARIO", "PAGTO SALARIO", "FOLHA DE PAGAMENTO",
                                                     "PROVENTOS", "VENCIMENTOS", "REMUNERACAO"]],
    *[(p, "Rendimentos", {"sinal": "entrada", "tipo": "investimento"}) for p in [
        "RENDIMENTO", "REND PAGO", "REMUNERACAO APLICACAO", "JUROS SOBRE CAPITAL"]],
    *[(p, "Investimentos e reserva", {"tipo": "investimento"}) for p in [
        "APLICACAO", "RESGATE", "CDB", "TESOURO DIRETO", "POUPANCA", "COFRINHO", "PORQUINHO",
        "CAIXINHA", "INVEST FACIL", "MEU PORQUINHO"]],
    *[(p, "Pagamento de fatura", {"tipo": "fatura"}) for p in [
        "PAGAMENTO FATURA", "PAGAMENTO DE FATURA", "PAG FATURA", "PAGTO FATURA", "PGTO FATURA",
        "PAG FAT", "FATURA CARTAO", "PAGAMENTO RECEBIDO", "PAGAMENTO ON LINE", "PAGAMENTO EFETUADO CARTAO",
        "PAGAMENTO CARTAO", "PAGAMENTO DO CARTAO", "DEBITO AUTOMATICO FATURA", "INTER FATURA"]],
]

ALERTAS_PADRAO = [
    ("parcelamento", "Compra parcelada",
     "Regra do casal: evitar parcelamento. Avisa na hora e mostra quanto da renda futura fica comprometida.", 1, {}),
    ("categoria_acima_media", "Categoria acima da média",
     "Gasto do mês numa categoria passou da média dos 3 meses anteriores.", 1, {"fator": 1.3, "minimo": 10000}),
    ("fatura_orcamento", "Fatura pesando no orçamento",
     "Compras no cartão do mês se aproximando do limite que vocês definiram.", 1, {"percentual": 0.8}),
    ("assinatura_nova", "Assinatura nova",
     "Apareceu uma cobrança recorrente que não existia antes.", 1, {}),
    ("gasto_fora_padrao", "Gasto fora do padrão",
     "Um lançamento muito acima do que vocês costumam gastar naquela categoria.", 1, {"fator": 3, "minimo": 20000}),
    ("vencimento_proximo", "Vencimento chegando",
     "Consignado (dia 15), faturas e parcelas de acordos nos próximos dias.", 1, {"dias": 3}),
    ("saldo_projetado_negativo", "Mês pode fechar no vermelho",
     "No ritmo atual, os gastos do mês passam da renda esperada.", 1, {}),
    ("pagamento_cartao", "Dívida paga no cartão",
     "Antes de passar uma dívida no cartão (ex.: MetaEds), mostra a fatura em que cai e o custo se algo "
     "ficar no rotativo. Depois, lembra de pagar a fatura inteira.", 1, {}),
    ("fila_duvidas", "Lançamentos esperando vocês",
     "Lembra quando a fila de dúvidas cresce.", 1, {"minimo": 8}),
]

CONFIG_PADRAO = {
    "renda_mensal_esperada": "0",     # centavos; 0 = calcula pela média
    "orcamento_mensal": "0",          # gasto variável do mês; 0 = automático
    "meta_poupanca_mensal": "0",
    "limite_fatura_mensal": "0",      # quanto aceitam gastar no cartão por mês; 0 = sem limite
    "juros_rotativo_mensal": "14.5",  # % a.m. para simulações (editável)
    "pasta_backup": "",
    "nomes_casal": json.dumps(["BARBARA", "LUCAS"]),
    "meses_reserva": "6",
    "pin_rede": "",
}


# Dados informados em 23/10/2026 (consignado: 17 de 48 parcelas pagas até 15/10/2026).
CONSIGNADO = dict(parcelas_total=48, data_inicio="2025-06-15", mes_final="2029-05", parcelas_restantes=31,
                  data_base="2026-10-15", juros_mensal=None,
                  observacao="Consignado feito pelo pai: 48 parcelas de R$ 680,00, todo dia 15, pagas direto a ele "
                             "(15/06/2025 a 15/05/2029).")
METAEDS = dict(saldo_base=200000, data_base="2026-10-23", reconhecer_texto="METAEDS",
               observacao="Pagamento previsto no cartão de crédito em 1x. Simulem antes de passar o cartão.")
VERSAO_DADOS = 2


def migrar(con: sqlite3.Connection) -> None:
    """Atualiza bancos criados por versões anteriores, sem desfazer o que vocês editaram."""
    cols = {r["name"] for r in con.execute("PRAGMA table_info(dividas)")}
    for c, tipo in (("parcelas_total", "INTEGER"), ("data_inicio", "TEXT"), ("valor_emprestado", "INTEGER")):
        if c not in cols:
            con.execute(f"ALTER TABLE dividas ADD COLUMN {c} {tipo}")
    versao = int(config(con, "versao_dados", "1") or 1)
    if versao < 2:
        # só preenche o que ainda está no estado de fábrica (campos vazios)
        con.execute("UPDATE dividas SET parcelas_total = ?, data_inicio = ?, mes_final = ?, parcelas_restantes = ?, "
                    "data_base = ?, observacao = ? WHERE tipo = 'consignado' AND parcelas_restantes IS NULL",
                    tuple(CONSIGNADO[k] for k in ("parcelas_total", "data_inicio", "mes_final", "parcelas_restantes",
                                                  "data_base", "observacao")))
        con.execute("UPDATE dividas SET saldo_base = ?, data_base = ?, reconhecer_texto = ?, observacao = ? "
                    "WHERE nome = 'MetaEds' AND saldo_base IS NULL",
                    tuple(METAEDS[k] for k in ("saldo_base", "data_base", "reconhecer_texto", "observacao")))
    for tipo, nome, desc, ativo, par in ALERTAS_PADRAO:
        con.execute("INSERT OR IGNORE INTO config_alertas (tipo, nome, descricao, ativo, parametros) "
                    "VALUES (?,?,?,?,?)", (tipo, nome, desc, ativo, json.dumps(par)))
    con.execute("INSERT INTO config (chave, valor) VALUES ('versao_dados', ?) "
                "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (str(VERSAO_DADOS),))
    con.commit()


def conectar(caminho: Path | str) -> sqlite3.Connection:
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(caminho), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(ESQUEMA)
    if not con.execute("SELECT 1 FROM pessoas LIMIT 1").fetchone():
        semear(con)
    migrar(con)
    return con


def _id(con, tabela, campo, valor):
    r = con.execute(f"SELECT id FROM {tabela} WHERE {campo} = ?", (valor,)).fetchone()
    return r["id"] if r else None


def pessoa_id(con, nome):
    return _id(con, "pessoas", "nome", nome)


def categoria_id(con, nome):
    return _id(con, "categorias", "nome", nome)


def semear(con: sqlite3.Connection) -> None:
    """Cadastro da primeira execução (tudo editável depois)."""
    agora = agora_iso()
    con.executemany("INSERT INTO pessoas (nome, cor) VALUES (?, ?)", PESSOAS)
    con.executemany("INSERT INTO categorias (nome, tipo, cor, fixa, ordem) VALUES (?,?,?,?,?)", CATEGORIAS)
    b, l, c = pessoa_id(con, "Bárbara"), pessoa_id(con, "Lucas"), pessoa_id(con, "Casal")
    contas = [
        ("inter-conta", "Inter · Conta PF", "Inter", "corrente", b, "inter-conta", None, None, None),
        ("bb", "Banco do Brasil", "Banco do Brasil", "corrente", l, "bb", None, None, None),
        ("itau", "Itaú", "Itaú", "corrente", l, "itau", None, None, "Conta onde cai o salário do Lucas"),
        ("inter-cartao", "Inter · Cartão de crédito", "Inter", "cartao", b, "inter-cartao", 10, 3,
         "Titular Bárbara, adicional Lucas. Concentra as compras do casal."),
        ("flash", "Flash Benefícios", "Flash", "beneficio", c, "flash", None, None,
         "Saldo de benefício: não é renda livre."),
        ("nubank", "Nubank · Cartão", "Nubank", "cartao", c, "nubank", None, None,
         "Débito pendente em negociação."),
    ]
    for ap, nome, inst, tipo, tit, pasta, venc, fech, obs in contas:
        con.execute("""INSERT INTO contas (apelido, nome, instituicao, tipo, titular_id, pasta,
                       dia_vencimento, dia_fechamento, observacao) VALUES (?,?,?,?,?,?,?,?,?)""",
                    (ap, nome, inst, tipo, tit, pasta, venc, fech, obs))
    cartao = _id(con, "contas", "apelido", "inter-cartao")
    con.executemany("INSERT INTO portadores (conta_id, pessoa_id, padrao, papel) VALUES (?,?,?,?)",
                    [(cartao, b, "BARBARA", "titular"), (cartao, l, "LUCAS", "adicional")])
    for padrao, cat, extra in REGRAS_SEMENTE:
        con.execute("""INSERT INTO regras (padrao, categoria_id, escopo, tipo, sinal, origem, criado_em)
                       VALUES (?,?,?,?,?, 'semente', ?)""",
                    (padrao.strip(), categoria_id(con, cat), extra.get("escopo"), extra.get("tipo"),
                     extra.get("sinal"), agora))
    for tipo, nome, desc, ativo, par in ALERTAS_PADRAO:
        con.execute("INSERT INTO config_alertas (tipo, nome, descricao, ativo, parametros) VALUES (?,?,?,?,?)",
                    (tipo, nome, desc, ativo, json.dumps(par)))
    for k, v in CONFIG_PADRAO.items():
        con.execute("INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)", (k, v))
    dividas = [
        dict(nome="Empréstimo consignado (pai)", credor="Pai", tipo="consignado", parcela_valor=68000,
             dia_vencimento=15, forma_pagamento="pix", reconhecer_valor=68000, reconhecer_janela=4, ordem=1,
             **CONSIGNADO),
        dict(nome="Dívida com a mãe (Edilene)", credor="Edilene", tipo="familia", saldo_base=500000,
             juros_mensal=0.0, ordem=2, observacao="Sem data definida. Monte um plano (valor por mês ou data-alvo)."),
        dict(nome="MetaEds", credor="MetaEds", tipo="outro", forma_pagamento="cartao_1x", ordem=3, **METAEDS),
        dict(nome="Nubank (débito pendente)", credor="Nubank", tipo="cartao", status="negociando",
             urgencia=1, ordem=4, observacao="Registre valor, propostas e o acordo fechado."),
    ]
    for d in dividas:
        d.setdefault("data_base", agora[:10])
        d["criado_em"] = agora
        cols = ", ".join(d)
        con.execute(f"INSERT INTO dividas ({cols}) VALUES ({', '.join('?' * len(d))})", tuple(d.values()))
    con.commit()


def config(con, chave, padrao=None):
    r = con.execute("SELECT valor FROM config WHERE chave = ?", (chave,)).fetchone()
    return r["valor"] if r and r["valor"] is not None else padrao


def config_int(con, chave, padrao=0) -> int:
    try:
        return int(float(config(con, chave, padrao)))
    except (TypeError, ValueError):
        return padrao


def definir_config(con, chave, valor):
    con.execute("INSERT INTO config (chave, valor) VALUES (?, ?) "
                "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (chave, str(valor)))
    con.commit()


def linhas(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]
