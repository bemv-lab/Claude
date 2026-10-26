// Motor do módulo financeiro (no estilo Único Drop), calculado a partir de pedidos, anúncios e despesas lançadas.
// Funções puras: as telas, o conector MCP e os testes usam as mesmas contas.
import type {Pedido, Item} from './shopify';
import type {AdDia} from './meta';
import {CATEGORIAS, ehCategoria, type Lancamento} from './calc';

export type Taxa = {forma: string; parcelas: number; pct: number; fixo: number};
export type CfgFin = {checkout_pct: number; das_pct: number; meta_imposto_pct: number};
export type Entrada = {
  pedidos: Pedido[]; itens: Item[]; ads: AdDia[]; lancamentos: Lancamento[];
  custos: Map<string, number>; // produto_ext → custo unitário (só os cadastrados com custo > 0)
  nomes: Map<string, string>; taxas: Taxa[]; cfg: CfgFin;
};

export const FORMAS = ['cartao', 'pix', 'boleto'] as const;
export const NOME_FORMA: Record<string, string> = {cartao: 'Cartão', pix: 'Pix', boleto: 'Boleto', outro: 'Outros'};

// Lançamentos que os pedidos já calculam sozinhos: ficam fora para não contar duas vezes.
const AUTOMATICAS = new Set(['receita_vendas', 'cmv', 'taxa_pagamento', 'plataforma']);

type NV = {n: number; v: number};
const nv = (): NV => ({n: 0, v: 0});
const soma = (a: NV, v: number) => { a.n++; a.v += v; };

export function taxaDoPedido(p: Pedido, taxas: Taxa[]) {
  const forma = p.forma === 'outro' ? 'cartao' : p.forma;
  const t = taxas.find((x) => x.forma === forma && x.parcelas === p.parcelas) ?? taxas.find((x) => x.forma === forma && x.parcelas === 1);
  return t ? (p.total * t.pct) / 100 + t.fixo : 0;
}

/** Custo e receita por item, com o total do pedido (já com desconto) rateado pelo valor de cada item. */
function itensDoPedido(p: Pedido, porPedido: Map<string, Item[]>, custos: Map<string, number>) {
  const its = porPedido.get(p.id) ?? [];
  const bruto = its.reduce((s, i) => s + i.preco * i.quantidade, 0);
  return its.map((i) => {
    const custoUnit = custos.get(i.produto_ext);
    return {
      produto: i.produto_ext, nome: i.nome, quantidade: i.quantidade,
      receita: bruto ? (p.total * i.preco * i.quantidade) / bruto : 0,
      custo: custoUnit === undefined ? 0 : custoUnit * i.quantidade, semCusto: custoUnit === undefined,
    };
  });
}

function agrupar<T>(lista: T[], chave: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of lista) { const k = chave(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return m;
}

export function diasEntre(ini: string, fim: string) {
  const out: string[] = [];
  for (let d = new Date(`${ini}T12:00:00Z`); d <= new Date(`${fim}T12:00:00Z`); d = new Date(d.getTime() + 86400_000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/** Números do período: pedidos pela data de criação, anúncios e despesas pela data deles. */
export function resumo(e: Entrada, ini: string, fim: string, incluirAdicionais = false) {
  const dentro = (d: string | null) => !!d && d >= ini && d <= fim;
  const pedidos = e.pedidos.filter((p) => dentro(p.dia));
  const porPedido = agrupar(e.itens, (i) => i.pedido_id);
  const ads = e.ads.filter((a) => dentro(a.data));
  const lancs = e.lancamentos.filter((l) => dentro(l.data) && ehCategoria(l.categoria) && !AUTOMATICAS.has(l.categoria));

  const gerados = nv(), pagos = nv(), pendentes = nv(), cancelados = nv(), reembolsados = nv();
  const porForma: Record<string, {pago: NV; pendente: NV; cancelado: NV}> = {};
  let custo = 0, gateway = 0, frete = 0, descontos = 0, reembolsado = 0, reembolsoParcial = 0;
  const semCusto = new Set<string>();
  for (const p of pedidos) {
    const f = (porForma[p.forma] ??= {pago: nv(), pendente: nv(), cancelado: nv()});
    if (p.status !== 'cancelado') soma(gerados, p.total);
    if (p.status === 'pago') {
      soma(pagos, p.total); soma(f.pago, p.total);
      gateway += taxaDoPedido(p, e.taxas);
      frete += p.frete; descontos += p.desconto; reembolsado += p.reembolsado; reembolsoParcial += p.reembolsado;
      for (const i of itensDoPedido(p, porPedido, e.custos)) { custo += i.custo; if (i.semCusto) semCusto.add(i.produto); }
    } else if (p.status === 'pendente') { soma(pendentes, p.total); soma(f.pendente, p.total); }
    else if (p.status === 'reembolsado') { soma(reembolsados, p.total); reembolsado += p.total; }
    else { soma(cancelados, p.total); soma(f.cancelado, p.total); }
  }
  // Reembolso total já tira o pedido dos pagos; aqui só desconta o parcial.
  const receita = pagos.v - reembolsoParcial;
  const somaCat = (cats: string[]) => lancs.filter((l) => cats.includes(l.categoria)).reduce((s, l) => s + l.valor_centavos / 100, 0);
  const adsFb = ads.filter((a) => a.plataforma === 'facebook').reduce((s, a) => s + a.gasto, 0);
  const adsGoogle = ads.filter((a) => a.plataforma === 'google').reduce((s, a) => s + a.gasto, 0);
  const adsManual = somaCat(['midia']);
  const adsTotal = adsFb + adsGoogle + adsManual;
  const impostoMeta = (adsFb * e.cfg.meta_imposto_pct) / 100 + somaCat(['imposto_midia']);
  const checkout = (receita * e.cfg.checkout_pct) / 100;
  const dasLancado = somaCat(['das']);
  const imposto = dasLancado || (receita * e.cfg.das_pct) / 100;
  const taxas = checkout + gateway + imposto + impostoMeta;
  const adicionais = lancs.filter((l) => {
    const g = CATEGORIAS[l.categoria as keyof typeof CATEGORIAS].grupo;
    return !['midia', 'imposto_midia', 'das'].includes(l.categoria) && g !== 'receita' && g !== 'outras';
  }).reduce((s, l) => s + l.valor_centavos / 100, 0) - somaCat(['outras_receitas']);
  const lucroOperacao = receita - custo - adsTotal - taxas;
  const lucro = lucroOperacao - (incluirAdicionais ? adicionais : 0);

  const f = (k: keyof AdDia) => ads.reduce((s, a) => s + (a[k] as number), 0);
  const funil = {impressoes: f('impressoes'), cliques: f('cliques'), views: f('views'), carrinho: f('carrinho'), checkout: f('checkout'), compras: f('compras')};

  return {
    ini, fim, gerados, pagos, pendentes, cancelados, reembolsados, porForma,
    receita, custo, semCusto: semCusto.size, ads: {facebook: adsFb, google: adsGoogle, manual: adsManual, total: adsTotal},
    impostoMeta, checkout, gateway, imposto, impostoEstimado: !dasLancado, taxas, adicionais, lucroOperacao, lucro,
    margem: receita ? (lucro / receita) * 100 : 0,
    roi: adsTotal ? (lucro / adsTotal) * 100 : null,
    cpa: pagos.n && adsTotal ? adsTotal / pagos.n : null,
    roas: adsTotal ? receita / adsTotal : null,
    ticket: pagos.n ? pagos.v / pagos.n : 0,
    conversao: gerados.n + cancelados.n ? (pagos.n / (gerados.n + cancelados.n)) * 100 : 0,
    frete, descontos, reembolsado,
    funil: {...funil, cpm: funil.impressoes ? (adsFb * 1000) / funil.impressoes : null, ctr: funil.impressoes ? (funil.cliques / funil.impressoes) * 100 : null, cpc: funil.cliques ? adsFb / funil.cliques : null},
    pedidos,
  };
}
export type Resumo = ReturnType<typeof resumo>;

/** Série dia a dia para o gráfico (sem despesas adicionais, que não têm dia de venda). */
export function serieDiaria(e: Entrada, ini: string, fim: string) {
  return diasEntre(ini, fim).map((dia) => {
    const r = resumo(e, dia, dia);
    return {dia, faturado: r.gerados.v, pago: r.pagos.v, lucro: r.lucroOperacao, custo: r.custo, ads: r.ads.total};
  });
}

export function destaques(serie: ReturnType<typeof serieDiaria>, e: Entrada, fim: string) {
  const melhor = serie.reduce((m, d) => (d.pago > m.pago ? d : m), serie[0]);
  const pago = serie.reduce((s, d) => s + d.pago, 0), lucro = serie.reduce((s, d) => s + d.lucro, 0);
  const menos = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() - n * 86400_000).toISOString().slice(0, 10);
  const ult = resumo(e, menos(fim, 6), fim).pagos.v, ant = resumo(e, menos(fim, 13), menos(fim, 7)).pagos.v;
  return {melhor, media: serie.length ? pago / serie.length : 0, margem: pago ? (lucro / pago) * 100 : 0, lucro, ultimos7: ult, variacao7: ant ? ((ult - ant) / ant) * 100 : null};
}

/** Distribuições do Financeiro Detalhado, sempre sobre pedidos pagos (exceto onde dito). */
export function distribuicoes(r: Resumo, e: Entrada) {
  const pagos = r.pedidos.filter((p) => p.status === 'pago');
  const porHora = Array.from({length: 24}, (_, h) => ({h, cartao: 0, pix: 0, boleto: 0, n: 0}));
  const semana = Array.from({length: 7}, (_, d) => ({d, n: 0, v: 0}));
  const conta = (m: Map<string, NV>, k: string, v: number) => { if (!k) return; const x = m.get(k) ?? nv(); soma(x, v); m.set(k, x); };
  const estados = new Map<string, NV>(), cupons = new Map<string, NV>(), parcelas = new Map<string, NV>(), bandeiras = new Map<string, NV>();
  for (const p of pagos) {
    const h = porHora[p.hora]; h.n++;
    if (p.forma === 'cartao' || p.forma === 'pix' || p.forma === 'boleto') h[p.forma] += p.total;
    const s = semana[new Date(`${p.dia}T12:00:00Z`).getUTCDay()]; s.n++; s.v += p.total;
    conta(estados, p.uf, p.total); conta(cupons, p.cupom, p.desconto);
    if (p.forma === 'cartao') { conta(parcelas, `${p.parcelas}x`, p.total); conta(bandeiras, p.bandeira || 'não informada', p.total); }
  }
  const ord = (m: Map<string, NV>) => [...m.entries()].map(([k, x]) => ({k, ...x})).sort((a, b) => b.v - a.v || b.n - a.n);
  const porPedido = agrupar(e.itens, (i) => i.pedido_id);
  const ultimas = [...r.pedidos].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, 8)
    .map((p) => ({...p, produtos: (porPedido.get(p.id) ?? []).map((i) => i.nome.replace(/\s+-\s+1 unidade$/i, '')).join(', ')}));
  const pico = porHora.reduce((m, x) => (x.n > m.n ? x : m), porHora[0]);
  return {porHora, semana, estados: ord(estados), cupons: ord(cupons), parcelas: ord(parcelas), bandeiras: ord(bandeiras), ultimas, pico};
}

/** Desempenho por produto. Marketing: anúncio identificado pela UTM do pedido; o que sobra é rateado pela receita. */
export function ranking(r: Resumo, e: Entrada) {
  const porPedido = agrupar(e.itens, (i) => i.pedido_id);
  const linhas = new Map<string, {produto: string; nome: string; quantidade: number; receita: number; pagos: number; pendente: number; nPendente: number; custo: number; semCusto: boolean; tarifas: number; marketing: number; porAnuncio: Map<string, number>}>();
  const linha = (id: string, nome: string) => {
    if (!linhas.has(id)) linhas.set(id, {produto: id, nome: e.nomes.get(id) ?? nome.replace(/\s+-\s+1 unidade$/i, ''), quantidade: 0, receita: 0, pagos: 0, pendente: 0, nPendente: 0, custo: 0, semCusto: false, tarifas: 0, marketing: 0, porAnuncio: new Map()});
    return linhas.get(id)!;
  };
  const taxaVar = r.receita ? (r.checkout + r.imposto) / r.receita : 0;
  const receitaPorAnuncio = new Map<string, number>();
  for (const p of r.pedidos) {
    const its = itensDoPedido(p, porPedido, e.custos);
    for (const i of its) {
      const l = linha(i.produto, i.nome);
      if (p.status === 'pago') {
        l.quantidade += i.quantidade; l.receita += i.receita; l.pagos += 1; l.custo += i.custo; l.semCusto ||= i.semCusto;
        const share = p.total ? i.receita / p.total : 0;
        l.tarifas += share * taxaDoPedido(p, e.taxas) + i.receita * taxaVar;
        if (p.utm_content) {
          l.porAnuncio.set(p.utm_content, (l.porAnuncio.get(p.utm_content) ?? 0) + i.receita);
          receitaPorAnuncio.set(p.utm_content, (receitaPorAnuncio.get(p.utm_content) ?? 0) + i.receita);
        }
      } else if (p.status === 'pendente') { l.pendente += i.receita; l.nPendente += 1; }
    }
  }
  const gastoPorAnuncio = new Map<string, number>();
  for (const a of e.ads.filter((a) => a.data >= r.ini && a.data <= r.fim)) gastoPorAnuncio.set(a.anuncio_id, (gastoPorAnuncio.get(a.anuncio_id) ?? 0) + a.gasto);
  const fatorMeta = r.ads.facebook ? 1 + r.impostoMeta / r.ads.total : 1;
  let atribuido = 0;
  for (const l of linhas.values()) {
    for (const [ad, rec] of l.porAnuncio) {
      const gasto = gastoPorAnuncio.get(ad);
      if (gasto) { const parte = (gasto * rec) / receitaPorAnuncio.get(ad)!; l.marketing += parte; atribuido += parte; }
    }
  }
  const resto = Math.max(0, r.ads.total - atribuido);
  const out = [...linhas.values()].map((l) => {
    const marketing = (l.marketing + (r.receita ? (resto * l.receita) / r.receita : 0)) * fatorMeta;
    const lucro = l.receita - l.custo - marketing - l.tarifas;
    return {...l, marketing, lucro, margem: l.receita ? (lucro / l.receita) * 100 : 0, cpa: l.pagos ? marketing / l.pagos : null,
      conversao: l.pagos + l.nPendente ? (l.pagos / (l.pagos + l.nPendente)) * 100 : 0};
  });
  return out.filter((l) => l.receita > 0 || l.pendente > 0).sort((a, b) => b.lucro - a.lucro);
}

/** Conversão dia a dia: pedidos gerados que viraram pagos, por forma de pagamento. */
export function conversaoDiaria(e: Entrada, ini: string, fim: string, forma: string) {
  const ps = e.pedidos.filter((p) => p.dia >= ini && p.dia <= fim && (forma === 'todos' || p.forma === forma));
  const dias = agrupar(ps, (p) => p.dia);
  const total = {pago: nv(), naoPago: nv()};
  const linhas = diasEntre(ini, fim).filter((d) => dias.has(d)).map((d) => {
    const pago = nv(), naoPago = nv();
    for (const p of dias.get(d)!) {
      if (p.status === 'pago' || p.status === 'reembolsado') { soma(pago, p.total); soma(total.pago, p.total); }
      else { soma(naoPago, p.total); soma(total.naoPago, p.total); }
    }
    return {dia: d, pago, naoPago, taxa: (pago.n / (pago.n + naoPago.n)) * 100};
  });
  return {linhas, total};
}

/** DRE do mês pela data de compensação (pagamento), com as despesas lançadas. */
export function dreMes(e: Entrada, mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const ini = `${mes}-01`, fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const pagos = e.pedidos.filter((p) => p.status === 'pago' && p.dia_pago && p.dia_pago >= ini && p.dia_pago <= fim)
    .map((p) => ({...p, dia: p.dia_pago!}));
  const r = resumo({...e, pedidos: pagos}, ini, fim, true);
  const receitas = Object.fromEntries([...FORMAS, 'outro'].map((f) => [f, r.porForma[f]?.pago.v ?? 0]));
  const lancs = e.lancamentos.filter((l) => l.data >= ini && l.data <= fim && ehCategoria(l.categoria) && !AUTOMATICAS.has(l.categoria));
  const cat = (c: string) => lancs.filter((l) => l.categoria === c).reduce((s, l) => s + l.valor_centavos / 100, 0);
  const despesas = [
    ['Marketing (anúncios)', r.ads.total],
    ['Impostos sobre mídia (Meta)', r.impostoMeta],
    ['Custo de produtos', r.custo],
    ['Gateway', r.gateway],
    ['Plataforma e checkout', r.checkout],
    [r.impostoEstimado ? 'Imposto (DAS estimado)' : 'Imposto (DAS lançado)', r.imposto],
    ['Reembolsos', r.reembolsado + cat('devolucoes')], // reembolsos parciais de pedidos pagos no mês
    ['Despesas financeiras', cat('financeiras')],
    ['Despesas fixas', ['assinaturas', 'contador', 'pessoal', 'outras_fixas'].reduce((s, c) => s + cat(c), 0)],
    ['Outras variáveis', ['frete', 'embalagem', 'marketing_outros'].reduce((s, c) => s + cat(c), 0)],
    ['Regularização e enquadramento (pontual)', cat('regularizacao')],
  ] as [string, number][];
  const totalReceitas = r.pagos.v + cat('outras_receitas');
  const totalDespesas = despesas.reduce((s, [, v]) => s + v, 0);
  const lucro = totalReceitas - totalDespesas;
  const pontual = cat('regularizacao');
  return {mes, receitas, outrasReceitas: cat('outras_receitas'), totalReceitas, despesas, totalDespesas, lucro, pontual, lucroRecorrente: lucro + pontual,
    margem: totalReceitas ? (lucro / totalReceitas) * 100 : 0, roi: r.ads.total ? (lucro / r.ads.total) * 100 : null, semCusto: r.semCusto, resumo: r};
}

/** Dinheiro preso na Cartpanda: reserva de garantia (5% por 90 dias) e cartão ainda a liberar (D+2). */
export function caixaCartpanda(pagos: Pedido[], taxas: Taxa[], hoje: string, c: {reserva_pct: number; reserva_dias: number; prazo_cartao: number}) {
  const soma = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);
  let retida = 0, libera30 = 0, aLiberar = 0;
  const porMes = new Map<string, number>();
  for (const p of pagos) {
    if (!p.dia_pago) continue;
    const reserva = Math.round(p.total * c.reserva_pct) / 100;
    const volta = soma(p.dia_pago, c.reserva_dias);
    if (volta > hoje) {
      retida += reserva;
      if (volta <= soma(hoje, 30)) libera30 += reserva;
      porMes.set(volta.slice(0, 7), (porMes.get(volta.slice(0, 7)) ?? 0) + reserva);
    }
    if (p.forma === 'cartao' && soma(p.dia_pago, c.prazo_cartao) > hoje) aLiberar += p.total - taxaDoPedido(p, taxas) - reserva;
  }
  return {retida, libera30, aLiberar, porMes: [...porMes.entries()].sort()};
}

// Planos da Cartpanda (tabela de 26/10/2026): mensalidade + % de checkout sobre as vendas.
export const PLANOS_CARTPANDA = [
  {nome: 'Light', mensal: 4.99, pct: 2.5},
  {nome: 'Starter', mensal: 127, pct: 2},
  {nome: 'Premium', mensal: 597, pct: 1},
  {nome: 'Advanced', mensal: 1649, pct: 0.5},
];

/** Custo de cada plano para um faturamento mensal, o mais barato e a partir de quanto cada um passa a valer a pena. */
export function compararPlanos(faturamentoMes: number, atual = 'Light') {
  const custos = PLANOS_CARTPANDA.map((p) => ({...p, custo: p.mensal + (faturamentoMes * p.pct) / 100}));
  const melhor = custos.reduce((m, p) => (p.custo < m.custo ? p : m), custos[0]);
  const doAtual = custos.find((p) => p.nome === atual) ?? custos[0];
  // Faturamento em que o plano seguinte empata com o anterior.
  const viradas = PLANOS_CARTPANDA.slice(1).map((p, i) => {
    const ant = PLANOS_CARTPANDA[i];
    return {de: ant.nome, para: p.nome, faturamento: ((p.mensal - ant.mensal) / (ant.pct - p.pct)) * 100};
  });
  return {custos, melhor, economia: doAtual.custo - melhor.custo, viradas};
}

// ---------- Taxas do Cartpanda Pay ----------

export type ModeloTaxas = {pix_pct: number; boleto_fixo: number; base_pct: number; sem_juros: number; juros: Record<number, number>};

/**
 * Taxa de cada forma de pagamento. Cartão: taxa do prazo de recebimento (D+2 5,99%, D+5 5,49%, D+14 4,99%)
 * mais, só nas parcelas que a loja assume ("sem juros até Nx"), o juros daquela parcela. Não há taxa fixa por pedido.
 */
export function montarTaxas(m: ModeloTaxas): Taxa[] {
  const taxas: Taxa[] = [{forma: 'pix', parcelas: 1, pct: m.pix_pct, fixo: 0}, {forma: 'boleto', parcelas: 1, pct: 0, fixo: m.boleto_fixo}];
  for (let p = 1; p <= 12; p++) taxas.push({forma: 'cartao', parcelas: p, pct: +(m.base_pct + (p >= 2 && p <= m.sem_juros ? m.juros[p] ?? 0 : 0)).toFixed(2), fixo: 0});
  return taxas;
}

// ---------- Radar de custos ----------

type Juros = Record<number, number>;
const pagosDe = (pedidos: Pedido[]) => pedidos.filter((p) => p.status === 'pago');

/** Juros de parcelamento que a loja paga por oferecer "sem juros até Nx". */
export function jurosAbsorvidos(pedidos: Pedido[], juros: Juros, semJuros: number) {
  const por = new Map<number, {n: number; receita: number; custo: number}>();
  let valor = 0, receitaCartao = 0, receita = 0, nParcelados = 0;
  for (const p of pagosDe(pedidos)) {
    receita += p.total;
    if (p.forma !== 'cartao') continue;
    receitaCartao += p.total;
    if (p.parcelas < 2 || p.parcelas > semJuros) continue;
    const custo = (p.total * (juros[p.parcelas] ?? 0)) / 100;
    const x = por.get(p.parcelas) ?? {n: 0, receita: 0, custo: 0};
    x.n++; x.receita += p.total; x.custo += custo;
    por.set(p.parcelas, x);
    valor += custo; nParcelados++;
  }
  return {valor, receita, receitaCartao, nParcelados, pctReceita: receita ? (valor / receita) * 100 : 0, pctCartao: receitaCartao ? (valor / receitaCartao) * 100 : 0,
    porParcela: [...por.entries()].sort((a, b) => a[0] - b[0]).map(([parcelas, x]) => ({parcelas, ...x}))};
}

/** Quanto custaria, com os pedidos do período, oferecer sem juros até 1x, 2x... 12x (supondo que o volume não mude). */
export function simularSemJuros(pedidos: Pedido[], juros: Juros, atual: number) {
  const receitaPor = new Map<number, number>();
  for (const p of pagosDe(pedidos)) if (p.forma === 'cartao' && p.parcelas >= 2) receitaPor.set(p.parcelas, (receitaPor.get(p.parcelas) ?? 0) + p.total);
  const custoAte = (n: number) => [...receitaPor.entries()].filter(([p]) => p <= n).reduce((s, [p, v]) => s + (v * (juros[p] ?? 0)) / 100, 0);
  const custoAtual = custoAte(atual);
  return Array.from({length: 12}, (_, i) => i + 1).map((n) => ({ate: n, custo: custoAte(n), atual: n === atual, economiaVsAtual: custoAtual - custoAte(n)}));
}

/**
 * Prazo de recebimento do cartão: o que se economiza em taxa contra o dinheiro que passa a ficar parado mais dias.
 * `custoCapitalMes` é o custo do dinheiro em % ao mês (o que vocês pagariam para financiar esse capital).
 */
export function compararPrazos(receitaCartaoMes: number, prazos: {dias: number; pct: number}[], atual: number, custoCapitalMes: number) {
  const base = prazos.find((p) => p.dias === atual) ?? prazos[0];
  return [...prazos].sort((a, b) => a.dias - b.dias).map((p) => {
    const extra = Math.max(0, p.dias - base.dias);
    const economia = (receitaCartaoMes * (base.pct - p.pct)) / 100;
    const capital = (receitaCartaoMes / 30) * extra;
    const custoCapital = (capital * custoCapitalMes) / 100;
    return {dias: p.dias, pct: p.pct, atual: p.dias === base.dias, custoTaxa: (receitaCartaoMes * p.pct) / 100, economia, capital, custoCapital, liquido: economia - custoCapital, retorno: capital > 0 ? (economia / capital) * 100 : null};
  });
}

/** Quanto custa o cartão (com os juros que a loja assume) contra o Pix, e o desconto no Pix que ainda compensa. */
export function pixVsCartao(pedidos: Pedido[], taxas: Taxa[]) {
  const pagos = pagosDe(pedidos);
  const cartao = pagos.filter((p) => p.forma === 'cartao'), pix = pagos.filter((p) => p.forma === 'pix');
  const rc = cartao.reduce((s, p) => s + p.total, 0), tc = cartao.reduce((s, p) => s + taxaDoPedido(p, taxas), 0);
  const pctCartao = rc ? (tc / rc) * 100 : 0;
  const pctPix = taxas.find((t) => t.forma === 'pix')?.pct ?? 0;
  const total = pagos.length;
  return {pctCartao, pctPix, descontoMax: Math.max(0, pctCartao - pctPix), nCartao: cartao.length, nPix: pix.length, shareCartao: total ? (cartao.length / total) * 100 : 0,
    ticketCartao: cartao.length ? rc / cartao.length : 0, economiaPorPedido: cartao.length ? ((rc / cartao.length) * (pctCartao - pctPix)) / 100 : 0};
}

/** Taxa de pagamento (gateway + checkout) sobre a receita, semana a semana, e se ela subiu nas últimas 4 semanas. */
export function taxaEfetivaSemanal(e: Entrada, fim: string, semanas = 8) {
  const dia = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);
  const serie = Array.from({length: semanas}, (_, i) => {
    const f = dia(fim, -7 * (semanas - 1 - i)), ini = dia(f, -6);
    const r = resumo(e, ini, f);
    return {ini, fim: f, n: r.pagos.n, receita: r.receita, gateway: r.gateway, checkout: r.checkout, pct: r.receita ? ((r.gateway + r.checkout) / r.receita) * 100 : 0};
  });
  const media = (xs: typeof serie) => { const rec = xs.reduce((s, x) => s + x.receita, 0); return rec ? (xs.reduce((s, x) => s + x.gateway + x.checkout, 0) / rec) * 100 : 0; };
  const recentes = serie.slice(-4), anteriores = serie.slice(-8, -4);
  const pedidos = (xs: typeof serie) => xs.reduce((s, x) => s + x.n, 0);
  // Só compara com pelo menos 20 pedidos pagos de cada lado: com poucos pedidos a média não diz nada.
  const comparavel = pedidos(recentes) >= 20 && pedidos(anteriores) >= 20;
  return {serie, recente: media(recentes), anterior: media(anteriores), variacao: comparavel ? media(recentes) - media(anteriores) : null};
}

/** Alíquota efetiva do Simples Nacional, Anexo I (comércio), pela receita bruta dos últimos 12 meses. */
export const FAIXAS_ANEXO_I = [
  {ate: 180_000, nominal: 4, deducao: 0},
  {ate: 360_000, nominal: 7.3, deducao: 5_940},
  {ate: 720_000, nominal: 9.5, deducao: 13_860},
  {ate: 1_800_000, nominal: 10.7, deducao: 22_500},
  {ate: 3_600_000, nominal: 14.3, deducao: 87_300},
  {ate: 4_800_000, nominal: 19, deducao: 378_000},
];

export function dasAnexoI(rbt12: number) {
  const i = FAIXAS_ANEXO_I.findIndex((f) => rbt12 <= f.ate);
  const f = FAIXAS_ANEXO_I[i < 0 ? FAIXAS_ANEXO_I.length - 1 : i];
  // (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, em %.
  const efetiva = rbt12 > 0 ? Math.max(0, ((rbt12 * f.nominal) / 100 - f.deducao) / rbt12) * 100 : f.nominal;
  return {faixa: (i < 0 ? FAIXAS_ANEXO_I.length : i + 1), nominal: f.nominal, efetiva: rbt12 > 0 ? efetiva : f.nominal};
}

export type CfgRadar = {juros: Juros; sem_juros: number; prazos: {dias: number; pct: number}[]; prazo_atual: number; custo_capital_mes: number; rbt12: number; das_pct: number; taxa_repasse: number};

/** Tudo do radar de custos para uma janela (normalmente os últimos 30 dias). */
export function radarCustos(e: Entrada, ini: string, fim: string, c: CfgRadar) {
  const r = resumo(e, ini, fim);
  const pagos = pagosDe(r.pedidos);
  const dias = diasEntre(ini, fim).length;
  const juros = jurosAbsorvidos(r.pedidos, c.juros, c.sem_juros);
  const receitaCartao = juros.receitaCartao;
  // Contribuição de um pedido extra: o que sobra do pedido antes dos anúncios, sem os juros (que se somam à parte).
  const contribuicao = pagos.length ? (r.receita - r.custo - r.checkout - (r.gateway - juros.valor) - r.imposto) / pagos.length : 0;
  const jurosMedio = juros.nParcelados ? juros.valor / juros.nParcelados : 0;
  const margemExtra = contribuicao - jurosMedio;
  const simulacao = simularSemJuros(r.pedidos, c.juros, c.sem_juros).map((x) => ({...x, pedidosParaEquilibrar: margemExtra > 0 ? x.custo / margemExtra : null}));
  const prazos = compararPrazos(receitaCartao * (30 / dias), c.prazos, c.prazo_atual, c.custo_capital_mes);
  const pix = pixVsCartao(r.pedidos, e.taxas);
  const anual = (r.receita * 365) / dias;
  const rbtUsado = c.rbt12 > 0 ? c.rbt12 : anual;
  const das = dasAnexoI(rbtUsado);
  const diasComVenda = new Set(pagos.map((p) => p.dia_pago)).size;
  return {
    r, dias, juros, simulacao, prazos, pix, margemExtra, contribuicao,
    taxaTotalPct: r.receita ? ((r.gateway + r.checkout) / r.receita) * 100 : 0,
    taxaGatewayPct: r.receita ? (r.gateway / r.receita) * 100 : 0,
    das: {...das, rbt: rbtUsado, anualizado: c.rbt12 <= 0, configurado: c.das_pct},
    repasse: {diasComVenda, custoMaximo: diasComVenda * c.taxa_repasse},
  };
}
export type Radar = ReturnType<typeof radarCustos>;
