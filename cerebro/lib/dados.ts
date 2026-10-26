// Leituras do banco usadas pelas telas e pelo conector MCP.
import {db} from './db';
import {dre, precificar, taxaMedia, avaliarAnuncio, type Config, type Forma, type Produto, type Lancamento} from './calc';

export function lerConfig(): Config & {taxas_exemplo: number} {
  const rows = db().prepare('SELECT chave, valor FROM config').all() as {chave: string; valor: number}[];
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {das_pct: c.das_pct ?? 0, plataforma_pct: c.plataforma_pct ?? 0, meta_imposto_pct: c.meta_imposto_pct ?? 0, cpa_alvo_padrao: c.cpa_alvo_padrao ?? 0, taxas_exemplo: c.taxas_exemplo ?? 0};
}

// O SQLite do Node devolve objetos sem protótipo; as telas precisam de objetos simples.
const simples = <T,>(linhas: unknown[]) => linhas.map((l) => ({...(l as object)})) as T[];

export const lerFormas = () => simples<Forma>(db().prepare('SELECT id, nome, taxa_pct, mix_pct FROM formas_pagamento ORDER BY ordem, id').all());
export const lerProdutos = () => simples<Produto>(db().prepare('SELECT * FROM produtos WHERE ativo = 1 ORDER BY id').all());

export type Plano = {id: number; servico: string; plano: string; custo_mensal: number; taxa_pct: number; gatilho_pedidos: number; proximo: string; obs: string};
export const lerPlanos = () => db().prepare('SELECT * FROM planos ORDER BY id').all() as Plano[];

export const mesAtual = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'}).slice(0, 7);
export const hoje = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'});

export function lancamentosDoMes(mes: string) {
  return db().prepare("SELECT * FROM lancamentos WHERE substr(data, 1, 7) = ? ORDER BY data DESC, id DESC").all(mes) as Lancamento[];
}

export function resumoMes(mes: string) {
  return dre(lancamentosDoMes(mes));
}

/** Produto de referência das regras da esteira: o primeiro ativo. */
export function referenciaCampanhas() {
  const cfg = lerConfig(), formas = lerFormas();
  const p = lerProdutos()[0];
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
    const falta = p.gatilho_pedidos - r.pedidos;
    if (falta <= 0) out.push({nivel: 'a', texto: `${p.servico}: ${r.pedidos} pedidos no mês passaram do gatilho de ${p.gatilho_pedidos}. Hora de avaliar ${p.proximo || 'outro plano'}.`, onde: 'taxas e planos'});
    else if (falta <= p.gatilho_pedidos * 0.2) out.push({nivel: 'w', texto: `${p.servico}: faltam ${falta} pedidos para o gatilho que reavalia o plano.`, onde: 'taxas e planos'});
  }
  if (cfg.taxas_exemplo) out.push({nivel: 'w', texto: 'As taxas de pagamento ainda são de exemplo. Troque pelas reais da Cartpanda Pay para a precificação valer.', onde: 'taxas e planos'});
  if (lerProdutos().some((p) => p.exemplo)) out.push({nivel: 'w', texto: 'Há produto com valores de exemplo. Confira custo, frete e preço.', onde: 'precificação'});
  const {somaMix} = taxaMedia(lerFormas());
  if (Math.abs(somaMix - 100) > 0.5) out.push({nivel: 'w', texto: `O mix de formas de pagamento soma ${somaMix}%, não 100%.`, onde: 'taxas e planos'});
  if (r.grupos.receita > 0 && !r.porCategoria.das) out.push({nivel: 'a', texto: `DAS estimado do mês: ${(r.grupos.receita * cfg.das_pct / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} (${cfg.das_pct}% da receita). Ainda não lançado.`, onde: 'financeiro'});
  const u = ultimaImportacao();
  if (u) {
    const pausar = u.ads.filter((a) => a.etapa === 'pausar').length, escalar = u.ads.filter((a) => a.etapa === 'escala').length;
    if (pausar) out.push({nivel: 'b', texto: `${pausar} anúncio(s) para pausar na última importação da Meta.`, onde: 'campanhas'});
    if (escalar) out.push({nivel: 'g', texto: `${escalar} anúncio(s) prontos para escalar.`, onde: 'campanhas'});
  }
  return out;
}
