// Banco único do Cérebro (SQLite embutido no Node 22). Um arquivo: backup é copiar o arquivo.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

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
