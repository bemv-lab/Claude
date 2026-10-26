// Leituras do banco usadas pelas telas e pelo conector MCP.
import {db} from './db';
import {precificar, avaliarAnuncio, type Config, type Forma, type Produto, type Lancamento} from './calc';
import {resumo, caixaCartpanda, compararPlanos, type Entrada, type Taxa, NOME_FORMA} from './financeiro';
import type {Pedido, Item} from './shopify';
import type {AdDia} from './meta';
import {lancamentosDoBanco, type MovBanco} from './banco';

export function lerConfig(): Config & {meta_mes: number; gateway_exemplo: number; reserva_pct: number; reserva_dias: number; prazo_cartao: number} {
  const rows = db().prepare('SELECT chave, valor FROM config').all() as {chave: string; valor: number}[];
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {das_pct: c.das_pct ?? 0, plataforma_pct: c.plataforma_pct ?? 0, meta_imposto_pct: c.meta_imposto_pct ?? 0, cpa_alvo_padrao: c.cpa_alvo_padrao ?? 0,
    meta_mes: c.meta_mes ?? 0, gateway_exemplo: c.gateway_exemplo ?? 0,
    reserva_pct: c.reserva_pct ?? 5, reserva_dias: c.reserva_dias ?? 90, prazo_cartao: c.prazo_cartao ?? 2};
}

// O SQLite do Node devolve objetos sem protótipo; as telas precisam de objetos simples.
const simples = <T,>(linhas: unknown[]) => linhas.map((l) => ({...(l as object)})) as T[];

export const lerTaxas = () => simples<Taxa>(db().prepare("SELECT * FROM taxas_gateway ORDER BY CASE forma WHEN 'pix' THEN 0 WHEN 'boleto' THEN 1 ELSE 2 END, parcelas").all());

/** Mix real de pagamento dos últimos 90 dias (pedidos pagos), com a taxa de cada forma e parcela. Alimenta a precificação. */
export function lerFormas(): Forma[] {
  const taxas = lerTaxas();
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
export const lerProdutos = () => simples<Produto>(db().prepare('SELECT * FROM produtos WHERE ativo = 1 ORDER BY id').all());

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
  const prods = d.prepare('SELECT shopify_id, nome, custo FROM produtos WHERE shopify_id IS NOT NULL').all() as {shopify_id: string; nome: string; custo: number}[];
  const cfg = lerConfig();
  return {
    pedidos, itens, ads, lancamentos, taxas: lerTaxas(),
    custos: new Map(prods.filter((p) => p.custo > 0).map((p) => [p.shopify_id, p.custo])),
    nomes: new Map(prods.map((p) => [p.shopify_id, p.nome])),
    cfg: {checkout_pct: cfg.plataforma_pct, das_pct: cfg.das_pct, meta_imposto_pct: cfg.meta_imposto_pct},
  };
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
  if (r.receita > 0 && r.impostoEstimado && cfg.das_pct) out.push({nivel: 'a', texto: `DAS estimado do mês: ${(r.imposto).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} (${cfg.das_pct}% da receita). Lance a guia quando pagar.`, onde: 'financeiro'});
  const plano = planoCartpanda();
  if (plano.cmp.economia > 1) out.push({nivel: 'a', texto: `Cartpanda: com ${plano.fat30.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} de vendas nos últimos 30 dias, o plano ${plano.cmp.melhor.nome} sairia ${plano.cmp.economia.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} mais barato por mês que o ${plano.atual}.`, onde: 'taxas e planos'});
  else {
    const prox = plano.cmp.viradas.find((v) => v.de === plano.atual);
    if (prox && plano.fat30 >= prox.faturamento * 0.85) out.push({nivel: 'w', texto: `Cartpanda: faltam ${(prox.faturamento - plano.fat30).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} de vendas em 30 dias para o ${prox.para} valer mais que o ${plano.atual}.`, onde: 'taxas e planos'});
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
