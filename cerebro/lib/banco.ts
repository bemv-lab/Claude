// Extrato da conta PJ (arquivo OFX do banco): leitura, regras de classificação e efeito no DRE.
import {db} from './db';
import type {Lancamento} from './calc';

export type MovBanco = {conta: string; fitid: string; data: string; valor: number; tipo: string; nome: string; memo: string; categoria: string; regra: string};

/** Categorias do extrato. `dre` diz em qual conta do DRE a saída entra (null: não é despesa do resultado). */
export const CATEGORIAS_BANCO: Record<string, {nome: string; dre: string | null; ajuda: string}> = {
  recebimento_vendas: {nome: 'Repasse de vendas (Cartpanda)', dre: null, ajuda: 'A venda já entra pelos pedidos; aqui só se confere o repasse.'},
  fornecedor: {nome: 'Fornecedor (produto vendido)', dre: null, ajuda: 'O custo já entra pelo custo de cada produto; aqui se confere o que foi pago.'},
  estoque: {nome: 'Compra de estoque', dre: null, ajuda: 'Vira custo quando o produto é vendido.'},
  anuncios: {nome: 'Pagamento de anúncios', dre: null, ajuda: 'O gasto já entra pela Meta; aqui só se confere o pagamento.'},
  taxas_cartpanda: {nome: 'Taxas da Cartpanda (checkout)', dre: null, ajuda: 'Cobrança semanal dos 2,5% de checkout, paga pela Stripe. Já entra pelos pedidos.'},
  das: {nome: 'DAS (Simples Nacional)', dre: 'das', ajuda: 'Entra no DRE do mês anterior ao pagamento (competência).'},
  contador: {nome: 'Contabilidade e assessoria', dre: 'contador', ajuda: ''},
  assinaturas: {nome: 'Assinaturas e apps', dre: 'assinaturas', ajuda: ''},
  prolabore: {nome: 'Pró-labore', dre: 'pessoal', ajuda: 'Remuneração dos sócios com INSS: é despesa.'},
  retirada_socio: {nome: 'Retirada dos sócios (lucro)', dre: null, ajuda: 'Distribuição de lucro: sai do caixa, não do resultado.'},
  aporte_socio: {nome: 'Aporte dos sócios', dre: null, ajuda: 'Dinheiro dos sócios que entra na empresa.'},
  aplicacao: {nome: 'Aplicação e resgate', dre: null, ajuda: 'Dinheiro guardado: continua sendo da empresa.'},
  tarifas: {nome: 'Tarifas e juros', dre: 'financeiras', ajuda: ''},
  frete: {nome: 'Frete e envio', dre: 'frete', ajuda: ''},
  outras_despesas: {nome: 'Outras despesas', dre: 'outras_fixas', ajuda: ''},
  transferencia: {nome: 'Transferência entre contas', dre: null, ajuda: ''},
  a_classificar: {nome: 'A classificar', dre: null, ajuda: 'Escolha a categoria para o Cérebro saber o que é.'},
};

// Regras iniciais, tiradas do extrato do Inter de 28/09 a 26/10/2026 (a Stripe cobra as taxas semanais da Cartpanda: conferido). O primeiro padrão que aparecer no nome ou no memo vence.
export const REGRAS_INICIAIS: [string, string][] = [
  ['cartpanda', 'recebimento_vendas'],
  ['pix marketplace', 'fornecedor'],
  ['isabela kids', 'estoque'],
  ['simples nacional', 'das'],
  ['rrt assessoria', 'contador'],
  ['stripe', 'taxas_cartpanda'],
  ['ebanx', 'assinaturas'],
  ['ebury', 'assinaturas'],
  ['vindi', 'assinaturas'],
  ['facebook', 'anuncios'],
  ['meta platforms', 'anuncios'],
  ['cdb', 'aplicacao'],
  ['aplicacao', 'aplicacao'],
  ['resgate', 'aplicacao'],
  ['tarifa', 'tarifas'],
  ['barbara emanuelle', 'retirada_socio'],
  ['lucas vinicios', 'retirada_socio'],
];

/** Lê um OFX 1.x (SGML, como o do Inter) ou 2.x (XML). */
export function lerOfx(texto: string) {
  const campo = (b: string, k: string) => (b.match(new RegExp(`<${k}>([^<\\r\\n]*)`, 'i'))?.[1] ?? '').trim();
  const conta = campo(texto, 'BANKID') + '-' + campo(texto, 'ACCTID');
  const movs = [...texto.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map(([, b]) => {
    const d = campo(b, 'DTPOSTED');
    return {
      conta, fitid: campo(b, 'FITID'), data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      valor: parseFloat(campo(b, 'TRNAMT').replace(',', '.')) || 0, tipo: campo(b, 'TRNTYPE'),
      nome: campo(b, 'NAME'), memo: campo(b, 'MEMO'),
    };
  }).filter((m) => m.fitid && /^\d{4}-\d{2}-\d{2}$/.test(m.data));
  const saldo = parseFloat(campo(texto.split(/<LEDGERBAL>/i)[1] ?? '', 'BALAMT'));
  const dSaldo = campo(texto.split(/<LEDGERBAL>/i)[1] ?? '', 'DTASOF');
  return {conta, banco: campo(texto, 'ORG'), movs, saldo: isFinite(saldo) ? saldo : null, saldoEm: dSaldo ? `${dSaldo.slice(0, 4)}-${dSaldo.slice(4, 6)}-${dSaldo.slice(6, 8)}` : null};
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function classificar(m: {nome: string; memo: string}, regras: [string, string][]) {
  const alvo = norm(`${m.nome} ${m.memo}`);
  return regras.find(([p]) => alvo.includes(norm(p)))?.[1] ?? 'a_classificar';
}

export const lerRegras = () => (db().prepare('SELECT padrao, categoria FROM banco_regras ORDER BY prioridade, rowid').all() as {padrao: string; categoria: string}[]).map((r) => [r.padrao, r.categoria] as [string, string]);

/** Grava os movimentos (sem duplicar) e classifica os novos. Movimentos já classificados à mão não mudam. */
export function importarOfx(texto: string) {
  const o = lerOfx(texto);
  if (!o.movs.length) throw new Error('Não achei movimentos no arquivo. Exporte o extrato em OFX.');
  const regras = lerRegras();
  const d = db();
  const ins = d.prepare(`INSERT INTO banco (conta, fitid, data, valor, tipo, nome, memo, categoria, regra) VALUES (?,?,?,?,?,?,?,?, 'auto')
    ON CONFLICT(conta, fitid) DO UPDATE SET data = excluded.data, valor = excluded.valor, nome = excluded.nome, memo = excluded.memo,
    categoria = CASE WHEN banco.regra = 'manual' THEN banco.categoria ELSE excluded.categoria END`);
  d.exec('BEGIN');
  try {
    for (const m of o.movs) ins.run(m.conta, m.fitid, m.data, m.valor, m.tipo, m.nome, m.memo, classificar(m, regras));
    if (o.saldo !== null) d.prepare("INSERT INTO estado (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
      .run(`banco_saldo:${o.conta}`, JSON.stringify({saldo: o.saldo, em: o.saldoEm, banco: o.banco}));
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return {n: o.movs.length, conta: o.conta, de: o.movs.reduce((a, m) => (m.data < a ? m.data : a), '9999'), ate: o.movs.reduce((a, m) => (m.data > a ? m.data : a), '0000')};
}

/** Reaplica as regras aos movimentos não classificados à mão (depois de criar uma regra nova). */
export function reclassificar() {
  const regras = lerRegras();
  const d = db();
  const up = d.prepare("UPDATE banco SET categoria = ? WHERE conta = ? AND fitid = ? AND regra <> 'manual'");
  for (const m of d.prepare("SELECT conta, fitid, nome, memo FROM banco WHERE regra <> 'manual'").all() as MovBanco[]) up.run(classificar(m, regras), m.conta, m.fitid);
}

const ultimoDiaMesAnterior = (data: string) => {
  const [a, m] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
};

/**
 * Saídas do banco que são despesa do resultado viram lançamentos (virtuais) para o DRE.
 * Estorno (Pix devolvido) tem a mesma categoria com sinal contrário e desconta sozinho.
 * DAS vai para o mês anterior ao pagamento (competência).
 */
export function lancamentosDoBanco(movs: MovBanco[]): Lancamento[] {
  return movs.flatMap((m, i) => {
    const c = CATEGORIAS_BANCO[m.categoria]?.dre;
    if (!c) return [];
    const data = m.categoria === 'das' ? ultimoDiaMesAnterior(m.data) : m.data;
    return [{id: -(i + 1), data, categoria: c, descricao: `${m.nome} (extrato)`, valor_centavos: Math.round(-m.valor * 100), pedidos: 0, origem: 'banco', pago: 1, recorrente: 0}];
  });
}

/** Resumo de caixa do período por categoria. */
export function fluxoCaixa(movs: MovBanco[]) {
  const por = new Map<string, {entra: number; sai: number; n: number}>();
  for (const m of movs) {
    const x = por.get(m.categoria) ?? {entra: 0, sai: 0, n: 0};
    if (m.valor >= 0) x.entra += m.valor; else x.sai -= m.valor;
    x.n++;
    por.set(m.categoria, x);
  }
  const entradas = movs.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const saidas = -movs.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0);
  return {entradas, saidas, resultado: entradas - saidas, porCategoria: [...por.entries()].map(([k, v]) => ({k, ...v, liquido: v.entra - v.sai})).sort((a, b) => a.liquido - b.liquido)};
}
