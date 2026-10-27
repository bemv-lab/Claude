// Extrato da conta PJ (OFX do banco) e movimentos de cartões: leitura, regras de classificação, efeito no DRE e conciliação.
import type {DatabaseSync} from 'node:sqlite';
import {db} from './db';
import {parseCsv} from './csv';
import {lerNumero, type Lancamento} from './calc';
import type {Pedido, Item} from './shopify';

export type MovBanco = {
  conta: string; fitid: string; data: string; valor: number; tipo: string; nome: string; memo: string; categoria: string; regra: string;
  pedido_numero: string; produto_ext: string; obs: string; quantidade: number;
};

/** Categorias do extrato. `dre` diz em qual conta do DRE a saída entra (null: não é despesa do resultado). */
export const CATEGORIAS_BANCO: Record<string, {nome: string; dre: string | null; ajuda: string}> = {
  recebimento_vendas: {nome: 'Repasse de vendas (Cartpanda)', dre: null, ajuda: 'A venda já entra pelos pedidos; aqui só se confere o repasse.'},
  fornecedor: {nome: 'Fornecedor (produto vendido)', dre: null, ajuda: 'Compras no Mercado Livre e na Shopee para atender os pedidos. O custo já entra pelo custo de cada produto; aqui se confere e se vincula ao pedido.'},
  estoque: {nome: 'Compra de estoque', dre: null, ajuda: 'Vira custo quando o produto é vendido.'},
  anuncios: {nome: 'Pagamento de anúncios (Meta)', dre: null, ajuda: 'O gasto já entra pela Meta; aqui só se confere o pagamento.'},
  taxas_cartpanda: {nome: 'Taxas da Cartpanda (checkout)', dre: null, ajuda: 'Cobrança semanal dos 2,5% de checkout, paga pela Stripe. Já entra pelos pedidos.'},
  das: {nome: 'DAS do Simples Nacional (ME)', dre: 'das', ajuda: 'Guia do mês: entra no DRE do mês anterior ao pagamento (competência).'},
  das_mei: {nome: 'DAS do MEI em atraso (regularização)', dre: 'regularizacao', ajuda: 'Guias de meses antigos. É despesa pontual: aparece à parte no DRE e não entra no lucro recorrente.'},
  enquadramento: {nome: 'Enquadramento e regularização (contador)', dre: 'regularizacao', ajuda: 'Despesa pontual da migração de MEI para ME.'},
  contador: {nome: 'Contabilidade mensal', dre: 'contador', ajuda: 'Honorário recorrente do escritório.'},
  assinaturas: {nome: 'Assinaturas e ferramentas', dre: 'assinaturas', ajuda: 'Despesa fixa mensal.'},
  prolabore: {nome: 'Pró-labore', dre: 'pessoal', ajuda: 'Remuneração dos sócios: é despesa.'},
  retirada_socio: {nome: 'Retirada de lucro dos sócios', dre: null, ajuda: 'Distribuição de lucro: sai do caixa, não do resultado.'},
  reembolso_socio: {nome: 'Reembolso ao sócio (despesas no cartão pessoal)', dre: null, ajuda: 'Devolve o que o sócio pagou pela empresa. A despesa já está na Meta, no Shopify etc.; aqui só baixa o que a empresa deve.'},
  aporte_socio: {nome: 'Aporte dos sócios', dre: null, ajuda: 'Dinheiro dos sócios que entra na empresa.'},
  aplicacao: {nome: 'Aplicação em CDB (garantia do cartão)', dre: null, ajuda: 'Dinheiro guardado como garantia do limite do cartão PJ: continua sendo da empresa, mas fica travado.'},
  pagamento_fatura: {nome: 'Pagamento de fatura do cartão PJ', dre: null, ajuda: 'As compras do cartão já foram lançadas uma a uma; aqui só sai o dinheiro.'},
  tarifas: {nome: 'Tarifas, IOF e juros', dre: 'financeiras', ajuda: ''},
  frete: {nome: 'Frete e envio', dre: 'frete', ajuda: ''},
  outras_despesas: {nome: 'Outras despesas', dre: 'outras_fixas', ajuda: ''},
  transferencia: {nome: 'Transferência entre contas', dre: null, ajuda: ''},
  a_identificar: {nome: 'Cobrança a identificar', dre: 'outras_fixas', ajuda: 'Entra como despesa até você dizer o que é (hoje: Vindi).'},
  a_classificar: {nome: 'A classificar', dre: null, ajuda: 'Escolha a categoria para o Cérebro saber o que é.'},
};

/** Contas além da conta bancária importada por OFX. */
export const CONTAS_MANUAIS: Record<string, string> = {
  'cartao-pj': 'Cartão PJ (Inter)',
  'cartao-pessoal': 'Cartão pessoal (Bárbara)',
};
export const nomeConta = (c: string) => CONTAS_MANUAIS[c] ?? 'Conta PJ';

// Regras iniciais, tiradas do extrato do Inter (28/09 a 26/10/2026) e da fatura do cartão PJ.
// O primeiro padrão que aparecer no nome ou no memo vence; as regras criadas à mão têm prioridade sobre estas.
export const REGRAS_INICIAIS: [string, string][] = [
  ['melimais', 'assinaturas'], // Meli+ (R$ 9,90/mês)
  ['nico dr', 'assinaturas'], // Único Drop aparece como "Htm *nico Dr"
  ['runway', 'assinaturas'],
  ['google', 'assinaturas'],
  ['iof', 'tarifas'],
  ['cartpanda', 'recebimento_vendas'],
  ['pix marketplace', 'fornecedor'], // compras no Mercado Livre
  ['maree', 'fornecedor'], // ShopeePay
  ['shopee', 'fornecedor'],
  ['mercadolivre', 'fornecedor'],
  ['mercado*mercado', 'fornecedor'],
  ['mercado pago', 'fornecedor'],
  ['isabela kids', 'estoque'],
  ['simples nacional', 'das_mei'], // enquanto a empresa é MEI com guias atrasadas; trocar para DAS quando virar ME
  ['rrt assessoria', 'enquadramento'],
  ['stripe', 'taxas_cartpanda'],
  ['ebanx', 'fornecedor'], // FFOrder (fornecedor da China)
  ['ebury', 'fornecedor'], // Wiio (fornecedor da China)
  ['vindi', 'a_identificar'],
  ['facebook', 'anuncios'],
  ['facebk', 'anuncios'],
  ['meta platforms', 'anuncios'],
  ['cdb', 'aplicacao'],
  ['aplicacao', 'aplicacao'],
  ['resgate', 'aplicacao'],
  ['tarifa', 'tarifas'],
  ['barbara emanuelle', 'reembolso_socio'],
  ['lucas vinicios', 'transferencia'],
  ['fatura', 'pagamento_fatura'],
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lê um OFX 1.x (SGML, como o do Inter) ou 2.x (XML), de conta corrente ou de cartão. */
export function lerOfx(texto: string) {
  const campo = (b: string, k: string) => (b.match(new RegExp(`<${k}>([^<\\r\\n]*)`, 'i'))?.[1] ?? '').trim();
  const conta = `${campo(texto, 'BANKID') || 'cartao'}-${campo(texto, 'ACCTID')}`;
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

export function classificar(m: {nome: string; memo: string}, regras: [string, string][]) {
  const alvo = norm(`${m.nome} ${m.memo}`);
  return regras.find(([p]) => alvo.includes(norm(p)))?.[1] ?? 'a_classificar';
}

export const lerRegras = (d: DatabaseSync = db()) =>
  (d.prepare('SELECT padrao, categoria FROM banco_regras ORDER BY prioridade, rowid').all() as {padrao: string; categoria: string}[]).map((r) => [r.padrao, r.categoria] as [string, string]);

const SQL_INSERIR = `INSERT INTO banco (conta, fitid, data, valor, tipo, nome, memo, categoria, regra, pedido_numero) VALUES (?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(conta, fitid) DO UPDATE SET data = excluded.data, valor = excluded.valor, nome = excluded.nome, memo = excluded.memo,
  categoria = CASE WHEN banco.regra = 'manual' THEN banco.categoria ELSE excluded.categoria END,
  regra = CASE WHEN banco.regra = 'manual' THEN 'manual' ELSE excluded.regra END`;

/** Grava os movimentos de um OFX (sem duplicar) e classifica os novos. O que foi classificado à mão não muda. */
export function importarOfx(texto: string) {
  const o = lerOfx(texto);
  if (!o.movs.length) throw new Error('Não achei movimentos no arquivo. Exporte o extrato em OFX.');
  const regras = lerRegras();
  const d = db();
  const ins = d.prepare(SQL_INSERIR);
  d.exec('BEGIN');
  try {
    for (const m of o.movs) ins.run(m.conta, m.fitid, m.data, m.valor, m.tipo, m.nome, m.memo, classificar(m, regras), 'auto', '');
    if (o.saldo !== null) d.prepare('INSERT INTO estado (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run(`banco_saldo:${o.conta}`, JSON.stringify({saldo: o.saldo, em: o.saldoEm, banco: o.banco}));
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return {n: o.movs.length, conta: o.conta, de: o.movs.reduce((a, m) => (m.data < a ? m.data : a), '9999'), ate: o.movs.reduce((a, m) => (m.data > a ? m.data : a), '0000')};
}

const dataIso = (s: string) => {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const numeroPedido = (s: string) => s.replace(/\D/g, '');

/**
 * Lê um CSV de movimentos de cartões e outras contas.
 * Colunas: conta (cartao-pj, cartao-pessoal ou meta), data, descricao, valor (negativo = gasto), e opcionais categoria e pedido.
 */
export function lerCsvMovimentos(texto: string) {
  const linhas = parseCsv(texto);
  if (linhas.length < 2) throw new Error('O arquivo não tem linhas de dados.');
  const cab = linhas[0].map((h) => norm(h).trim());
  const col = (n: string) => cab.indexOf(n);
  const [iConta, iData, iDesc, iValor, iCat, iPedido] = ['conta', 'data', 'descricao', 'valor', 'categoria', 'pedido'].map(col);
  if ([iConta, iData, iDesc, iValor].some((i) => i < 0)) throw new Error('O CSV precisa das colunas conta, data, descricao e valor (e, se quiser, categoria e pedido).');
  const vistos = new Map<string, number>();
  return linhas.slice(1).filter((l) => (l[iDesc] ?? '').trim()).map((l, n) => {
    const conta = (l[iConta] ?? '').trim().toLowerCase();
    if (!CONTAS_MANUAIS[conta]) throw new Error(`Linha ${n + 2}: conta "${conta}" desconhecida. Use ${Object.keys(CONTAS_MANUAIS).join(', ')}.`);
    const data = dataIso(l[iData] ?? '');
    if (!data) throw new Error(`Linha ${n + 2}: data inválida (use AAAA-MM-DD ou DD/MM/AAAA).`);
    const valor = lerNumero(l[iValor]);
    if (!valor) throw new Error(`Linha ${n + 2}: valor vazio ou zero.`);
    const descricao = (l[iDesc] ?? '').trim();
    const chave = `csv|${conta}|${data}|${valor.toFixed(2)}|${descricao}`;
    const k = (vistos.get(chave) ?? 0) + 1;
    vistos.set(chave, k);
    const categoria = iCat >= 0 ? (l[iCat] ?? '').trim() : '';
    return {conta, fitid: `${chave}|${k}`, data, valor, descricao, categoria: categoria in CATEGORIAS_BANCO ? categoria : '', pedido: iPedido >= 0 ? numeroPedido(l[iPedido] ?? '') : ''};
  });
}

export function importarCsv(texto: string) {
  const movs = lerCsvMovimentos(texto);
  if (!movs.length) throw new Error('Nenhuma linha com descrição.');
  const regras = lerRegras();
  const d = db();
  const ins = d.prepare(SQL_INSERIR);
  d.exec('BEGIN');
  try {
    for (const m of movs) ins.run(m.conta, m.fitid, m.data, m.valor, 'CSV', m.descricao, '', m.categoria || classificar({nome: m.descricao, memo: ''}, regras), m.categoria ? 'manual' : 'auto', m.pedido);
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return {n: movs.length, contas: [...new Set(movs.map((m) => nomeConta(m.conta)))], de: movs.reduce((a, m) => (m.data < a ? m.data : a), '9999'), ate: movs.reduce((a, m) => (m.data > a ? m.data : a), '0000')};
}

/** Lançamento avulso (compra no cartão, fatura da Meta) feito na tela. O valor entra positivo e vira saída. */
export function adicionarMovimento(m: {conta: string; data: string; descricao: string; valor: number; categoria?: string; pedido?: string}) {
  const regras = lerRegras();
  const categoria = m.categoria && m.categoria in CATEGORIAS_BANCO ? m.categoria : classificar({nome: m.descricao, memo: ''}, regras);
  db().prepare(SQL_INSERIR).run(m.conta, `manual|${Date.now()}|${Math.random().toString(36).slice(2, 8)}`, m.data, -Math.abs(m.valor), 'MANUAL', m.descricao, '', categoria, m.categoria ? 'manual' : 'auto', numeroPedido(m.pedido ?? ''));
}

/** Reaplica as regras aos movimentos não classificados à mão (depois de criar uma regra nova). */
export function reclassificar(d: DatabaseSync = db()) {
  const regras = lerRegras(d);
  const up = d.prepare("UPDATE banco SET categoria = ? WHERE conta = ? AND fitid = ? AND regra <> 'manual'");
  for (const m of d.prepare("SELECT conta, fitid, nome, memo FROM banco WHERE regra <> 'manual'").all() as unknown as MovBanco[]) up.run(classificar(m, regras), m.conta, m.fitid);
}

const ultimoDiaMesAnterior = (data: string) => {
  const [a, m] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
};

/**
 * Saídas do banco que são despesa do resultado viram lançamentos (virtuais) para o DRE.
 * Estorno (Pix devolvido) tem a mesma categoria com sinal contrário e desconta sozinho.
 * O DAS do mês vai para o mês anterior ao pagamento (competência); regularizações ficam na data do pagamento.
 */
export function lancamentosDoBanco(movs: MovBanco[]): Lancamento[] {
  return movs.flatMap((m, i) => {
    const c = CATEGORIAS_BANCO[m.categoria]?.dre;
    if (!c) return [];
    const data = m.categoria === 'das' ? ultimoDiaMesAnterior(m.data) : m.data;
    return [{id: -(i + 1), data, categoria: c, descricao: `${m.nome} (${nomeConta(m.conta).toLowerCase()})`, valor_centavos: Math.round(-m.valor * 100), pedidos: 0, origem: 'banco', pago: 1, recorrente: 0}];
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

// ---------- Cartão PJ ----------

const pad = (n: number) => String(n).padStart(2, '0');
const somaDias = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

/** Fatura aberta do cartão PJ: compras do ciclo atual, vencimento e limite disponível. */
export function faturaCartao(movs: MovBanco[], hoje: string, c: {fechamento: number; vencimento: number; limite: number}) {
  const [a, m, di] = hoje.split('-').map(Number);
  let fa = a, fm = m;
  if (di > c.fechamento) { fm++; if (fm > 12) { fm = 1; fa++; } }
  const fecha = `${fa}-${pad(fm)}-${pad(c.fechamento)}`;
  let pa = fa, pm = fm - 1;
  if (pm < 1) { pm = 12; pa--; }
  const inicio = somaDias(`${pa}-${pad(pm)}-${pad(c.fechamento)}`, 1);
  let va = fa, vm = fm;
  if (c.vencimento <= c.fechamento) { vm++; if (vm > 12) { vm = 1; va++; } }
  const itens = movs.filter((x) => x.conta === 'cartao-pj' && x.data >= inicio && x.data <= fecha).sort((x, y) => y.data.localeCompare(x.data));
  const total = -itens.reduce((s, x) => s + x.valor, 0);
  return {inicio, fecha, vencimento: `${va}-${pad(vm)}-${pad(c.vencimento)}`, total, disponivel: Math.max(0, c.limite - total), limite: c.limite, itens};
}

/** O que a empresa deve ao sócio: despesas pagas no cartão pessoal menos o que já foi reembolsado pela conta PJ. */
export function saldoSocio(movs: MovBanco[]) {
  const pago = -movs.filter((m) => m.conta === 'cartao-pessoal').reduce((s, m) => s + m.valor, 0);
  const reembolsado = -movs.filter((m) => m.categoria === 'reembolso_socio').reduce((s, m) => s + m.valor, 0);
  return {pago, reembolsado, aReembolsar: pago - reembolsado};
}

// ---------- Custo médio pelos pagamentos a fornecedor ----------

export type CustoMedio = {produto: string; custo: number; unidades: number; valor: number; compras: number};

/**
 * Custo unitário de cada produto = tudo o que foi pago ao fornecedor por ele ÷ unidades compradas.
 * Cada pagamento (conta, cartão ou boleto) precisa estar vinculado a um produto (com quantidade) ou a um pedido da Shopify.
 * Pedido com vários produtos: o valor se divide pelo custo de referência de cada um (ou por unidade, se ainda não há referência).
 * Devolução (valor positivo na categoria de fornecedor) abate o valor e as unidades do mesmo vínculo.
 */
export function custosMedios(movs: MovBanco[], pedidos: {id: string; numero: string}[], itens: Item[], referencia = new Map<string, number>()) {
  const porNumero = new Map(pedidos.map((p) => [numeroPedido(p.numero), p.id] as const));
  const itensPor = new Map<string, Item[]>();
  for (const i of itens) itensPor.set(i.pedido_id, [...(itensPor.get(i.pedido_id) ?? []), i]);
  const acc = new Map<string, {valor: number; unidades: number; compras: number}>();
  const soma = (produto: string, valor: number, unidades: number) => {
    const x = acc.get(produto) ?? {valor: 0, unidades: 0, compras: 0};
    x.valor += valor; x.unidades += unidades; x.compras++;
    acc.set(produto, x);
  };
  let semVinculo = 0, valorSemVinculo = 0, pedidoNaoEncontrado = 0;
  for (const m of movs) {
    if (m.categoria !== 'fornecedor' && m.categoria !== 'estoque') continue;
    const valor = -m.valor; // saída positiva, devolução negativa
    const sinal = valor < 0 ? -1 : 1;
    if (m.produto_ext) { soma(m.produto_ext, valor, sinal * Math.max(1, m.quantidade)); continue; }
    if (m.pedido_numero) {
      const its = itensPor.get(porNumero.get(m.pedido_numero) ?? '') ?? [];
      if (!its.length) { pedidoNaoEncontrado++; semVinculo++; valorSemVinculo += valor; continue; }
      const peso = (i: Item) => (referencia.get(i.produto_ext) ?? 1) * i.quantidade;
      const total = its.reduce((s, i) => s + peso(i), 0);
      for (const i of its) soma(i.produto_ext, (valor * peso(i)) / total, sinal * i.quantidade);
      continue;
    }
    semVinculo++; valorSemVinculo += valor;
  }
  const medios = new Map<string, CustoMedio>();
  for (const [produto, x] of acc) if (x.unidades > 0 && x.valor > 0) medios.set(produto, {produto, custo: x.valor / x.unidades, ...x});
  return {medios, semVinculo, valorSemVinculo, pedidoNaoEncontrado};
}

/**
 * Pagamentos de fornecedor sem vínculo que têm exatamente o mesmo valor (2 ou mais): provavelmente o mesmo produto comprado várias vezes.
 * Basta escolher o produto uma vez para vincular o grupo todo.
 */
export function gruposDeValorRepetido(movs: MovBanco[]) {
  const por = new Map<string, MovBanco[]>();
  for (const m of movs) {
    if ((m.categoria !== 'fornecedor' && m.categoria !== 'estoque') || m.valor >= 0 || m.pedido_numero || m.produto_ext) continue;
    const k = (-m.valor).toFixed(2);
    por.set(k, [...(por.get(k) ?? []), m]);
  }
  return [...por.entries()].filter(([, l]) => l.length >= 2).map(([k, l]) => ({valor: Number(k), n: l.length, total: Number(k) * l.length, movs: l}))
    .sort((a, b) => b.total - a.total);
}

// ---------- Conciliação de compras com pedidos ----------

export type Sugestao = {conta: string; fitid: string; data: string; valor: number; pedido: string; pedidoData: string};

/**
 * Sugere o pedido de cada compra de fornecedor sem vínculo: mesmo valor do custo dos produtos do pedido,
 * pedido pago de 1 dia antes até 5 dias antes da compra, do pedido mais antigo para o mais novo.
 */
export function sugerirVinculos(movs: MovBanco[], pedidos: Pedido[], itens: Item[], custos: Map<string, number>): Sugestao[] {
  const ja = new Set(movs.filter((m) => m.pedido_numero).map((m) => m.pedido_numero));
  const itensPor = new Map<string, Item[]>();
  for (const i of itens) itensPor.set(i.pedido_id, [...(itensPor.get(i.pedido_id) ?? []), i]);
  const custoPedido = (p: Pedido) => {
    const its = itensPor.get(p.id) ?? [];
    if (!its.length) return null;
    let s = 0;
    for (const i of its) { const c = custos.get(i.produto_ext); if (c === undefined) return null; s += c * i.quantidade; }
    return s;
  };
  const livres = pedidos.filter((p) => p.status === 'pago' && p.dia_pago && !ja.has(numeroPedido(p.numero))).sort((a, b) => a.dia_pago!.localeCompare(b.dia_pago!));
  const usados = new Set<string>();
  const dias = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400_000);
  const out: Sugestao[] = [];
  const candidatas = movs.filter((m) => (m.categoria === 'fornecedor' || m.categoria === 'estoque') && m.valor < 0 && !m.pedido_numero && !m.produto_ext)
    .sort((a, b) => a.data.localeCompare(b.data));
  for (const m of candidatas) {
    const v = -m.valor;
    const p = livres.find((x) => {
      if (usados.has(x.id)) return false;
      const c = custoPedido(x);
      const d = dias(x.dia_pago!, m.data);
      return c !== null && Math.abs(c - v) < 0.015 && d >= -1 && d <= 5;
    });
    if (p) { usados.add(p.id); out.push({conta: m.conta, fitid: m.fitid, data: m.data, valor: v, pedido: numeroPedido(p.numero), pedidoData: p.dia_pago!}); }
  }
  return out;
}

/**
 * Mesmo valor pago ao fornecedor no mesmo dia (ou com 1 dia de diferença) em canais diferentes, cartão e conta,
 * sem vínculo com pedido. Valores iguais ao custo de um produto conhecido, ou que se repetem em outras compras, não entram: compras repetidas são normais.
 */
export function possiveisDuplicidades(movs: MovBanco[], custosConhecidos: number[]) {
  const conhecidos = new Set(custosConhecidos.map((c) => c.toFixed(2)));
  const forn = movs.filter((m) => (m.categoria === 'fornecedor' || m.categoria === 'estoque') && m.valor < 0 && !m.pedido_numero && !conhecidos.has((-m.valor).toFixed(2)));
  const dias = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400_000;
  // Valor que se repete várias vezes é produto comprado várias vezes: só interessa o valor que aparece exatamente duas vezes.
  const vezes = new Map<string, number>();
  for (const m of forn) vezes.set((-m.valor).toFixed(2), (vezes.get((-m.valor).toFixed(2)) ?? 0) + 1);
  const pares: [MovBanco, MovBanco][] = [];
  for (let i = 0; i < forn.length; i++) for (let j = i + 1; j < forn.length; j++) {
    const a = forn[i], b = forn[j];
    if (vezes.get((-a.valor).toFixed(2)) === 2 && Math.abs(a.valor - b.valor) < 0.005 && a.conta.startsWith('cartao') !== b.conta.startsWith('cartao') && dias(a.data, b.data) <= 1) pares.push([a, b]);
  }
  return pares;
}

export {numeroPedido};
