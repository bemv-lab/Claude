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
  cor TEXT, fixa INTEGER DEFAULT 0, ordem INTEGER DEFAULT 100, ativa INTEGER DEFAULT 1,
  orcamento INTEGER                      -- orçado do mês em centavos (aba Orçamento da planilha); NULL = sem
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
  estimado INTEGER NOT NULL DEFAULT 0,   -- 1 = valor estimado por vocês (sem extrato), não veio do banco
  hash TEXT NOT NULL UNIQUE,
  importacao_id INTEGER REFERENCES importacoes(id),
  observacao TEXT,
  produto TEXT,                          -- o que foi comprado (marketplace: Amazon, Mercado Livre...)
  competencia TEXT,                      -- AAAA-MM escolhido por vocês (ex.: salário adiantado conta no mês seguinte)
  mes_ref TEXT,                          -- mês em que conta: competência, ou mês da fatura no cartão, ou o da data
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
CREATE TABLE IF NOT EXISTS planilha_linhas (   -- linhas da planilha antiga, para aprender as categorias de vocês
  id INTEGER PRIMARY KEY,
  forma TEXT NOT NULL, data TEXT NOT NULL, descricao TEXT NOT NULL, categoria TEXT, valor INTEGER NOT NULL,
  mes_arquivo TEXT, parcela_atual INTEGER, parcela_total INTEGER,
  aprendida INTEGER NOT NULL DEFAULT 0,
  chave_unica TEXT NOT NULL UNIQUE
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
CREATE TABLE IF NOT EXISTS rendas_fixas (      -- entradas que se repetem (salários): editáveis, valem a partir de um mês
  id INTEGER PRIMARY KEY,
  descricao TEXT NOT NULL,
  padrao TEXT NOT NULL,                  -- texto que aparece no extrato, para ligar o que entrou
  dia INTEGER NOT NULL,
  valor INTEGER NOT NULL,                -- centavos
  inicio TEXT NOT NULL,                  -- AAAA-MM
  fim TEXT,                              -- AAAA-MM; vazio = sem fim
  pessoa_id INTEGER REFERENCES pessoas(id),
  observacao TEXT,
  criado_em TEXT
);
CREATE TABLE IF NOT EXISTS previstos (         -- provisões: o que vocês esperam receber ou pagar
  id INTEGER PRIMARY KEY,
  mes TEXT NOT NULL,                     -- AAAA-MM ('*' = vale para todos os meses, só em ajustes de automáticos)
  ate TEXT,                              -- repete todo mês até este AAAA-MM (vazio = só no mês)
  dia INTEGER,
  descricao TEXT NOT NULL,
  valor INTEGER NOT NULL,                -- centavos; negativo = saída
  categoria_id INTEGER REFERENCES categorias(id),
  chave_auto TEXT,                       -- preenchido quando ajusta um previsto automático (renda, contrato, conta fixa)
  status TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','realizado','cancelado')),
  no_plano INTEGER NOT NULL DEFAULT 1,   -- 1 = é fora do normal e entra na projeção do Plano
  observacao TEXT,
  criado_em TEXT
);
CREATE INDEX IF NOT EXISTS ix_previstos_mes ON previstos(mes);
CREATE TABLE IF NOT EXISTS encontros (         -- encontros de alinhamento do casal
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  titulo TEXT,
  notas TEXT,
  criado_em TEXT
);
CREATE TABLE IF NOT EXISTS acoes (             -- compromissos combinados num encontro
  id INTEGER PRIMARY KEY,
  encontro_id INTEGER REFERENCES encontros(id),
  texto TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),   -- quando o compromisso é sobre gasto de uma categoria
  limite INTEGER,                        -- centavos no período; 0 = não gastar nada
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  responsavel TEXT DEFAULT 'Casal',
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','cumprida','parcial','nao_cumprida','cancelada')),
  criado_em TEXT
);
CREATE TABLE IF NOT EXISTS acao_registros (    -- o que foi dito sobre a ação em cada encontro
  id INTEGER PRIMARY KEY,
  acao_id INTEGER NOT NULL REFERENCES acoes(id),
  encontro_id INTEGER REFERENCES encontros(id),
  data TEXT NOT NULL,
  status TEXT,
  nota TEXT
);
"""

PESSOAS = [("Bárbara", "#B4637A"), ("Lucas", "#3F6FB5"), ("Casal", "#0F766E")]

# nome, tipo, cor, fixa, ordem
CATEGORIAS = [
    # receitas
    ("Salário", "receita", "#0F766E", 0, 1),
    ("Lucros", "receita", "#14918A", 0, 2),
    ("Renda extra", "receita", "#2BA597", 0, 3),
    ("Rendimentos", "receita", "#3BA99C", 0, 4),
    ("Benefícios", "receita", "#7AB8A8", 0, 5),
    ("Reembolsos", "receita", "#8FC4B8", 0, 6),
    # fixas (taxonomia da planilha de vocês, aba Val.Dados)
    ("Aluguel", "despesa", "#5B6C8F", 1, 10),
    ("IPTU", "despesa", "#6B7A9C", 1, 11),
    ("Condomínio", "despesa", "#7B88A8", 1, 12),
    ("Energia", "despesa", "#C9A227", 1, 13),
    ("Internet Fixa", "despesa", "#6E8FB5", 1, 14),
    ("Internet Móvel", "despesa", "#7FA0C4", 1, 15),
    ("Contas da casa", "despesa", "#7486A8", 1, 16),
    ("Academia", "despesa", "#8A7FB8", 1, 17),
    ("Terapia", "despesa", "#A68FB8", 1, 18),
    ("Imposto LB", "despesa", "#7D7D7D", 1, 19),
    ("Educação", "despesa", "#4E8FB0", 1, 20),
    ("Assinaturas", "despesa", "#6E7FD1", 1, 21),
    # variáveis
    ("Supermercado", "despesa", "#C08A3E", 0, 30),
    ("Padaria", "despesa", "#C9A66B", 0, 30),
    ("Restaurante", "despesa", "#D9774B", 0, 31),
    ("Marmita", "despesa", "#D99A6B", 0, 32),
    ("Açougue", "despesa", "#B5594B", 0, 33),
    ("Sacolão", "despesa", "#8FA05A", 0, 34),
    ("Transporte", "despesa", "#8A7FB8", 0, 35),
    ("Vestuário", "despesa", "#B87FA6", 0, 36),
    ("Turismo", "despesa", "#4EA0A8", 0, 37),
    ("Viagem", "despesa", "#4E8FB0", 0, 38),
    ("Farmácia", "despesa", "#C25B6E", 0, 39),
    ("Saúde", "despesa", "#D0707F", 0, 40),
    ("Lazer", "despesa", "#B07FD0", 0, 41),
    ("Beleza", "despesa", "#C79AA6", 0, 42),
    ("Esportes", "despesa", "#7FA67F", 0, 43),
    ("Toddy", "despesa", "#A68A64", 0, 44),
    ("Aquisições", "despesa", "#8C7A5B", 0, 45),
    ("Extras", "despesa", "#A68A64", 0, 46),
    ("Taxas", "despesa", "#A65151", 0, 47),
    ("Casa e manutenção", "despesa", "#8C9A6E", 0, 48),
    ("Presentes e doações", "despesa", "#B5845A", 0, 49),
    ("Impostos", "despesa", "#7D7D7D", 0, 50),
    ("Negócios", "despesa", "#2F7F6F", 0, 51),
    ("Outros", "despesa", "#9AA0A6", 0, 90),
    # não entram como gasto nem renda
    ("Dívidas", "divida", "#8E4B4B", 1, 60),
    ("Investimentos e reserva", "investimento", "#2E8B57", 0, 70),
    ("Transferência entre contas", "transferencia", "#A0A7B4", 0, 80),
    ("Pagamento de fatura", "transferencia", "#A0A7B4", 0, 81),
]

# Nomes que a planilha antiga usa e que aqui têm outro nome.
CATEGORIA_PLANILHA = {"Transf. Contas": "Transferência entre contas", "Taxas/Parcelados": "Taxas",
                      "Investimento": "Investimentos e reserva"}

# padrão (normalizado), categoria, extras  — primeira camada: regras determinísticas.
# O padrão vale quando aparece como palavra inteira na descrição ("MERCADO" não casa com "MERCADOS").
REGRAS_SEMENTE = [
    *[(p, "Restaurante", {}) for p in [
        "IFOOD", "IFD", "RAPPI", "ZE DELIVERY", "MCDONALDS", "MC DONALDS", "BURGER KING", "BK BRASIL",
        "SUBWAY", "OUTBACK", "STARBUCKS", "HABIBS", "RESTAURANTE", "LANCHONETE", "PIZZARIA",
        "PADARIA", "CHURRASCARIA", "SUSHI", "CAFETERIA", "COCO BAMBU", "SPOLETO", "GIRAFFAS", "GELATERIA",
        "SORVETERIA", "SORVETES", "TAPIOCA", "CAFE"]],
    *[(p, "Supermercado", {}) for p in [
        "CARREFOUR", "ASSAI", "ATACADAO", "PAO DE ACUCAR", "EXTRA HIPER", "SUPERMERCADO", "SUPERMERCADOS",
        "MERCADO", "MERCADINHO", "HORTIFRUTI", "SAMS CLUB", "DIA BRASIL", "BIG BOMPRECO", "MAKRO", "ST MARCHE",
        "OBA HORTI", "SONDA", "GUANABARA", "ZONA SUL", "PREZUNIC", "SAVEGNAGO", "MUFFATO", "CONDOR",
        "ANGELONI", "BEMAIS", "MANAIRA SUPERMERCADO"]],
    *[(p, "Açougue", {}) for p in ["ACOUGUE", "CARNES", "NOBRE CARNES"]],
    *[(p, "Transporte", {}) for p in [
        "UBER", "UBERRIDES", "UBER TRIP", "99", "99 TAXI", "99APP", "99 POP", "99POP", "CABIFY", "POSTO", "SHELL", "IPIRANGA", "PETROBRAS",
        "BR MANIA", "ESTACIONAMENTO", "ESTAPAR", "SEM PARAR", "CONECTCAR", "VELOE", "METRO",
        "BILHETE UNICO", "RIOCARD", "LATAM", "GOL LINHAS", "AZUL LINHAS", "DETRAN", "IPVA"]],
    *[(p, "Farmácia", {}) for p in [
        "DROGASIL", "DROGA RAIA", "RAIA", "PAGUE MENOS", "DROGARIA", "FARMACIA", "PANVEL", "REDEPHARMA",
        "EXTRA FARMA", "DROGAL"]],
    *[(p, "Saúde", {}) for p in [
        "UNIMED", "HAPVIDA", "AMIL", "SULAMERICA SAUDE", "BRADESCO SAUDE", "LABORATORIO",
        "CLINICA", "HOSPITAL", "ODONTO", "DENTAL", "FLEURY", "DASA", "DR INTER"]],
    *[(p, "Assinaturas", {}) for p in [
        "NETFLIX", "SPOTIFY", "DISNEY", "PRIME VIDEO", "AMAZON PRIME", "AMAZONPRIME", "AMAZONPRIMEBR", "HBO", "MAX ",
        "GLOBOPLAY", "DEEZER", "YOUTUBE PREMIUM", "YOUTUBEPREMIUM", "APPLE COM BILL", "APPLE COM",
        "GOOGLE ONE", "GOOGLE STORAGE", "ICLOUD", "CANVA", "CHATGPT", "OPENAI", "ANTHROPIC",
        "CLAUDE AI", "PARAMOUNT", "CRUNCHYROLL", "MICROSOFT", "ADOBE", "DROPBOX"]],
    *[(p, "Academia", {}) for p in ["SMARTFIT", "SMART FIT", "BLUEFIT", "TOTALPASS", "WELLHUB", "GYMPASS",
                                    "ACADEMIA"]],
    *[(p, "Energia", {}) for p in ["ENEL", "CEMIG", "LIGHT SA", "COPEL", "CELESC", "CPFL", "COELBA", "NEOENERGIA",
                                   "EQUATORIAL", "ENERGISA"]],
    *[(p, "Internet Móvel", {}) for p in ["VIVO", "CLARO", "TIM", "TELEFONICA", "TELEFONICA BRAS"]],
    *[(p, "Internet Fixa", {}) for p in ["OI FIBRA", "NET SERVICOS", "SKY", "INTERNET", "NIO", "BRISANET"]],
    *[(p, "Contas da casa", {}) for p in ["SABESP", "CEDAE", "COPASA", "SANEPAR", "EMBASA", "CAGEPA", "COMGAS",
                                          "NATURGY", "ULTRAGAZ", "LIQUIGAS", "SUPERGASBRAS"]],
    *[(p, "Aluguel", {}) for p in ["ALUGUEL", "IMOBILIARIA", "QUINTOANDAR", "QUINTO ANDAR"]],
    *[(p, "Condomínio", {}) for p in ["CONDOMINIO"]],
    *[(p, "IPTU", {}) for p in ["IPTU"]],
    *[(p, "Extras", {}) for p in [
        "AMAZON", "AMAZON BR", "AMAZONMKTPLC", "AMAZONMKTCPI", "MERCADOLIVRE", "MERCADO LIVRE", "SHOPEE", "SHEIN", "ALIEXPRESS",
        "MAGAZINE LUIZA", "MAGALU", "CASAS BAHIA", "AMERICANAS", "KABUM", "FAST SHOP"]],
    *[(p, "Vestuário", {}) for p in ["RENNER", "RIACHUELO", "ZARA", "CENTAURO", "NETSHOES", "HERING", "HERINGOUTLET", "CA MODAS"]],
    *[(p, "Casa e manutenção", {}) for p in ["LEROY MERLIN", "TOK STOK", "FERREIRA COSTA"]],
    *[(p, "Educação", {}) for p in ["ESCOLA", "COLEGIO", "FACULDADE", "UNIVERSIDADE", "CURSO",
                                    "UDEMY", "ALURA", "HOTMART", "LIVRARIA"]],
    *[(p, "Lazer", {}) for p in ["CINEMA", "CINEMARK", "CINEPOLIS", "INGRESSO", "SYMPLA", "EVENTIM", "TEATRO",
                                 "STEAM", "PLAYSTATION", "XBOX"]],
    *[(p, "Viagem", {}) for p in ["AIRBNB", "BOOKING", "HOTEL", "HOSTEL", "WORLDPACKERS", "BLABLACAR"]],
    *[(p, "Beleza", {}) for p in ["SALAO", "BARBEARIA", "BOTICARIO", "NATURA", "SEPHORA", "MANICURE", "ESTETICA"]],
    *[(p, "Taxas", {}) for p in ["TARIFA", "IOF", "JUROS", "ENCARGOS", "MULTA", "ANUIDADE",
                                 "CESTA DE SERVICOS", "MORA"]],
    *[(p, "Impostos", {}) for p in ["DARF", "DAS SIMPLES", "PGDAS", "RECEITA FEDERAL", "GRU"]],
    *[(p, "Assinaturas", {"escopo": "negocio"}) for p in ["SHOPIFY"]],     # assinatura da loja
    # negócio (Rocco Kids): ferramentas e anúncios
    *[(p, "Negócios", {"escopo": "negocio"}) for p in [
        "FACEBK", "FACEBOOK", "META ADS", "META PLATFORMS", "GOOGLE ADS", "RUNWAY",
        "METRICOOL", "MELHOR ENVIO", "CORREIOS", "ROCCO KIDS", "ROCO KIDS", "YAMPI", "NUVEMSHOP"]],
    # receitas
    *[(p, "Salário", {"sinal": "entrada"}) for p in ["SALARIO", "PAGTO SALARIO", "FOLHA DE PAGAMENTO",
                                                     "PROVENTOS", "VENCIMENTOS", "REMUNERACAO"]],
    *[(p, "Rendimentos", {"sinal": "entrada", "tipo": "investimento"}) for p in [
        "RENDIMENTO", "REND PAGO", "REMUNERACAO APLICACAO", "JUROS SOBRE CAPITAL"]],
    # aplicação automática do BB: o dinheiro vai e volta todo dia, não é renda nem gasto
    *[(p, "Investimentos e reserva", {"tipo": "investimento"}) for p in [
        "RENDE FACIL", "BB RENDE FACIL", "APLICACAO", "RESGATE", "CDB", "TESOURO DIRETO", "POUPANCA", "COFRINHO",
        "PORQUINHO", "CAIXINHA", "INVEST FACIL", "MEU PORQUINHO"]],
    *[(p, "Pagamento de fatura", {"tipo": "fatura"}) for p in [
        "PAGAMENTO FATURA", "PAGAMENTO DE FATURA", "PAG FATURA", "PAGTO FATURA", "PGTO FATURA",
        "PAG FAT", "FATURA CARTAO", "PAGAMENTO RECEBIDO", "PAGAMENTO ON LINE", "PAGAMENTO EFETUADO CARTAO",
        "PAGAMENTO CARTAO", "PAGAMENTO DO CARTAO", "DEBITO AUTOMATICO FATURA", "INTER FATURA",
        "PAGTO CARTAO CREDITO", "PGTO CARTAO CREDITO"]],
    # débito automático da fatura que o banco devolve no mesmo dia: anula o pagamento
    *[(p, "Transferência entre contas", {"tipo": "transferencia"}) for p in ["ESTORNO DE DEBITO"]],
    # Crédito do cartão ("Pix no crédito", "parcelar compra" do Inter): a entrada do crédito abate Dívidas e as
    # parcelas somam em Dívidas. Assim o gasto conta uma vez (o Pix ou a compra) e o que sobra são os juros.
    *[(p, "Dívidas", {"sinal": "entrada"}) for p in ["PIX NO CREDITO", "COMPRA PARCELADA INTER"]],
    *[(p, "Dívidas", {}) for p in ["CDC RENOVACAO", "NU PAGAMENTOS", "MERCADO PAGO", "MERCADO PAG",
                                   "PARCELAMENTO DE COMPRA", "PIX CRED A VISTA", "PIX CRED PARCELADO", "PIX CRED PARC",
                                   "PARC PARCELAMEN INTER"]],
]

ALERTAS_PADRAO = [
    ("parcelamento", "Compra parcelada",
     "Regra do casal: evitar parcelamento. Avisa na hora e mostra quanto da renda futura fica comprometida.", 1, {}),
    ("categoria_acima_media", "Categoria acima do orçado (ou da média)",
     "Gasto do mês numa categoria passou do orçado de vocês; sem orçado, da média dos 3 meses anteriores.", 1, {"fator": 1.3, "minimo": 10000}),
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
VERSAO_DADOS = 3


def migrar(con: sqlite3.Connection) -> None:
    """Atualiza bancos criados por versões anteriores, sem desfazer o que vocês editaram."""
    for tabela, novas in (("dividas", (("parcelas_total", "INTEGER"), ("data_inicio", "TEXT"),
                                       ("valor_emprestado", "INTEGER"))),
                          ("categorias", (("orcamento", "INTEGER"),)),
                          ("transacoes", (("estimado", "INTEGER NOT NULL DEFAULT 0"), ("produto", "TEXT"), ("competencia", "TEXT"),
                                          ("mes_ref", "TEXT"))),
                          ("previstos", (("ate", "TEXT"), ("no_plano", "INTEGER NOT NULL DEFAULT 1")))):
        cols = {r["name"] for r in con.execute(f"PRAGMA table_info({tabela})")}
        for c, tipo in novas:
            if c not in cols:
                con.execute(f"ALTER TABLE {tabela} ADD COLUMN {c} {tipo}")
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
    if versao < 3:
        for nome, tipo, cor, fixa, ordem in CATEGORIAS:
            con.execute("INSERT OR IGNORE INTO categorias (nome, tipo, cor, fixa, ordem) VALUES (?,?,?,?,?)",
                        (nome, tipo, cor, fixa, ordem))
        b, l, c = pessoa_id(con, "Bárbara"), pessoa_id(con, "Lucas"), pessoa_id(con, "Casal")
        for ap, nome, inst, tipo, tit, pasta, venc, fech, obs in CONTAS_DA_PLANILHA(b, l, c):
            con.execute("""INSERT OR IGNORE INTO contas (apelido, nome, instituicao, tipo, titular_id, pasta,
                           dia_vencimento, dia_fechamento, observacao) VALUES (?,?,?,?,?,?,?,?,?)""",
                        (ap, nome, inst, tipo, tit, pasta, venc, fech, obs))
        con.execute("UPDATE contas SET dia_vencimento = 20, dia_fechamento = 13 WHERE apelido = 'inter-cartao' "
                    "AND ((dia_vencimento = 10 AND dia_fechamento = 3) OR (dia_vencimento = 20 AND dia_fechamento = 12))")
        for padrao, cat, extra in REGRAS_SEMENTE:      # regras de fábrica novas (não mexe nas que vocês criaram)
            if not con.execute("SELECT 1 FROM regras WHERE padrao = ? AND origem = 'semente'", (padrao.strip(),)).fetchone():
                con.execute("INSERT INTO regras (padrao, categoria_id, escopo, tipo, sinal, origem, criado_em) "
                            "VALUES (?,?,?,?,?, 'semente', ?)",
                            (padrao.strip(), categoria_id(con, cat), extra.get("escopo"), extra.get("tipo"),
                             extra.get("sinal"), agora_iso()))
    for tipo, nome, desc, ativo, par in ALERTAS_PADRAO:
        con.execute("INSERT OR IGNORE INTO config_alertas (tipo, nome, descricao, ativo, parametros) "
                    "VALUES (?,?,?,?,?)", (tipo, nome, desc, ativo, json.dumps(par)))
    con.execute("CREATE INDEX IF NOT EXISTS ix_tx_mes_ref ON transacoes(mes_ref)")
    atualizar_mes_ref(con, so_vazios=True)
    con.execute("INSERT INTO config (chave, valor) VALUES ('versao_dados', ?) "
                "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (str(VERSAO_DADOS),))
    con.commit()


def CONTAS_DA_PLANILHA(b, l, c):
    """Meios de pagamento que a planilha antiga usa e que não estavam no cadastro inicial."""
    return [
        ("bb-cartao", "Banco do Brasil · Cartão", "Banco do Brasil", "cartao", l, "bb-cartao", 20, None,
         "Fatura debitada na conta BB. Aparece na planilha de vocês."),
        ("c6-cartao", "C6 · Cartão", "C6", "cartao", b, "c6-cartao", None, None, "Aparece na planilha de vocês (parcelas antigas)."),
        ("dinheiro", "Dinheiro", "Dinheiro", "corrente", c, None, None, None, "Gastos em espécie."),
    ]


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
        ("inter-cartao", "Inter · Cartão de crédito", "Inter", "cartao", b, "inter-cartao", 20, 13,
         "Titular Bárbara, adicional Lucas. Concentra as compras do casal. Vence dia 20, corte dia 13."),
        ("flash", "Flash Benefícios", "Flash", "beneficio", c, "flash", None, None,
         "Saldo de benefício: não é renda livre."),
        ("nubank", "Nubank · Cartão", "Nubank", "cartao", c, "nubank", None, None,
         "Débito pendente em negociação."),
        *CONTAS_DA_PLANILHA(b, l, c),
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


def mes_da_fatura(conta, data_iso: str) -> str:
    """Mês em que a compra é paga: no cartão, o da fatura (compra depois do fechamento vai para a seguinte)."""
    if conta["tipo"] != "cartao" or not conta["dia_vencimento"]:
        return data_iso[:7]
    y, m, d = int(data_iso[:4]), int(data_iso[5:7]), int(data_iso[8:10])
    fech, venc = conta["dia_fechamento"], conta["dia_vencimento"]
    if fech and d > fech:
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    if fech and venc < fech:
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return f"{y}-{m:02d}"


def atualizar_mes_ref(con, so_vazios: bool = False) -> None:
    """Regime de caixa, como a planilha de vocês: o cartão conta no mês em que a fatura é paga; o resto no mês
    da data, a não ser que vocês tenham escolhido outro (competência)."""
    contas = {r["id"]: r for r in con.execute("SELECT * FROM contas")}
    filtro = "WHERE mes_ref IS NULL" if so_vazios else ""
    novos = [(t["competencia"] or mes_da_fatura(contas[t["conta_id"]], t["data"]), t["id"])
             for t in con.execute(f"SELECT id, conta_id, data, competencia FROM transacoes {filtro}")]
    con.executemany("UPDATE transacoes SET mes_ref = ? WHERE id = ?", novos)
    con.commit()
