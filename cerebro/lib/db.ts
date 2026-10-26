// Banco único do Cérebro (SQLite embutido no Node 22). Um arquivo: backup é copiar o arquivo.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {REGRAS_INICIAIS, reclassificar} from './banco';

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
  if (versao < 4) migrarV4(d);
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
  // Tabela antiga de taxas (v2). Desde a v4 as taxas são calculadas a partir de prazo, juros por parcela e "sem juros até",
  // e esta tabela não é mais lida. Fica só para não quebrar bancos já criados.
  const t = d.prepare('INSERT OR IGNORE INTO taxas_gateway (forma, parcelas, pct, fixo) VALUES (?, ?, ?, ?)');
  t.run('pix', 1, 0.99, 0);
  t.run('boleto', 1, 0, 3.5);
  for (let p = 1; p <= 12; p++) t.run('cartao', p, 5.99, 0);
  const mem = d.prepare("INSERT INTO memoria (area, texto, autor) VALUES ('financeiro', ?, 'Claude')");
  for (const texto of [
    'Conferência com o Único Drop (26/10/2026): o Cérebro reproduz a receita de outubro (R$ 24.603,15: cartão 9.196,74, Pix 15.166,51, boleto 239,90), o checkout 2,5% (R$ 615,08), a conversão do Pix dia a dia e o lucro de 26/10 (R$ 7,71) quando usa as mesmas configurações.',
    'No Único Drop, "Imposto % sobre faturamento" e "Imposto sobre Facebook/Meta Ads" estão em 0%: o lucro de lá não desconta DAS nem o imposto da Meta (13,83%). Em outubro isso infla o lucro em ~R$ 1.500.',
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

// Juros de parcelamento do Cartpanda Pay (central de ajuda, atualizado em 30/09/2026), de 2x a 12x.
// O cliente paga esses juros; a loja só paga quando escolhe "parcelas sem juros".
export const JUROS_OFICIAIS = [7.24, 9.34, 11.16, 12.61, 14.11, 15.61, 17.49, 19.38, 20.77, 22.72, 24.68];

// Custos por produto, copiados da tela Produtos do Único Drop em 26/10/2026: [nome, custo em R$, custo em US$].
// Aplicados por nome (e só quando o produto ainda está sem custo), porque os nomes da loja variam menos que os códigos lidos de print.
export const CUSTOS_INICIAIS: [string, number, number][] = [
  ['Livro Sensorial Fazenda', 90.99, 0],
  ['Kit Semana Rocco - 5 Conjuntos Infantis', 60, 0],
  ['Livro de Tecido', 43.54, 0],
  ['Caixa de Descobertas', 114.23, 0],
  ['Blocos Matemáticos', 78, 0],
  ['Memória das Cores', 0, 14.2],
  ['Chocalho de Rattan', 0, 7.3],
  ['Meu Livro de Descobertas', 0, 21.36],
  ['Batalha das Formas', 0, 12.51],
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function aplicarCustosIniciais(d: DatabaseSync) {
  const prods = d.prepare('SELECT id, nome, custo, custo_usd FROM produtos').all() as {id: number; nome: string; custo: number; custo_usd: number}[];
  const up = d.prepare('UPDATE produtos SET custo = ?, custo_usd = ?, exemplo = 0 WHERE id = ?');
  for (const p of prods) {
    if (p.custo > 0 || p.custo_usd > 0) continue;
    const n = semAcento(p.nome);
    const s = CUSTOS_INICIAIS.find(([nome]) => { const k = semAcento(nome); return n === k || n.startsWith(`${k} - `); });
    if (s) up.run(s[1], s[2], p.id);
  }
}

// v4: taxas oficiais da Cartpanda Pay, custos dos produtos (inclui dólar), cartões e conciliação de compras.
function migrarV4(d: DatabaseSync) {
  d.exec(`
  BEGIN;
  ALTER TABLE banco ADD COLUMN pedido_numero TEXT NOT NULL DEFAULT '';
  ALTER TABLE banco ADD COLUMN produto_ext TEXT NOT NULL DEFAULT '';
  ALTER TABLE banco ADD COLUMN obs TEXT NOT NULL DEFAULT '';
  ALTER TABLE produtos ADD COLUMN custo_usd REAL NOT NULL DEFAULT 0;
  CREATE TABLE IF NOT EXISTS cartao_prazos (dias INTEGER PRIMARY KEY, pct REAL NOT NULL);
  CREATE TABLE IF NOT EXISTS juros_parcela (parcelas INTEGER PRIMARY KEY, pct REAL NOT NULL);
  INSERT OR IGNORE INTO config (chave, valor) VALUES
    ('pix_pct', 0.99), ('boleto_fixo', 3.5), ('prazo_cartao', 2), ('parcelas_sem_juros', 6), ('taxa_repasse', 4.9),
    ('cotacao_dolar', 0), ('custo_capital_mensal', 1.2), ('rbt12', 0),
    ('cartao_pj_limite', 800), ('cartao_pj_fechamento', 3), ('cartao_pj_vencimento', 10);
  UPDATE config SET valor = 0 WHERE chave = 'gateway_exemplo';
  DELETE FROM produtos WHERE exemplo = 1 AND shopify_id IS NULL;
  PRAGMA user_version = 4;
  COMMIT;
  `);
  const prazo = d.prepare('INSERT OR IGNORE INTO cartao_prazos (dias, pct) VALUES (?, ?)');
  for (const [dias, pct] of [[2, 5.99], [5, 5.49], [14, 4.99]]) prazo.run(dias, pct);
  const juros = d.prepare('INSERT OR IGNORE INTO juros_parcela (parcelas, pct) VALUES (?, ?)');
  JUROS_OFICIAIS.forEach((pct, i) => juros.run(i + 2, pct));
  aplicarCustosIniciais(d);

  // Regras do extrato: troca as automáticas da v3 pelas novas e reclassifica o que não foi corrigido à mão.
  d.prepare('DELETE FROM banco_regras WHERE prioridade >= 100').run();
  const regra = d.prepare('INSERT OR REPLACE INTO banco_regras (padrao, categoria, prioridade) VALUES (?, ?, ?)');
  REGRAS_INICIAIS.forEach(([p, c], i) => regra.run(p, c, 100 + i));
  reclassificar(d);

  // Memória: tira os registros automáticos que a Bárbara corrigiu e grava os corretos.
  d.prepare("DELETE FROM memoria WHERE autor = 'Claude' AND (texto LIKE '%0,35%' OR texto LIKE 'Extrato Inter PJ%')").run();
  const mem = d.prepare("INSERT INTO memoria (area, texto, autor) VALUES ('financeiro', ?, 'Claude')");
  mem.run('Taxas do Cartpanda Pay (central de ajuda de 30/09/2026 e extrato de pagamento de 26/10): cartão D+2 5,99%, D+5 5,49%, D+14 4,99%; Pix 0,99%; boleto R$ 3,50; reserva de 5% por 90 dias. Juros por parcela (pagos pelo cliente, ou pela loja quando oferece sem juros): 2x 7,24%, 3x 9,34%, 4x 11,16%, 5x 12,61%, 6x 14,11%, 7x 15,61%, 8x 17,49%, 9x 19,38%, 10x 20,77%, 11x 22,72%, 12x 24,68%. A loja aceita até 12x e assume os juros até 6x (decisão da Bárbara). NÃO existe taxa fixa por pedido: as taxas dos 13 pedidos do pagamento de 26/10 somam exatamente R$ 215,37 só com esses percentuais. Há uma "Taxa de processamento" de R$ 4,90 por repasse (a confirmar se cobra todo repasse).');
  mem.run('Conta PJ (Inter), esclarecimentos da Bárbara em 26/10/2026: o DAS de R$ 829,47 são guias do MEI não pagas desde fevereiro (regularização, não é o DAS do mês); o pagamento de R$ 1.499,00 ao escritório RRT é o enquadramento de MEI para ME (pontual); a empresa está migrando de MEI para ME. Os R$ 1.620,56 enviados à Bárbara cobrem despesas da empresa pagas no cartão pessoal (Meta Ads, Shopify e outras): é reembolso, não salário nem lucro. "Maree" é ShopeePay (compras de fornecedor na Shopee); "Pix Marketplace" são compras no Mercado Livre. Os R$ 800 em CDB são a garantia do limite do cartão PJ do Inter (limite R$ 800; fatura de novembro aberta de R$ 762,78, vence 10/11, fecha dia 3).');
  mem.run('Meta Ads: a conta é paga no cartão pessoal da Bárbara (a ideia é passar para o cartão PJ). Faturas de outubro: 13/10 R$ 1.313,73 pago; 26/10 R$ 3.418,12 pago (duas tentativas de R$ 3.415,30 falharam no mesmo dia); saldo devedor de R$ 79,74. Confirmado: R$ 3.000 de gasto viram R$ 3.415,30 na fatura (+13,84%, o imposto repassado pela Meta). Para pagar no cartão PJ o limite precisa cobrir cada cobrança de ~R$ 3,4 mil; hoje é R$ 800, garantido por CDB.');
  mem.run('Em aberto com a Bárbara: boleto do Mercado Pago de R$ 65,09 (14/10, e há uma compra de R$ 65,09 no cartão PJ no mesmo dia: pode ser pagamento em duplicidade) para vincular a um pedido ou produto; o que são Ebanx, Ebury e Vindi (R$ 719,22 em 28 dias); cotação do dólar usada no Único Drop para os produtos com custo em US$; custo dos produtos que ainda estão em branco; efeito retroativo da saída do MEI (limite de faturamento) com o RRT.');
}
