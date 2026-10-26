// Leitor do CSV exportado do Gerenciador de Anúncios (português ou inglês, vírgula ou ponto e vírgula).
import {lerNumero} from './calc';

export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let campo = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Para cada campo, nomes de coluna aceitos (o primeiro que existir no arquivo vence).
const COLUNAS: Record<string, string[]> = {
  anuncio: ['nome do anuncio', 'ad name', 'anuncio'],
  conjunto: ['nome do conjunto de anuncios', 'ad set name'],
  campanha: ['nome da campanha', 'campaign name'],
  gasto: ['valor usado (brl)', 'amount spent (brl)', 'valor usado', 'amount spent'],
  compras: ['compras', 'purchases', 'resultados', 'results'],
  receita: ['valor de conversao de compras', 'purchases conversion value', 'valor de conversao das compras'],
  impressoes: ['impressoes', 'impressions'],
  cliques: ['cliques no link', 'link clicks'],
  inicio: ['inicio dos relatorios', 'reporting starts'],
  fim: ['termino dos relatorios', 'reporting ends'],
};

export function lerExportMeta(texto: string) {
  const linhas = parseCsv(texto);
  if (linhas.length < 2) throw new Error('O arquivo não tem linhas de dados.');
  const cab = linhas[0].map(norm);
  const idx: Record<string, number> = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    for (const n of nomes) {
      const i = cab.findIndex((h) => h === n || h.startsWith(n));
      if (i >= 0) { idx[campo] = i; break; }
    }
  }
  const nomeCol = idx.anuncio ?? idx.conjunto ?? idx.campanha;
  if (nomeCol === undefined || idx.gasto === undefined) throw new Error('Não achei as colunas de nome do anúncio e de valor usado. Exporte do Gerenciador no nível de anúncio.');
  const v = (l: string[], c: string) => (idx[c] === undefined ? '' : (l[idx[c]] ?? '').trim());
  const ads = linhas.slice(1)
    .filter((l) => (l[nomeCol] ?? '').trim())
    .map((l) => ({
      anuncio: (l[nomeCol] ?? '').trim(),
      conjunto: v(l, 'conjunto'),
      campanha: v(l, 'campanha'),
      gasto: lerNumero(v(l, 'gasto')),
      compras: Math.round(lerNumero(v(l, 'compras'))),
      receita: lerNumero(v(l, 'receita')),
      impressoes: Math.round(lerNumero(v(l, 'impressoes'))),
      cliques: Math.round(lerNumero(v(l, 'cliques'))),
    }));
  const l1 = linhas[1];
  const periodo = [v(l1, 'inicio'), v(l1, 'fim')].filter(Boolean).join(' a ');
  return {ads, periodo};
}
