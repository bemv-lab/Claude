// Gasto e funil diários por anúncio, direto da API de Marketing da Meta.
import {db} from './db';

export type AdDia = {
  data: string; plataforma: string; anuncio_id: string; anuncio: string; campanha_id: string; campanha: string; conjunto_id: string; conjunto: string;
  gasto: number; impressoes: number; cliques: number; views: number; carrinho: number; checkout: number; compras: number; valor_compras: number;
};

type Acao = {action_type: string; value: string};
export type LinhaInsights = {
  date_start: string; ad_id: string; ad_name?: string; adset_id?: string; adset_name?: string; campaign_id?: string; campaign_name?: string;
  spend?: string; impressions?: string; inline_link_clicks?: string; actions?: Acao[]; action_values?: Acao[];
};

// Ordem de preferência: o primeiro tipo de ação que existir na linha vence.
const TIPOS = {
  views: ['landing_page_view', 'view_content', 'offsite_conversion.fb_pixel_view_content'],
  carrinho: ['add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  checkout: ['initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
  compras: ['purchase', 'offsite_conversion.fb_pixel_purchase'],
};
const pega = (lista: Acao[] | undefined, tipos: string[]) => {
  for (const t of tipos) {
    const a = lista?.find((x) => x.action_type === t);
    if (a) return parseFloat(a.value) || 0;
  }
  return 0;
};

export function mapearInsights(l: LinhaInsights): AdDia {
  return {
    data: l.date_start, plataforma: 'facebook', anuncio_id: l.ad_id, anuncio: l.ad_name ?? '',
    campanha_id: l.campaign_id ?? '', campanha: l.campaign_name ?? '', conjunto_id: l.adset_id ?? '', conjunto: l.adset_name ?? '',
    gasto: parseFloat(l.spend ?? '0') || 0, impressoes: parseInt(l.impressions ?? '0') || 0, cliques: parseInt(l.inline_link_clicks ?? '0') || 0,
    views: pega(l.actions, TIPOS.views), carrinho: pega(l.actions, TIPOS.carrinho), checkout: pega(l.actions, TIPOS.checkout),
    compras: pega(l.actions, TIPOS.compras), valor_compras: pega(l.action_values, TIPOS.compras),
  };
}

export function gravarAds(linhas: AdDia[]) {
  const d = db();
  const cols = ['data', 'plataforma', 'anuncio_id', 'anuncio', 'campanha_id', 'campanha', 'conjunto_id', 'conjunto', 'gasto', 'impressoes', 'cliques', 'views', 'carrinho', 'checkout', 'compras', 'valor_compras'] as const;
  const up = d.prepare(`INSERT INTO ads_dia (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
    ON CONFLICT(data, plataforma, anuncio_id) DO UPDATE SET ${cols.slice(3).map((c) => `${c} = excluded.${c}`).join(', ')}`);
  d.exec('BEGIN');
  try {
    for (const l of linhas) up.run(...cols.map((c) => l[c]));
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return linhas.length;
}

/** Busca os últimos `dias` dias (a Meta ajusta números recentes; regravar é seguro). */
export async function sincronizarMeta(dias = 3) {
  const token = process.env.META_TOKEN, conta = process.env.META_CONTA;
  if (!token || !conta) return {ok: false, msg: 'Meta: defina META_TOKEN e META_CONTA (uma ou mais contas, separadas por vírgula) no .env.'};
  const hoje = new Date(Date.now() - 3 * 3600_000);
  const ini = new Date(hoje.getTime() - (dias - 1) * 86400_000);
  const p = new URLSearchParams({
    level: 'ad', time_increment: '1', limit: '500', access_token: token,
    time_range: JSON.stringify({since: ini.toISOString().slice(0, 10), until: hoje.toISOString().slice(0, 10)}),
    fields: 'date_start,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values',
  });
  // A Rocco anuncia por mais de uma conta (C01, C02...): todas somam no mesmo financeiro.
  let total = 0;
  const erros: string[] = [];
  for (const c of conta.split(',').map((x) => x.trim()).filter(Boolean)) {
    let url: string | null = `https://graph.facebook.com/v23.0/${c.startsWith('act_') ? c : `act_${c}`}/insights?${p}`;
    while (url) {
      const r = await fetch(url);
      const j = (await r.json()) as {data?: LinhaInsights[]; paging?: {next?: string}; error?: {message: string}};
      if (!r.ok || !j.data) { erros.push(`${c}: ${j.error?.message ?? r.status}`); break; }
      total += gravarAds(j.data.map(mapearInsights));
      url = j.paging?.next ?? null;
    }
  }
  return {ok: !erros.length, msg: `Meta: ${total} linhas de anúncio por dia.${erros.length ? ` Erros: ${erros.join('; ')}` : ''}`};
}
