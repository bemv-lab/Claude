// Regras de dinheiro da Rocco. Funções puras: usadas pelas telas, pelo conector MCP e pelos testes.

export type Config = {
  das_pct: number; // alíquota efetiva do Simples sobre a receita
  plataforma_pct: number; // taxa da plataforma de vendas por pedido
  meta_imposto_pct: number; // PIS/Cofins + ISS que a Meta soma ao gasto do Gerenciador
  cpa_alvo_padrao: number;
  cotacao_dolar?: number; // R$ por US$, para produtos com custo em dólar
};

export type Forma = {id: number; nome: string; taxa_pct: number; mix_pct: number};

export type Produto = {
  id: number;
  nome: string;
  preco: number;
  custo: number;
  custo_usd?: number; // custo em dólar (produto importado); vale no lugar de `custo` quando há cotação
  frete: number;
  embalagem: number;
  outros: number;
  cpa_alvo: number;
  exemplo: number;
  shopify_id?: string | null;
  imagem?: string;
};

/** Taxa média de pagamento, ponderada pelo que os clientes escolhem de fato. */
export function taxaMedia(formas: Forma[]) {
  const somaMix = formas.reduce((s, f) => s + f.mix_pct, 0);
  if (somaMix <= 0) return {taxa: 0, somaMix};
  const taxa = formas.reduce((s, f) => s + f.mix_pct * f.taxa_pct, 0) / somaMix;
  return {taxa, somaMix};
}

/** Custo unitário em reais: o custo em dólar vale quando há cotação; sem cotação, o produto fica sem custo. */
export function custoProduto(p: {custo: number; custo_usd?: number}, cotacao = 0) {
  return p.custo_usd && p.custo_usd > 0 ? p.custo_usd * cotacao : p.custo;
}

export function precificar(p: Produto, cfg: Config, formas: Forma[]) {
  const {taxa} = taxaMedia(formas);
  const meta = cfg.meta_imposto_pct / 100;
  const custo = custoProduto(p, cfg.cotacao_dolar);
  const das = (p.preco * cfg.das_pct) / 100;
  const pagamento = (p.preco * taxa) / 100;
  const plataforma = (p.preco * cfg.plataforma_pct) / 100;
  const mc = p.preco - custo - p.frete - p.embalagem - p.outros - das - pagamento - plataforma;
  const cpaAlvo = p.cpa_alvo || cfg.cpa_alvo_padrao;
  // O Gerenciador mostra o gasto sem imposto; a fatura cobra gasto × (1 + meta).
  const cpaMax = mc > 0 ? mc / (1 + meta) : 0;
  const roasBE = cpaMax > 0 ? p.preco / cpaMax : Infinity;
  const midiaReal = cpaAlvo * (1 + meta);
  const lucro = mc - midiaReal;
  const linhas: [string, number][] = [
    ['Preço de venda', p.preco],
    ['Custo do produto', -custo],
    ['Frete pago pela loja', -p.frete],
    ['Embalagem e brinde', -p.embalagem],
    ['Outros custos por pedido', -p.outros],
    [`DAS (${fmtPct(cfg.das_pct)})`, -das],
    [`Pagamento, média (${fmtPct(taxa)})`, -pagamento],
    [`Plataforma (${fmtPct(cfg.plataforma_pct)})`, -plataforma],
  ];
  return {
    taxaPagamento: taxa,
    mc,
    mcPct: p.preco ? (mc / p.preco) * 100 : 0,
    cpaAlvo,
    cpaMax,
    roasBE,
    midiaReal,
    impostoMidia: midiaReal - cpaAlvo,
    lucro,
    lucroPct: p.preco ? (lucro / p.preco) * 100 : 0,
    linhas,
  };
}

/** Preço mínimo para atingir uma margem líquida alvo (% do preço) no CPA alvo. */
export function precoParaMargem(p: Produto, cfg: Config, formas: Forma[], margemAlvoPct: number) {
  const {taxa} = taxaMedia(formas);
  const varPct = (cfg.das_pct + taxa + cfg.plataforma_pct + margemAlvoPct) / 100;
  const fixos = custoProduto(p, cfg.cotacao_dolar) + p.frete + p.embalagem + p.outros + (p.cpa_alvo || cfg.cpa_alvo_padrao) * (1 + cfg.meta_imposto_pct / 100);
  return varPct < 1 ? fixos / (1 - varPct) : Infinity;
}

// ---------- Esteira de testes ----------

export type Etapa = 'teste' | 'validacao' | 'escala' | 'pausar';
export type Ref = {cpaMax: number; cpaAlvo: number; roasBE: number; metaPct: number};

export function avaliarAnuncio(a: {gasto: number; compras: number; receita: number}, ref: Ref): {etapa: Etapa; motivo: string; cpa: number | null; roas: number | null; roasReal: number | null} {
  const cpa = a.compras > 0 ? a.gasto / a.compras : null;
  const roas = a.gasto > 0 ? a.receita / a.gasto : null;
  const roasReal = roas === null ? null : roas / (1 + ref.metaPct / 100);
  const base = {cpa, roas, roasReal};
  if (a.compras === 0) {
    if (a.gasto >= ref.cpaMax) return {...base, etapa: 'pausar', motivo: `Gastou ${fmtBRL(a.gasto)}, mais que o CPA máximo (${fmtBRL(ref.cpaMax)}), sem venda.`};
    return {...base, etapa: 'teste', motivo: `Em teste: ${fmtBRL(a.gasto)} de ${fmtBRL(ref.cpaMax)} antes de decidir.`};
  }
  if (cpa! > ref.cpaMax) return {...base, etapa: 'pausar', motivo: `CPA ${fmtBRL(cpa!)} acima do máximo (${fmtBRL(ref.cpaMax)}): cada venda dá prejuízo.`};
  if (a.compras < 3) return {...base, etapa: 'validacao', motivo: `${a.compras} de 3 vendas para validar, CPA dentro do limite.`};
  if (cpa! <= ref.cpaAlvo && (roas ?? 0) >= ref.roasBE) return {...base, etapa: 'escala', motivo: `${a.compras} vendas com CPA ${fmtBRL(cpa!)} (alvo ${fmtBRL(ref.cpaAlvo)}). Pode subir 20% a cada 48 h.`};
  return {...base, etapa: 'validacao', motivo: `Lucrativo, mas CPA ${fmtBRL(cpa!)} acima do alvo (${fmtBRL(ref.cpaAlvo)}). Observar antes de escalar.`};
}

// ---------- DRE (Simples Nacional, comércio) ----------

export const CATEGORIAS = {
  receita_vendas: {nome: 'Vendas de produtos', grupo: 'receita'},
  outras_receitas: {nome: 'Outras receitas', grupo: 'outras'},
  das: {nome: 'DAS (Simples Nacional)', grupo: 'deducoes'},
  devolucoes: {nome: 'Devoluções e estornos', grupo: 'deducoes'},
  cmv: {nome: 'Custo dos produtos vendidos', grupo: 'cmv'},
  taxa_pagamento: {nome: 'Taxas de pagamento', grupo: 'variaveis'},
  plataforma: {nome: 'Plataforma de vendas', grupo: 'variaveis'},
  frete: {nome: 'Frete', grupo: 'variaveis'},
  embalagem: {nome: 'Embalagem e brindes', grupo: 'variaveis'},
  midia: {nome: 'Mídia paga', grupo: 'marketing'},
  imposto_midia: {nome: 'Impostos sobre mídia (Meta)', grupo: 'marketing'},
  marketing_outros: {nome: 'Criativos e ferramentas de marketing', grupo: 'marketing'},
  assinaturas: {nome: 'Assinaturas e apps', grupo: 'fixas'},
  contador: {nome: 'Contabilidade', grupo: 'fixas'},
  pessoal: {nome: 'Pró-labore e pessoal', grupo: 'fixas'},
  outras_fixas: {nome: 'Outras despesas fixas', grupo: 'fixas'},
  financeiras: {nome: 'Tarifas e juros', grupo: 'financeiras'},
  regularizacao: {nome: 'Regularização e enquadramento (pontual)', grupo: 'pontual'},
} as const;
export type Categoria = keyof typeof CATEGORIAS;
export const ehCategoria = (c: string): c is Categoria => c in CATEGORIAS;

export type Lancamento = {id: number; data: string; categoria: string; descricao: string; valor_centavos: number; pedidos: number; origem: string; pago?: number; recorrente?: number};

export function dre(lancs: Lancamento[]) {
  const g: Record<string, number> = {receita: 0, outras: 0, deducoes: 0, cmv: 0, variaveis: 0, marketing: 0, fixas: 0, financeiras: 0, pontual: 0};
  const porCategoria: Record<string, number> = {};
  let pedidos = 0;
  for (const l of lancs) {
    if (!ehCategoria(l.categoria)) continue;
    const v = l.valor_centavos / 100;
    g[CATEGORIAS[l.categoria].grupo] += v;
    porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + v;
    if (l.categoria === 'receita_vendas') pedidos += l.pedidos;
  }
  const receitaLiquida = g.receita - g.deducoes;
  const lucroBruto = receitaLiquida - g.cmv;
  const margemContribuicao = lucroBruto - g.variaveis - g.marketing;
  const resultado = margemContribuicao - g.fixas - g.financeiras - g.pontual + g.outras;
  const midiaTotal = (porCategoria.midia ?? 0) + (porCategoria.imposto_midia ?? 0);
  return {
    grupos: g,
    porCategoria,
    pedidos,
    ticketMedio: pedidos ? g.receita / pedidos : 0,
    receitaLiquida,
    lucroBruto,
    margemContribuicao,
    resultado,
    margemLiquidaPct: g.receita ? (resultado / g.receita) * 100 : 0,
    roasReal: midiaTotal ? g.receita / midiaTotal : null,
    midiaTotal,
  };
}

// ---------- Formatação e leitura de números ----------

export const fmtBRL = (v: number) => v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
export const fmtPct = (v: number) => v.toLocaleString('pt-BR', {maximumFractionDigits: 2}) + '%';
export const fmtNum = (v: number, casas = 2) => (isFinite(v) ? v.toLocaleString('pt-BR', {maximumFractionDigits: casas}) : '–');

/** Lê "1.234,56", "1234.56", "R$ 82,15" ou "82.15". */
export function lerNumero(s: string | null | undefined): number {
  if (s == null) return 0;
  let t = String(s).replace(/[^\d,.\-]/g, '');
  if (!t) return 0;
  const virg = t.lastIndexOf(','), ponto = t.lastIndexOf('.');
  if (virg > -1 && ponto > -1) t = virg > ponto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (virg > -1) t = t.replace(',', '.');
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}
