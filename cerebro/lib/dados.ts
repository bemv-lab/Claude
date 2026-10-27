// Leituras do banco usadas pelas telas e pelo conector MCP.
import {db} from './db';
import {precificar, avaliarAnuncio, fmtBRL, fmtNum, fmtPct, type Config, type Forma, type Produto, type Lancamento} from './calc';
import {resumo, caixaCartpanda, taxaDoPedido, compararPlanos, montarTaxas, radarCustos, taxaEfetivaSemanal, type Entrada, type Taxa, type Radar, NOME_FORMA} from './financeiro';
import type {Pedido, Item} from './shopify';
import type {AdDia} from './meta';
import {compararExperimento, quedaDeConversao, acoesParaQuedaDeConversao, type Experimento} from './plano';
import {previsaoCaixa, portoesDeCaixa, type EntradaCaixa} from './caixa';
import {lancamentosDoBanco, faturaCartao, saldoSocio, possiveisDuplicidades, custosMedios, nomeConta, type MovBanco, type CustoMedio} from './banco';

export type CfgCompleta = Config & {
  meta_mes: number; gateway_exemplo: number; reserva_pct: number; reserva_dias: number; prazo_cartao: number;
  pix_pct: number; boleto_fixo: number; parcelas_sem_juros: number; taxa_repasse: number;
  custo_capital_mensal: number; meta_limite_cobranca: number; meta_saldo_devedor: number; colchao_caixa: number; shopify_anual_brl: number; cartao_pj_limite: number; cartao_pj_fechamento: number; cartao_pj_vencimento: number;
};

export function lerConfig(): CfgCompleta {
  const rows = db().prepare('SELECT chave, valor FROM config').all() as {chave: string; valor: number}[];
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {das_pct: c.das_pct ?? 0, plataforma_pct: c.plataforma_pct ?? 0, meta_imposto_pct: c.meta_imposto_pct ?? 0, cpa_alvo_padrao: c.cpa_alvo_padrao ?? 0,
    meta_mes: c.meta_mes ?? 0, gateway_exemplo: c.gateway_exemplo ?? 0,
    reserva_pct: c.reserva_pct ?? 5, reserva_dias: c.reserva_dias ?? 90, prazo_cartao: c.prazo_cartao ?? 2,
    pix_pct: c.pix_pct ?? 0.99, boleto_fixo: c.boleto_fixo ?? 3.5, parcelas_sem_juros: c.parcelas_sem_juros ?? 6, taxa_repasse: c.taxa_repasse ?? 0,
    custo_capital_mensal: c.custo_capital_mensal ?? 1.2,
    meta_limite_cobranca: c.meta_limite_cobranca ?? 3000, meta_saldo_devedor: c.meta_saldo_devedor ?? 0, colchao_caixa: c.colchao_caixa ?? 0, shopify_anual_brl: c.shopify_anual_brl ?? 0,
    cartao_pj_limite: c.cartao_pj_limite ?? 0, cartao_pj_fechamento: c.cartao_pj_fechamento ?? 1, cartao_pj_vencimento: c.cartao_pj_vencimento ?? 10};
}

// O SQLite do Node devolve objetos sem protótipo; as telas precisam de objetos simples.
const simples = <T,>(linhas: unknown[]) => linhas.map((l) => ({...(l as object)})) as T[];

export const lerJuros = (): Record<number, number> =>
  Object.fromEntries((db().prepare('SELECT parcelas, pct FROM juros_parcela ORDER BY parcelas').all() as {parcelas: number; pct: number}[]).map((j) => [j.parcelas, j.pct]));
export const lerPrazos = () => simples<{dias: number; pct: number}>(db().prepare('SELECT dias, pct FROM cartao_prazos ORDER BY dias').all());

/** Taxas de cada forma de pagamento, calculadas a partir do prazo de recebimento, dos juros por parcela e do "sem juros até". */
export type Politica = {desde: string; prazo_cartao: number; sem_juros: number};
/** Histórico de prazo de recebimento e de "sem juros até Nx": cada mudança vale a partir do dia em que foi feita. */
export const lerPoliticas = () => simples<Politica>(db().prepare('SELECT desde, prazo_cartao, sem_juros FROM politica_taxas ORDER BY desde').all());
export const semJurosEm = (politicas: Politica[]) => (dia: string) => ([...politicas].reverse().find((p) => p.desde <= dia) ?? politicas[0])?.sem_juros ?? 0;

/** Com `historico`, traz as taxas de cada política (para calcular pedidos antigos pela regra da época); sem, só a vigente. */
export function lerTaxas(historico = true): Taxa[] {
  const c = lerConfig(), prazos = lerPrazos(), juros = lerJuros();
  const politicas = lerPoliticas();
  const lista = historico && politicas.length ? politicas : [{desde: '', prazo_cartao: c.prazo_cartao, sem_juros: c.parcelas_sem_juros}];
  return lista.flatMap((pol, i) => montarTaxas({pix_pct: c.pix_pct, boleto_fixo: c.boleto_fixo, base_pct: prazos.find((p) => p.dias === pol.prazo_cartao)?.pct ?? 5.99, sem_juros: pol.sem_juros, juros})
    .map((t) => ({...t, desde: i === 0 ? '' : pol.desde})));
}

/** Mix real de pagamento dos últimos 90 dias (pedidos pagos), com a taxa de cada forma e parcela. Alimenta a precificação. */
export function lerFormas(): Forma[] {
  const taxas = lerTaxas(false);
  const desde = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const grupos = db().prepare("SELECT forma, parcelas, count(*) n, avg(total) media FROM pedidos WHERE status = 'pago' AND dia >= ? GROUP BY forma, parcelas ORDER BY n DESC").all(desde) as {forma: string; parcelas: number; n: number; media: number}[];
  const total = grupos.reduce((s, g) => s + g.n, 0);
  if (!total) return simples<Forma>(db().prepare('SELECT id, nome, taxa_pct, mix_pct FROM formas_pagamento ORDER BY ordem, id').all());
  return grupos.map((g, i) => {
    const t = taxas.find((x) => x.forma === g.forma && x.parcelas === g.parcelas) ?? taxas.find((x) => x.forma === g.forma && x.parcelas === 1);
    const fixoPct = t && g.media ? (t.fixo / g.media) * 100 : 0;
    return {id: i, nome: `${NOME_FORMA[g.forma] ?? g.forma}${g.forma === 'cartao' ? ` ${g.parcelas}x` : ''}`, taxa_pct: (t?.pct ?? 0) + fixoPct, mix_pct: (g.n / total) * 100};
  });
}
/** Produtos ativos. O custo é a média dos pagamentos a fornecedor quando há; senão, o digitado à mão. */
export function lerProdutos() {
  const custos = new Map(custosDosProdutos().map((c) => [c.shopify_id, c] as const));
  return simples<Produto>(db().prepare('SELECT * FROM produtos WHERE ativo = 1 ORDER BY id').all()).map((p) => {
    const c = p.shopify_id ? custos.get(p.shopify_id) : undefined;
    return c ? {...p, custo: Math.round(c.custo * 100) / 100, custo_origem: c.origem, custo_unidades: c.unidades, custo_compras: c.compras} : {...p, custo_origem: (p.custo > 0 ? 'manual' : 'sem') as 'manual' | 'sem'};
  });
}

export type Plano = {id: number; servico: string; plano: string; custo_mensal: number; taxa_pct: number; gatilho_pedidos: number; proximo: string; obs: string};
export const lerPlanos = () => db().prepare('SELECT * FROM planos ORDER BY id').all() as Plano[];

export const mesAtual = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'}).slice(0, 7);
export const hoje = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'});

export function lancamentosDoMes(mes: string) {
  return simples<Lancamento>(db().prepare("SELECT * FROM lancamentos WHERE substr(data, 1, 7) = ? ORDER BY data DESC, id DESC").all(mes));
}

/** Tudo o que o motor financeiro precisa para o intervalo (pedidos pela criação ou pelo pagamento). */
export function entrada(ini: string, fim: string): Entrada {
  const d = db();
  const pedidos = simples<Pedido>(d.prepare('SELECT * FROM pedidos WHERE (dia BETWEEN ? AND ?) OR (dia_pago BETWEEN ? AND ?)').all(ini, fim, ini, fim));
  const itens = simples<Item>(d.prepare(`SELECT i.* FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id WHERE (p.dia BETWEEN ? AND ?) OR (p.dia_pago BETWEEN ? AND ?)`).all(ini, fim, ini, fim));
  const ads = simples<AdDia>(d.prepare('SELECT * FROM ads_dia WHERE data BETWEEN ? AND ?').all(ini, fim));
  const lancamentos = [...simples<Lancamento>(d.prepare('SELECT * FROM lancamentos WHERE data BETWEEN ? AND ?').all(ini, fim)),
    ...recorrencias(simples<Lancamento>(d.prepare('SELECT * FROM lancamentos WHERE recorrente = 1 AND data < ?').all(ini)), ini, fim),
    // Despesas pagas pela conta PJ (DAS volta um mês: por isso o extrato é lido até 40 dias depois do fim).
    ...lancamentosDoBanco(lerBanco(ini, desloca(fim, 40))).filter((l) => l.data >= ini && l.data <= fim)];
  const prods = custosDosProdutos();
  const cfg = lerConfig();
  return {
    pedidos, itens, ads, lancamentos, taxas: lerTaxas(),
    custos: new Map(prods.filter((p) => p.custo > 0).map((p) => [p.shopify_id, p.custo] as const)),
    nomes: new Map(prods.map((p) => [p.shopify_id, p.nome])),
    cfg: {checkout_pct: cfg.plataforma_pct, das_pct: cfg.das_pct, meta_imposto_pct: cfg.meta_imposto_pct},
  };
}

export type CustoProduto = {shopify_id: string; nome: string; custo: number; origem: 'media' | 'manual' | 'sem'; unidades: number; valor: number; compras: number};

/** Custo médio de cada produto pelos pagamentos a fornecedor vinculados (pedido ou produto + quantidade). */
export function lerCustosMedios() {
  const d = db();
  const movs = simples<MovBanco>(d.prepare("SELECT * FROM banco WHERE categoria IN ('fornecedor', 'estoque')").all());
  const ligados = new Set(movs.filter((m) => m.pedido_numero).map((m) => m.pedido_numero));
  const pedidos = ligados.size ? simples<{id: string; numero: string}>(d.prepare('SELECT id, numero FROM pedidos').all()).filter((p) => ligados.has(p.numero.replace(/\D/g, ''))) : [];
  const itens = pedidos.length ? simples<Item>(d.prepare(`SELECT * FROM pedido_itens WHERE pedido_id IN (${pedidos.map(() => '?').join(',')})`).all(...pedidos.map((p) => p.id))) : [];
  // Primeiro rateio por unidade; depois, com as médias já achadas, os pedidos de vários produtos se dividem pelo custo de cada um.
  const um = custosMedios(movs, pedidos, itens);
  const ref = new Map([...um.medios].map(([k, v]) => [k, v.custo] as const));
  return custosMedios(movs, pedidos, itens, ref);
}

/** Custo de cada produto da loja: a média dos pagamentos a fornecedor; o valor digitado à mão só vale enquanto não há pagamento vinculado. */
export function custosDosProdutos(): CustoProduto[] {
  const prods = db().prepare('SELECT shopify_id, nome, custo FROM produtos WHERE shopify_id IS NOT NULL').all() as {shopify_id: string; nome: string; custo: number}[];
  const {medios} = lerCustosMedios();
  return prods.map((p) => {
    const m: CustoMedio | undefined = medios.get(p.shopify_id);
    if (m) return {shopify_id: p.shopify_id, nome: p.nome, custo: m.custo, origem: 'media' as const, unidades: m.unidades, valor: m.valor, compras: m.compras};
    return {shopify_id: p.shopify_id, nome: p.nome, custo: p.custo, origem: p.custo > 0 ? 'manual' as const : 'sem' as const, unidades: 0, valor: 0, compras: 0};
  });
}

/** Despesa recorrente: repete todo mês no mesmo dia (ou no último dia do mês, se ele for menor). */
export function recorrencias(base: Lancamento[], ini: string, fim: string) {
  const out: Lancamento[] = [];
  for (const l of base) {
    let [a, m] = l.data.split('-').map(Number);
    const dia = Number(l.data.slice(8, 10));
    for (;;) {
      m++; if (m > 12) { m = 1; a++; }
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const data = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
      if (data > fim) break;
      if (data >= ini) out.push({...l, data, origem: 'recorrente'});
    }
  }
  return out;
}

/** Vendas pagas dos últimos 30 dias e a comparação dos planos da Cartpanda. */
export function planoCartpanda() {
  const h = hoje();
  const fat30 = (db().prepare("SELECT coalesce(sum(total - reembolsado), 0) v FROM pedidos WHERE status = 'pago' AND dia_pago > ? AND dia_pago <= ?").get(desloca(h, -30), h) as {v: number}).v;
  const atual = (db().prepare("SELECT plano FROM planos WHERE servico = 'Cartpanda' LIMIT 1").get() as {plano: string} | undefined)?.plano || 'Light';
  return {fat30, atual, cmp: compararPlanos(fat30, atual)};
}

export const lerBanco = (ini: string, fim: string) => simples<MovBanco>(db().prepare('SELECT * FROM banco WHERE data BETWEEN ? AND ? ORDER BY data DESC, fitid DESC').all(ini, fim));

export function saldosBanco() {
  return (db().prepare("SELECT chave, valor FROM estado WHERE chave LIKE 'banco_saldo:%'").all() as {chave: string; valor: string}[])
    .map((r) => ({conta: r.chave.slice(12), ...(JSON.parse(r.valor) as {saldo: number; em: string; banco: string})}));
}

/** Cartão PJ (Inter): fatura aberta, vencimento e limite disponível. */
export function faturaCartaoPJ() {
  const cfg = lerConfig(), h = hoje();
  const movs = lerBanco(desloca(h, -75), desloca(h, 40));
  return faturaCartao(movs, h, {fechamento: cfg.cartao_pj_fechamento, vencimento: cfg.cartao_pj_vencimento, limite: cfg.cartao_pj_limite});
}

export const saldoComSocio = () => saldoSocio(lerBanco('2000-01-01', '2999-12-31'));

/** Radar de custos dos últimos 30 dias, com a tendência de oito semanas. */
export function radar30() {
  const h = hoje(), ini = desloca(h, -29), cfg = lerConfig();
  const e = entrada(desloca(ini, -56), h);
  const rad = radarCustos(e, ini, h, {juros: lerJuros(), sem_juros: cfg.parcelas_sem_juros, sem_juros_em: semJurosEm(lerPoliticas()), prazos: lerPrazos(), prazo_atual: cfg.prazo_cartao,
    custo_capital_mes: cfg.custo_capital_mensal, taxa_repasse: cfg.taxa_repasse,
    saques30: (db().prepare("SELECT count(*) n FROM banco WHERE categoria = 'recebimento_vendas' AND valor > 0 AND data > ?").get(desloca(h, -30)) as {n: number}).n || undefined});
  return {ini, fim: h, cfg, ...rad, tendencia: taxaEfetivaSemanal(e, h, 8)};
}

/** Soma só as parcelas dos pedidos pagos que a Cartpanda já liberou até `ate` (Pix no dia, cartão em D+prazo), já sem taxa e reserva. */
function liberadoAte(pagos: Pedido[], taxas: Taxa[], c: CfgCompleta, ini: string, ate: string) {
  let v = 0;
  for (const p of pagos) {
    if (!p.dia_pago) continue;
    const libera = p.forma === 'cartao' ? desloca(p.dia_pago, c.prazo_cartao) : p.dia_pago;
    if (libera <= ini || libera > ate) continue;
    v += p.total - taxaDoPedido(p, taxas) - Math.round(p.total * c.reserva_pct) / 100;
  }
  return v;
}

/** Tudo o que a previsão de caixa precisa, lido dos pedidos, do extrato e da Meta. */
export function entradaCaixa(): EntradaCaixa & {origemCartpanda: 'informado' | 'estimado' | 'sem-dados'; saldoContaEm: string | null; saques: number; fornecedorPelosPagamentos: boolean} {
  const d = db(), cfg = lerConfig(), h = hoje(), taxas = lerTaxas();
  const pagos = simples<Pedido>(d.prepare("SELECT * FROM pedidos WHERE status = 'pago' AND dia_pago >= ?").all(desloca(h, -100)));
  const movs = lerBanco(desloca(h, -400), desloca(h, 5));
  const contaCorrente = saldosBanco().find((s) => !s.conta.startsWith('cartao'));
  const saldoConta = contaCorrente ? contaCorrente.saldo + movs.filter((m) => !m.conta.startsWith('cartao') && contaCorrente.em && m.data > contaCorrente.em).reduce((s, m) => s + m.valor, 0) : 0;
  const creditos = movs.filter((m) => m.categoria === 'recebimento_vendas' && m.valor > 0);
  const saquesDesde = (ini: string) => creditos.filter((m) => m.data > ini);

  // Disponível na Cartpanda: o saldo informado (âncora) ou, sem ele, o que foi liberado desde o primeiro repasse menos o que já caiu na conta.
  const ancora = (d.prepare("SELECT valor FROM estado WHERE chave = 'cartpanda_saldo'").get() as {valor: string} | undefined)?.valor;
  const ref = ancora ? (JSON.parse(ancora) as {valor: number; em: string}) : null;
  const primeiro = creditos.map((m) => m.data).sort()[0];
  let disponivel = 0, origem: 'informado' | 'estimado' | 'sem-dados' = 'sem-dados';
  if (ref) {
    const sq = saquesDesde(ref.em);
    disponivel = ref.valor + liberadoAte(pagos, taxas, cfg, ref.em, h) - sq.reduce((s, m) => s + m.valor + cfg.taxa_repasse, 0);
    origem = 'informado';
  } else if (primeiro) {
    const ini = desloca(primeiro, -(cfg.prazo_cartao + 1));
    const sq = saquesDesde(desloca(primeiro, -1));
    disponivel = liberadoAte(pagos, taxas, cfg, ini, h) - sq.reduce((s, m) => s + m.valor + cfg.taxa_repasse, 0);
    origem = 'estimado';
  }
  disponivel = Math.max(0, disponivel);

  const liberacoes: {dia: string; valor: number}[] = [];
  for (const p of pagos) {
    if (!p.dia_pago) continue;
    const reserva = Math.round(p.total * cfg.reserva_pct) / 100;
    if (p.forma === 'cartao' && desloca(p.dia_pago, cfg.prazo_cartao) > h) liberacoes.push({dia: desloca(p.dia_pago, cfg.prazo_cartao), valor: p.total - taxaDoPedido(p, taxas) - reserva});
    if (desloca(p.dia_pago, cfg.reserva_dias) > h) liberacoes.push({dia: desloca(p.dia_pago, cfg.reserva_dias), valor: reserva});
  }
  const ult14 = pagos.filter((p) => p.dia_pago! > desloca(h, -14) && p.dia_pago! <= h);
  const liquido = (p: Pedido) => p.total - taxaDoPedido(p, taxas) - Math.round(p.total * cfg.reserva_pct) / 100;
  const pixPorDia = ult14.filter((p) => p.forma !== 'cartao').reduce((s, p) => s + liquido(p), 0) / 14;
  const cartaoPorDia = ult14.filter((p) => p.forma === 'cartao').reduce((s, p) => s + liquido(p), 0) / 14;

  // Fornecedor: o que de fato foi pago nos últimos 14 dias é a melhor régua (vale mesmo sem custo médio); o custo dos produtos é o plano B.
  const e = entrada(desloca(h, -14), h);
  const custoDe = (ids: Set<string>) => e.itens.filter((i) => ids.has(i.pedido_id)).reduce((s, i) => s + (e.custos.get(i.produto_ext) ?? 0) * i.quantidade, 0);
  const pagoForn = movs.filter((m) => m.categoria === 'fornecedor' && m.data > desloca(h, -14) && m.data <= h);
  const realForn = -pagoForn.reduce((s, m) => s + m.valor, 0);
  const usaReal = pagoForn.filter((m) => m.valor < 0).length >= 5 && ult14.length > 0;
  const comCompra = new Set(movs.filter((m) => m.pedido_numero).map((m) => m.pedido_numero));
  const recentes = ult14.filter((p) => p.dia_pago! >= desloca(h, -2) && !comCompra.has(p.numero.replace(/\D/g, '')));
  const fornecedor = usaReal
    ? {pendentes: recentes.length * (realForn / ult14.length), porDia: realForn / 14}
    : {pendentes: custoDe(new Set(recentes.map((p) => p.id))), porDia: custoDe(new Set(ult14.map((p) => p.id))) / 14};

  const ultimaCobranca = movs.filter((m) => m.categoria === 'anuncios' && m.valor < 0).map((m) => m.data).sort().pop() ?? null;
  const adsFb = (ini: string, fim: string) => (d.prepare("SELECT coalesce(sum(gasto), 0) v FROM ads_dia WHERE plataforma = 'facebook' AND data > ? AND data <= ?").get(ini, fim) as {v: number}).v;
  const meta = {gastoDiario: adsFb(desloca(h, -7), h) / 7, acumulado: ultimaCobranca ? adsFb(ultimaCobranca, h) : null, limite: cfg.meta_limite_cobranca,
    saldoDevedor: cfg.meta_saldo_devedor, impostoPct: cfg.meta_imposto_pct, ultimaCobranca};

  return {hoje: h, saldoConta, saldoContaEm: contaCorrente?.em ?? null, origemCartpanda: origem,
    cartpanda: {disponivel, liberacoes, pixPorDia, cartaoPorDia, prazoCartao: cfg.prazo_cartao}, fornecedor, meta,
    saque: {taxa: cfg.taxa_repasse, nUltimos30: creditos.filter((m) => m.data > desloca(h, -30)).length}, saques: creditos.filter((m) => m.data > desloca(h, -30)).length, colchao: cfg.colchao_caixa,
    fatura: {valor: faturaCartaoPJ().total, vencimento: faturaCartaoPJ().total > 0 ? faturaCartaoPJ().vencimento : null}, devidoSocio: Math.max(0, saldoComSocio().aReembolsar), fornecedorPelosPagamentos: usaReal};
}

/** Previsão de caixa e as otimizações que esperam por caixa (D+5, D+14, saque em lote, Shopify anual). */
export function caixaPrevisto() {
  const x = entradaCaixa();
  const prev = previsaoCaixa(x);
  const r = radar30();
  const prazo = (dias: number) => r.prazos.find((p) => p.dias === dias);
  const mediaSaque = x.saque.nUltimos30 ? (x.cartpanda.pixPorDia + x.cartpanda.cartaoPorDia) * 30 / x.saque.nUltimos30 : 0;
  const portoes = portoesDeCaixa(prev.folgaTotal10, [
    ...[5, 14].map((dias) => ({chave: `d${dias}`, nome: `Receber o cartão em D+${dias}`, capital: prazo(dias)?.capital ?? 0,
      ganho: prazo(dias) ? `economiza ${fmtBRL(prazo(dias)!.economia)} por mês em taxa; líquido de ${fmtBRL(prazo(dias)!.liquido)} depois do custo do dinheiro parado` : '',
      observacao: 'Cartão cai mais tarde: o dinheiro fica preso na Cartpanda por mais dias.'})),
    {chave: 'lote', nome: 'Sacar em lote (uma vez por semana)', capital: (x.cartpanda.pixPorDia + x.cartpanda.cartaoPorDia) * 3.5,
      ganho: x.saque.nUltimos30 > 4 ? `${x.saque.nUltimos30} saques em 30 dias custaram ${fmtBRL(x.saque.nUltimos30 * x.saque.taxa)}; semanal custaria ${fmtBRL(4 * x.saque.taxa)}: economiza ${fmtBRL((x.saque.nUltimos30 - 4) * x.saque.taxa)} por mês` : 'poucos saques: ganho pequeno',
      observacao: `Média de ${fmtBRL(mediaSaque)} por saque hoje; em lote, o dinheiro espera até 7 dias na Cartpanda.`},
    {chave: 'shopify', nome: 'Shopify no plano anual (US$ 204 por ano, cobra US$ 185,71 hoje)', capital: lerConfig().shopify_anual_brl,
      ganho: 'o mensal custa US$ 19 (US$ 228 por ano); o anual economiza cerca de US$ 24 por ano, mas antecipa o pagamento: só vale com folga de caixa',
      observacao: lerConfig().shopify_anual_brl > 0 ? 'Valor em reais informado nas âncoras.' : 'Informe quanto isso dá em reais (campo abaixo) para o Cérebro avisar quando o caixa permitir.'},
  ]);
  return {x, prev, portoes};
}

export const lerExperimentos = () => simples<Experimento>(db().prepare("SELECT * FROM experimentos ORDER BY CASE status WHEN 'em_andamento' THEN 0 WHEN 'planejado' THEN 1 ELSE 2 END, id DESC").all());

/** Experimentos com o antes e depois calculados e a queda de conversão recente (com as ações sugeridas). */
export function planoDeAcao() {
  const h = hoje();
  const lista = lerExperimentos();
  const iniMin = lista.filter((x) => x.inicio).reduce((m, x) => (x.inicio! < m ? x.inicio! : m), h);
  const e = entrada(desloca(iniMin, -60), h);
  const experimentos = lista.map((x) => ({...x, comparacao: compararExperimento(e, x, h)}));
  const queda = quedaDeConversao(entrada(desloca(h, -27), h), h);
  const politicas = lerPoliticas();
  const mudou = politicas.length > 1 && politicas[politicas.length - 1].desde >= desloca(h, -30);
  return {experimentos, queda, acoes: queda ? acoesParaQuedaDeConversao(queda.forma, mudou) : [], politicas};
}

type Aviso = {nivel: 'b' | 'w' | 'g' | 'a'; texto: string; onde: string};

/** O que o sistema questiona nas taxas e nos custos: onde dá para pagar menos. */
export function avisosDeCustos(x: ReturnType<typeof radar30>): Aviso[] {
  const out: Aviso[] = [];
  const j = x.juros;
  if (j.valor > 0 && x.r.receita > 0 && j.pctReceita >= 1.5) {
    const ate3 = x.simulacao.find((s) => s.ate === 3);
    const mix = x.mix;
    const miolo = ate3 && ate3.economia > 0
      ? ` Passar para até 3x economizaria ${fmtBRL(ate3.economia)} por mês e faria ${ate3.afetados} compradores de cartão (${fmtPct(mix.n ? (ate3.afetados / mix.n) * 100 : 0)}) pagarem juros: a economia se perde se cerca de ${fmtNum(ate3.equilibrioPedidos ?? 0, 1)} pedidos por mês${ate3.toleranciaPct !== null ? ` (${fmtPct(ate3.toleranciaPct)} desses compradores)` : ''} deixarem de comprar. É cenário, não resultado: registre como experimento no Plano de ação antes de mudar.`
      : '';
    out.push({nivel: 'w', texto: `Você assumiu ${fmtBRL(j.valor)} de juros de parcelamento em 30 dias (${fmtPct(j.pctReceita)} da receita) por oferecer sem juros até ${x.cfg.parcelas_sem_juros}x. Quem paga no cartão parcela, em média, em ${fmtNum(mix.mediaParcelas, 1)}x: ${fmtPct(mix.avista)} à vista, ${fmtPct(mix.ate3)} até 3x.${miolo}`, onde: 'custos'});
  }
  const melhorPrazo = [...x.prazos].filter((p) => !p.atual && p.dias > x.cfg.prazo_cartao).sort((a, b) => b.liquido - a.liquido)[0];
  if (melhorPrazo && melhorPrazo.liquido >= 15) out.push({nivel: 'a', texto: `Receber o cartão em D+${melhorPrazo.dias} em vez de D+${x.cfg.prazo_cartao} baixa a taxa de ${fmtPct(x.prazos.find((p) => p.atual)?.pct ?? 0)} para ${fmtPct(melhorPrazo.pct)}: economiza ${fmtBRL(melhorPrazo.economia)} por mês e deixa ${fmtBRL(melhorPrazo.capital)} parados a mais. Líquido de ${fmtBRL(melhorPrazo.liquido)} depois do custo do dinheiro.`, onde: 'custos'});
  if (x.tendencia.variacao !== null && x.tendencia.variacao >= 0.5) out.push({nivel: 'w', texto: `A taxa de pagamento (gateway + checkout) subiu de ${fmtPct(x.tendencia.anterior)} para ${fmtPct(x.tendencia.recente)} da receita nas últimas 4 semanas.`, onde: 'custos'});
  if (x.pix.nCartao > 0 && x.pix.shareCartao >= 30 && x.pix.economiaPorPedido >= 10) out.push({nivel: 'a', texto: `Pix contra cartão, na teoria: cada pedido que sai do cartão para o Pix economiza ${fmtBRL(x.pix.economiaPorPedido)} em taxas (cartão custa ${fmtPct(x.pix.pctCartao)}, Pix ${fmtPct(x.pix.pctPix)}). Na prática isso só é dinheiro no bolso se o comprador migra em vez de desistir: ${x.pix.conversaoPix === null ? '' : `${fmtPct(100 - x.pix.conversaoPix)} dos Pix gerados não são pagos (conversão ${fmtPct(x.pix.conversaoPix)}), e o cartão recusado nem vira pedido, então não dá para comparar as duas conversões.`} Um desconto no Pix de até ${fmtPct(x.pix.descontoMax)} empata para quem compraria de qualquer jeito; trate 3% a 5% como hipótese e teste no Plano de ação.`, onde: 'custos'});
  return out;
}

/** Caixa na Cartpanda (reserva e cartão a liberar), a partir dos pedidos pagos que ainda podem estar presos. */
export function caixa() {
  const cfg = lerConfig(), h = hoje();
  const desde = desloca(h, -Math.max(cfg.reserva_dias, cfg.prazo_cartao) - 1);
  const pagos = simples<Pedido>(db().prepare("SELECT * FROM pedidos WHERE status = 'pago' AND dia_pago >= ?").all(desde));
  return caixaCartpanda(pagos, lerTaxas(), h, cfg);
}

const desloca = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);
export const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['mes-passado', 'Mês passado']] as const;

/** Lê o período da URL (?p=7d ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD). */
export function periodo(q: {p?: string; de?: string; ate?: string}) {
  const h = hoje(), dataOk = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (dataOk(q.de) && dataOk(q.ate) && q.de! <= q.ate!) return {chave: 'outra', ini: q.de!, fim: q.ate!};
  const mesPassadoFim = desloca(`${h.slice(0, 7)}-01`, -1);
  const mapa: Record<string, [string, string]> = {
    hoje: [h, h], ontem: [desloca(h, -1), desloca(h, -1)], '7d': [desloca(h, -6), h], '30d': [desloca(h, -29), h],
    mes: [`${h.slice(0, 7)}-01`, h], 'mes-passado': [`${mesPassadoFim.slice(0, 7)}-01`, mesPassadoFim],
  };
  const chave = q.p && q.p in mapa ? q.p : 'hoje';
  return {chave, ini: mapa[chave][0], fim: mapa[chave][1]};
}
export {desloca};

export function resumoMes(mes: string) {
  const ini = `${mes}-01`, fim = mes === mesAtual() ? hoje() : desloca(`${desloca(`${mes}-28`, 4).slice(0, 7)}-01`, -1);
  return resumo(entrada(ini, fim), ini, fim);
}

/** Produto de referência das regras da esteira: o que mais vendeu nos últimos 30 dias (ou o primeiro ativo). */
export function referenciaCampanhas() {
  const cfg = lerConfig(), formas = lerFormas();
  const desde = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const top = db().prepare("SELECT i.produto_ext id FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id WHERE p.status = 'pago' AND p.dia >= ? GROUP BY i.produto_ext ORDER BY sum(i.preco * i.quantidade) DESC LIMIT 1").get(desde) as {id: string} | undefined;
  const produtos = lerProdutos();
  const p = produtos.find((x) => top && x.shopify_id === top.id) ?? produtos[0];
  if (!p) return null;
  const r = precificar(p, cfg, formas);
  return {produto: p, cpaMax: r.cpaMax, cpaAlvo: r.cpaAlvo, roasBE: r.roasBE, metaPct: cfg.meta_imposto_pct};
}

export function ultimaImportacao() {
  const imp = db().prepare('SELECT * FROM importacoes ORDER BY id DESC LIMIT 1').get() as {id: number; arquivo: string; periodo: string; criado_em: string} | undefined;
  if (!imp) return null;
  const ads = db().prepare('SELECT * FROM anuncios WHERE importacao = ? ORDER BY gasto DESC').all(imp.id) as {id: number; campanha: string; conjunto: string; anuncio: string; gasto: number; compras: number; receita: number; impressoes: number; cliques: number}[];
  const ref = referenciaCampanhas();
  return {imp, ref, ads: ads.map((a) => ({...a, ...(ref ? avaliarAnuncio(a, ref) : {etapa: 'teste' as const, motivo: 'Cadastre um produto para gerar as regras.', cpa: null, roas: null, roasReal: null})}))};
}

export type Pendencia = {id: number; chave: string; titulo: string; detalhe: string; status: string; criado_em: string; resolvido_em: string | null; resolucao: string};
export const lerPendencias = () => simples<Pendencia>(db().prepare("SELECT * FROM pendencias ORDER BY CASE status WHEN 'aberta' THEN 0 ELSE 1 END, id").all());

export type Memoria = {id: number; criado_em: string; area: string; texto: string; autor: string};
export function lerMemoria(busca = '', limite = 100) {
  if (busca) return db().prepare("SELECT * FROM memoria WHERE texto LIKE ? OR area LIKE ? ORDER BY id DESC LIMIT ?").all(`%${busca}%`, `%${busca}%`, limite) as Memoria[];
  return db().prepare('SELECT * FROM memoria ORDER BY id DESC LIMIT ?').all(limite) as Memoria[];
}

export function alertas(mes = mesAtual()) {
  const out: {nivel: 'b' | 'w' | 'g' | 'a'; texto: string; onde: string}[] = [];
  const cfg = lerConfig();
  const r = resumoMes(mes);
  for (const p of lerPlanos()) {
    if (!p.gatilho_pedidos) continue;
    const falta = p.gatilho_pedidos - r.pagos.n;
    if (falta <= 0) out.push({nivel: 'a', texto: `${p.servico}: ${r.pagos.n} pedidos pagos no mês passaram do gatilho de ${p.gatilho_pedidos}. Hora de avaliar ${p.proximo || 'outro plano'}.`, onde: 'taxas e planos'});
    else if (falta <= p.gatilho_pedidos * 0.2) out.push({nivel: 'w', texto: `${p.servico}: faltam ${falta} pedidos para o gatilho que reavalia o plano.`, onde: 'taxas e planos'});
  }
  if (cfg.gateway_exemplo) out.push({nivel: 'w', texto: 'As taxas da Cartpanda Pay ainda são de exemplo. Troque pelas reais para o lucro valer.', onde: 'taxas e planos'});
  if (r.semCusto) out.push({nivel: 'w', texto: `${r.semCusto} produto(s) vendido(s) no mês sem custo cadastrado: o lucro está inflado.`, onde: 'precificação'});
  if (!cfg.das_pct) out.push({nivel: 'b', texto: 'Imposto (DAS) em 0%: o lucro não desconta o Simples Nacional.', onde: 'taxas e planos'});
  if (r.receita > 0 && r.impostoEstimado && cfg.das_pct) out.push({nivel: 'a', texto: `DAS estimado do mês (como ME): ${(r.imposto).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} (${cfg.das_pct}% da receita). Lance a guia quando pagar.`, onde: 'financeiro'});
  const plano = planoCartpanda();
  if (plano.cmp.economia >= 10) out.push({nivel: 'a', texto: `Cartpanda: com ${plano.fat30.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} de vendas nos últimos 30 dias, o plano ${plano.cmp.melhor.nome} sairia ${plano.cmp.economia.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} mais barato por mês que o ${plano.atual}.`, onde: 'taxas e planos'});
  else {
    const prox = plano.cmp.viradas.find((v) => v.de === plano.atual);
    if (prox && plano.fat30 < prox.faturamento && plano.fat30 >= prox.faturamento * 0.85) out.push({nivel: 'w', texto: `Cartpanda: faltam ${(prox.faturamento - plano.fat30).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} de vendas em 30 dias para o ${prox.para} valer mais que o ${plano.atual}.`, onde: 'taxas e planos'});
  }
  out.push(...avisosDeCustos(radar30()));
  const semMedia = custosDosProdutos().filter((p) => p.origem !== 'media');
  if (semMedia.length) out.push({nivel: 'w', texto: `${semMedia.length} produto(s) ainda sem custo médio dos pagamentos a fornecedor (${semMedia.slice(0, 3).map((p) => p.nome.replace(/\s+-\s+1 unidade$/i, '')).join(', ')}${semMedia.length > 3 ? '…' : ''}). Vincule os pagamentos a pedido ou produto para o lucro deixar de ser estimado.`, onde: 'conta pj'});
  const pl = planoDeAcao();
  if (pl.queda) out.push({nivel: 'b', texto: `A conversão caiu ${pl.queda.queda.toFixed(1).replace('.', ',')} pontos (de ${fmtPct(pl.queda.anterior.conversao ?? 0)} para ${fmtPct(pl.queda.recente.conversao ?? 0)} nos últimos 14 dias${pl.queda.forma === 'cartao' ? ', puxada pelo cartão' : pl.queda.forma === 'pix' ? ', puxada pelo Pix' : ''}). Primeira ação a testar: ${pl.acoes[0]} Veja as outras no Plano de ação.`, onde: 'plano de ação'});
  for (const x of pl.experimentos.filter((q) => q.status === 'em_andamento' && q.comparacao)) {
    const v = x.comparacao!.veredito;
    if (v === 'reverter') out.push({nivel: 'b', texto: `Experimento “${x.titulo}”: a conversão do cartão ou os pedidos por dia caíram além do limite. Hora de reverter e testar uma alternativa.`, onde: 'plano de ação'});
    else if (v === 'manter') out.push({nivel: 'g', texto: `Experimento “${x.titulo}”: sem queda relevante e com lucro por pedido maior. Pode concluir e manter a mudança.`, onde: 'plano de ação'});
  }
  const cx = caixaPrevisto(), rec = cx.prev.recomendacao;
  if (rec.tipo !== 'usar') out.push({nivel: rec.tipo === 'falta' ? 'b' : 'w', texto: `${rec.titulo} ${rec.detalhe}`, onde: 'caixa'});
  if (cx.prev.cob.dias !== null && cx.prev.cob.dias <= 3) out.push({nivel: 'a', texto: `A Meta deve cobrar cerca de ${fmtBRL(cx.prev.cob.valor)} ${cx.prev.cob.dias === 0 ? 'a qualquer momento' : `em ${cx.prev.cob.dias} dia(s)`}. Deixe esse valor separado (e o cartão com limite para ele).`, onde: 'caixa'});
  for (const p of cx.portoes.filter((q) => q.aberto)) out.push({nivel: 'g', texto: `Caixa com folga: já dá para ${p.nome.toLowerCase()} (deixa ${fmtBRL(p.capital)} parados; ${p.ganho}).`, onde: 'caixa'});
  const abertas = lerPendencias().filter((q) => q.status === 'aberta');
  if (abertas.length) out.push({nivel: 'a', texto: `${abertas.length} pendência(s) a verificar: ${abertas.slice(0, 3).map((q) => q.titulo.replace(/:.*$/, '')).join('; ')}${abertas.length > 3 ? '…' : ''}.`, onde: 'conta pj'});
  const aClassificar = (db().prepare("SELECT count(*) n FROM banco WHERE categoria = 'a_classificar'").get() as {n: number}).n;
  if (aClassificar) out.push({nivel: 'w', texto: `${aClassificar} movimento(s) do extrato e dos cartões sem categoria: ficam fora do DRE até você classificar.`, onde: 'conta pj'});
  const duplicidades = possiveisDuplicidades(lerBanco(desloca(hoje(), -90), hoje()), [...new Set(entrada(desloca(hoje(), -1), hoje()).custos.values())]);
  const jaPendente = new Set(lerPendencias().map((q) => q.chave));
  for (const [x, y] of duplicidades.filter(([q]) => !jaPendente.has(`dup:${(-q.valor).toFixed(2)}`)).slice(0, 3)) out.push({nivel: 'b', texto: `Possível pagamento em duplicidade: ${fmtBRL(-x.valor)} em ${x.data.slice(8)}/${x.data.slice(5, 7)} no ${nomeConta(x.conta)} e na ${nomeConta(y.conta)}, sem pedido vinculado. Confira se foram duas compras.`, onde: 'conta pj'});
  const socio = saldoComSocio();
  if (socio.aReembolsar > 50) out.push({nivel: 'a', texto: `A empresa deve ${fmtBRL(socio.aReembolsar)} à Bárbara: despesas pagas no cartão pessoal (${fmtBRL(socio.pago)}) menos reembolsos (${fmtBRL(socio.reembolsado)}).`, onde: 'conta pj'});
  const fat = faturaCartaoPJ();
  if (fat.total > 0) {
    const dias = Math.round((new Date(`${fat.vencimento}T12:00:00Z`).getTime() - new Date(`${hoje()}T12:00:00Z`).getTime()) / 86400_000);
    if (dias <= 5) out.push({nivel: 'b', texto: `A fatura do cartão PJ (${fmtBRL(fat.total)}) vence em ${dias} dia(s), dia ${fat.vencimento.slice(8)}/${fat.vencimento.slice(5, 7)}.`, onde: 'conta pj'});
    if (fat.limite > 0 && fat.disponivel < fat.limite * 0.1) out.push({nivel: 'w', texto: `Limite do cartão PJ quase todo usado: sobram ${fmtBRL(fat.disponivel)} de ${fmtBRL(fat.limite)}.`, onde: 'conta pj'});
  }
  const ultimaSync = (db().prepare("SELECT valor FROM estado WHERE chave = 'shopify_ultima'").get() as {valor: string} | undefined)?.valor;
  if (!ultimaSync) out.push({nivel: 'w', texto: 'A Shopify ainda não foi sincronizada: os números de venda estão vazios.', onde: 'financeiro'});
  const u = ultimaImportacao();
  if (u) {
    const pausar = u.ads.filter((a) => a.etapa === 'pausar').length, escalar = u.ads.filter((a) => a.etapa === 'escala').length;
    if (pausar) out.push({nivel: 'b', texto: `${pausar} anúncio(s) para pausar na última importação da Meta.`, onde: 'campanhas'});
    if (escalar) out.push({nivel: 'g', texto: `${escalar} anúncio(s) prontos para escalar.`, onde: 'campanhas'});
  }
  return out;
}
