// Banco único do Cérebro (SQLite embutido no Node 22). Um arquivo: backup é copiar o arquivo.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {REGRAS_INICIAIS} from './banco';

const g = globalThis as unknown as {__cerebroDb?: DatabaseSync};

export function caminhoDb() {
  return resolve(process.env.CEREBRO_DB || resolve(process.cwd(), 'data/cerebro.db'));
}

export function db(): DatabaseSync {
  if (g.__cerebroDb) return g.__cerebroDb;
  const arq = caminhoDb();
  mkdirSync(dirname(arq), {recursive: true});
  const d = new DatabaseSync(arq);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrar(d);
  g.__cerebroDb = d;
  return d;
}

function migrar(d: DatabaseSync) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor REAL NOT NULL);
  CREATE TABLE IF NOT EXISTS formas_pagamento (
    id INTEGER PRIMARY KEY, nome TEXT NOT NULL, taxa_pct REAL NOT NULL DEFAULT 0, mix_pct REAL NOT NULL DEFAULT 0, ordem INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY, nome TEXT NOT NULL, preco REAL NOT NULL DEFAULT 0, custo REAL NOT NULL DEFAULT 0,
    frete REAL NOT NULL DEFAULT 0, embalagem REAL NOT NULL DEFAULT 0, outros REAL NOT NULL DEFAULT 0,
    cpa_alvo REAL NOT NULL DEFAULT 0, exemplo INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS lancamentos (
    id INTEGER PRIMARY KEY, data TEXT NOT NULL, categoria TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '',
    valor_centavos INTEGER NOT NULL, pedidos INTEGER NOT NULL DEFAULT 0, origem TEXT NOT NULL DEFAULT 'manual',
    vinculo INTEGER REFERENCES lancamentos(id) ON DELETE CASCADE,
    criado_por TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS lanc_data ON lancamentos(data);
  CREATE TABLE IF NOT EXISTS planos (
    id INTEGER PRIMARY KEY, servico TEXT NOT NULL, plano TEXT NOT NULL DEFAULT '', custo_mensal REAL NOT NULL DEFAULT 0,
    taxa_pct REAL NOT NULL DEFAULT 0, gatilho_pedidos INTEGER NOT NULL DEFAULT 0, proximo TEXT NOT NULL DEFAULT '', obs TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS importacoes (
    id INTEGER PRIMARY KEY, arquivo TEXT, periodo TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS anuncios (
    id INTEGER PRIMARY KEY, importacao INTEGER NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    campanha TEXT, conjunto TEXT, anuncio TEXT NOT NULL, gasto REAL NOT NULL DEFAULT 0, compras INTEGER NOT NULL DEFAULT 0,
    receita REAL NOT NULL DEFAULT 0, impressoes INTEGER NOT NULL DEFAULT 0, cliques INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS memoria (
    id INTEGER PRIMARY KEY, criado_em TEXT NOT NULL DEFAULT (datetime('now')), area TEXT NOT NULL, texto TEXT NOT NULL, autor TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, nome TEXT NOT NULL, senha TEXT NOT NULL);
  `);
  const vazio = (d.prepare('SELECT count(*) n FROM config').get() as {n: number}).n === 0;
  if (vazio) semear(d);
  const versao = (d.prepare('PRAGMA user_version').get() as {user_version: number}).user_version;
  if (versao < 2) migrarV2(d);
  if (versao < 3) migrarV3(d);
}

// v3: extrato da conta PJ (OFX) com regras de classificação.
function migrarV3(d: DatabaseSync) {
  d.exec(`
  BEGIN;
  CREATE TABLE IF NOT EXISTS banco (
    conta TEXT NOT NULL, fitid TEXT NOT NULL, data TEXT NOT NULL, valor REAL NOT NULL, tipo TEXT NOT NULL DEFAULT '',
    nome TEXT NOT NULL DEFAULT '', memo TEXT NOT NULL DEFAULT '', categoria TEXT NOT NULL DEFAULT 'a_classificar',
    regra TEXT NOT NULL DEFAULT 'auto', importado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (conta, fitid));
  CREATE INDEX IF NOT EXISTS banco_data ON banco(data);
  CREATE TABLE IF NOT EXISTS banco_regras (padrao TEXT PRIMARY KEY, categoria TEXT NOT NULL, prioridade INTEGER NOT NULL DEFAULT 100);
  PRAGMA user_version = 3;
  COMMIT;
  `);
  const r = d.prepare('INSERT OR IGNORE INTO banco_regras (padrao, categoria, prioridade) VALUES (?, ?, ?)');
  REGRAS_INICIAIS.forEach(([p, c], i) => r.run(p, c, 100 + i));
  d.prepare("UPDATE planos SET plano = 'Light', custo_mensal = 4.99, taxa_pct = 2.5, gatilho_pedidos = 0, proximo = 'Starter (R$ 127 + 2%)', obs = 'Comparação automática por faturamento em Taxas e planos.' WHERE servico = 'Cartpanda' AND plano = 'preencher'").run();
  const mem = d.prepare("INSERT INTO memoria (area, texto, autor) VALUES ('financeiro', ?, 'Claude')");
  mem.run('Cartpanda (26/10/2026): plano Light (R$ 4,99/mês + 2,5% de checkout, cobrado toda semana pela Stripe; conferido com as vendas). Starter R$ 127 + 2%, Premium R$ 597 + 1%, Advanced R$ 1.649 + 0,5%. Starter compensa acima de R$ 24.402/mês; Premium acima de R$ 47.000/mês. Cartpanda Pay: parcelas sem juros até 6x (7x+ o cliente paga juros e a loja paga 5,99%).');
  mem.run(
    'Extrato Inter PJ (28/09 a 26/10/2026, saldo R$ 8.100,10): entradas da Cartpanda R$ 21.645,07; fornecedor "Pix Marketplace" 59 Pix (31 de R$ 90,99 = custo do Livro Fazenda); DAS R$ 829,47 pago em 26/10; contador RRT R$ 1.499; taxas semanais da Cartpanda pela Stripe; assinaturas por Ebanx, Ebury e Vindi; retiradas da Bárbara R$ 1.620,56; CDB R$ 800. Nenhum pagamento de anúncio da Meta sai desta conta. Em aberto: o que é a Maree (42 Pix, 17 devolvidos) e o boleto Mercado Pago de R$ 65,09.');
}

// v2: módulo financeiro no estilo Único Drop, calculado a partir dos pedidos e dos anúncios.
function migrarV2(d: DatabaseSync) {
  d.exec(`
  BEGIN;
  CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY, numero TEXT NOT NULL, origem TEXT NOT NULL DEFAULT 'shopify',
    criado_em TEXT NOT NULL, dia TEXT NOT NULL, hora INTEGER NOT NULL, pago_em TEXT, dia_pago TEXT,
    status TEXT NOT NULL, forma TEXT NOT NULL, parcelas INTEGER NOT NULL DEFAULT 1, bandeira TEXT NOT NULL DEFAULT '',
    total REAL NOT NULL, subtotal REAL NOT NULL DEFAULT 0, frete REAL NOT NULL DEFAULT 0, desconto REAL NOT NULL DEFAULT 0,
    reembolsado REAL NOT NULL DEFAULT 0, cupom TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '',
    cliente_id TEXT NOT NULL DEFAULT '', utm_source TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '', utm_content TEXT NOT NULL DEFAULT '', utm_term TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS pedidos_dia ON pedidos(dia);
  CREATE INDEX IF NOT EXISTS pedidos_dia_pago ON pedidos(dia_pago);
  CREATE TABLE IF NOT EXISTS pedido_itens (
    pedido_id TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE, produto_ext TEXT NOT NULL, nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL, preco REAL NOT NULL);
  CREATE INDEX IF NOT EXISTS itens_pedido ON pedido_itens(pedido_id);
  CREATE TABLE IF NOT EXISTS ads_dia (
    data TEXT NOT NULL, plataforma TEXT NOT NULL, anuncio_id TEXT NOT NULL, anuncio TEXT NOT NULL DEFAULT '',
    campanha_id TEXT NOT NULL DEFAULT '', campanha TEXT NOT NULL DEFAULT '', conjunto_id TEXT NOT NULL DEFAULT '', conjunto TEXT NOT NULL DEFAULT '',
    gasto REAL NOT NULL DEFAULT 0, impressoes INTEGER NOT NULL DEFAULT 0, cliques INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0, carrinho INTEGER NOT NULL DEFAULT 0, checkout INTEGER NOT NULL DEFAULT 0,
    compras INTEGER NOT NULL DEFAULT 0, valor_compras REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (data, plataforma, anuncio_id));
  CREATE TABLE IF NOT EXISTS taxas_gateway (
    forma TEXT NOT NULL, parcelas INTEGER NOT NULL, pct REAL NOT NULL DEFAULT 0, fixo REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (forma, parcelas));
  CREATE TABLE IF NOT EXISTS estado (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  ALTER TABLE produtos ADD COLUMN shopify_id TEXT;
  ALTER TABLE lancamentos ADD COLUMN pago INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE lancamentos ADD COLUMN recorrente INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE produtos ADD COLUMN imagem TEXT NOT NULL DEFAULT '';
  CREATE UNIQUE INDEX IF NOT EXISTS produtos_shopify ON produtos(shopify_id);
  INSERT OR IGNORE INTO config (chave, valor) VALUES ('meta_mes', 50000), ('gateway_exemplo', 1), ('reserva_pct', 5), ('reserva_dias', 90), ('prazo_cartao', 2), ('parcelas_sem_juros', 6);
  PRAGMA user_version = 2;
  COMMIT;
  `);
  // Taxas da Cartpanda Pay conferidas no extrato da Cartpanda (pagamento de 26/10/2026):
  // cartão = 5,99% + acréscimo da parcela (5x = 18,60%, 6x = 20,10%, como o Único Drop calcula), Pix 0,99%,
  // e R$ 0,35 de processamento por pedido (R$ 4,90 em 14 pedidos), que o Único Drop não conta.
  // 1x = 5,99% também conferido (pedido 52310804). A Cartpanda está com "parcelas sem juros: 6": de 7x a 12x o cliente
  // paga os juros e a loja paga só os 5,99% (como o Único Drop já fazia).
  const t = d.prepare('INSERT OR IGNORE INTO taxas_gateway (forma, parcelas, pct, fixo) VALUES (?, ?, ?, ?)');
  t.run('pix', 1, 0.99, 0.35);
  t.run('boleto', 1, 0, 3.85);
  const acrescimo = [0, 7.24, 9.34, 11.16, 12.61, 14.11, 0, 0, 0, 0, 0, 0];
  acrescimo.forEach((a, i) => t.run('cartao', i + 1, +(5.99 + a).toFixed(2), 0.35));
  const mem = d.prepare("INSERT INTO memoria (area, texto, autor) VALUES ('financeiro', ?, 'Claude')");
  for (const texto of [
    'Conferência com o Único Drop (26/10/2026): o Cérebro reproduz a receita de outubro (R$ 24.603,15: cartão 9.196,74, Pix 15.166,51, boleto 239,90), o checkout 2,5% (R$ 615,08), a conversão do Pix dia a dia e o lucro de 26/10 (R$ 7,71) quando usa as mesmas configurações.',
    'No Único Drop, "Imposto % sobre faturamento" e "Imposto sobre Facebook/Meta Ads" estão em 0%: o lucro de lá não desconta DAS nem o imposto da Meta (13,83%). Em outubro isso infla o lucro em ~R$ 1.500.',
    'Taxa do cartão conferida no extrato da Cartpanda (26/10): 5,99% + acréscimo da parcela, como o Único Drop faz (R$ 239,90 em 6x caiu R$ 191,68 = 20,10%; R$ 223,11 em 5x caiu R$ 181,61 = 18,60%). Pix 0,99%. Há R$ 0,35 de processamento por pedido que o Único Drop não conta. 1x = 5,99% conferido. Falta provar 7x a 12x (lá estão sem acréscimo).',
    'Reserva da Cartpanda: 5% de cada pedido pago fica retido por 90 dias (garantia). Pix libera no dia, cartão em D+2. Em 26/10 a reserva era R$ 1.294,46 e batia com 5% dos pedidos pagos. Conversão do Pix de outubro na Cartpanda: 86,15% (igual ao Cérebro; o Único Drop mostra 86,36%).',
    'Cartpanda serve para conferir as contas do Único Drop e dar ideias; a referência das telas do Cérebro continua sendo o Único Drop (pedido da Bárbara, 26/10).',
    'Antecipação na Cartpanda: 1,5% ao dia por dia antecipado (dia 1 × 1,5%, dia 2 × 3%...). Saque antecipado de R$ 930,76 custava R$ 16,39 em 26/10.',
    'Conta de anúncios a considerar: só a C01 - Lucas Oliveira (RK), id 735313220351102. As contas C01 a C05 da Gabrielle não tiveram gasto em outubro.',
  ]) mem.run(texto);
}

// Valores iniciais. Os de pagamento e produto são de exemplo e ficam marcados na tela até serem trocados.
function semear(d: DatabaseSync) {
  const cfg = d.prepare('INSERT INTO config (chave, valor) VALUES (?, ?)');
  for (const [k, v] of [['das_pct', 4], ['plataforma_pct', 2.5], ['meta_imposto_pct', 13.83], ['cpa_alvo_padrao', 55], ['taxas_exemplo', 1]] as const) cfg.run(k, v);
  const f = d.prepare('INSERT INTO formas_pagamento (nome, taxa_pct, mix_pct, ordem) VALUES (?, ?, ?, ?)');
  [['Pix', 0.99, 35], ['Cartão à vista', 4.99, 15], ['Cartão 2 a 6× sem juros', 9.5, 25], ['Cartão 7 a 10× sem juros', 14.5, 25], ['Boleto', 3.49, 0]].forEach(([n, t, m], i) => f.run(n, t, m, i));
  d.prepare('INSERT INTO produtos (nome, preco, custo, frete, embalagem, outros, cpa_alvo, exemplo) VALUES (?,?,?,?,?,?,?,1)').run('Pasta de Descobertas', 197, 58, 12, 6, 0, 55);
  const pl = d.prepare('INSERT INTO planos (servico, plano, custo_mensal, taxa_pct, gatilho_pedidos, proximo, obs) VALUES (?,?,?,?,?,?,?)');
  pl.run('Cartpanda', 'preencher', 0, 2.5, 300, 'preencher', 'Exemplo: troque pelo plano atual e o número de pedidos que justifica mudar.');
  d.prepare('INSERT INTO memoria (area, texto, autor) VALUES (?,?,?)').run('financeiro', 'Desde 01/01/2026 a Meta soma PIS/Cofins (9,25%) e ISS (2,9%) ao gasto: R$ 100 no Gerenciador viram R$ 113,83 na fatura (pós-pago). O Gerenciador mostra sem imposto. No Simples Nacional não há crédito: é custo. A linha de ~1% (CBS 0,9% + IBS 0,1%) é teste da reforma e não é cobrada em 2026 (confirmar com a fatura).', 'Claude');
  for (const t of [
    'Produto nunca passa pelo feltro nem por IA (CDC art. 37): só foto ou vídeo real.',
    'Toda comunicação fala com o adulto (Res. CONANDA 163). Linguagem calma, sem urgência e sem palavras proibidas do Manual de Linguagem.',
    'Nunca publicar nem agendar post sem aprovação explícita. Gasto só com o OK da Bárbara.',
  ]) d.prepare('INSERT INTO memoria (area, texto, autor) VALUES (?,?,?)').run('regra fixa', t, 'Bárbara');
}
