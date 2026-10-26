// Testes das regras de dinheiro: npm run testar
import assert from 'node:assert/strict';
import {precificar, precoParaMargem, avaliarAnuncio, dre, taxaMedia, lerNumero, type Produto, type Config, type Forma} from '../lib/calc';
import {lerExportMeta} from '../lib/csv';

const cfg: Config = {das_pct: 4, plataforma_pct: 2.5, meta_imposto_pct: 13.83, cpa_alvo_padrao: 55};
const formas: Forma[] = [
  {id: 1, nome: 'Pix', taxa_pct: 0.99, mix_pct: 35}, {id: 2, nome: '1x', taxa_pct: 4.99, mix_pct: 15},
  {id: 3, nome: '2-6x', taxa_pct: 9.5, mix_pct: 25}, {id: 4, nome: '7-10x', taxa_pct: 14.5, mix_pct: 25},
];
const p: Produto = {id: 1, nome: 'Pasta', preco: 197, custo: 58, frete: 12, embalagem: 6, outros: 0, cpa_alvo: 55, exemplo: 0};
const perto = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

perto(taxaMedia(formas).taxa, 7.095);
const r = precificar(p, cfg, formas);
// 197 − 58 − 12 − 6 − 7,88 (DAS) − 13,977 (pagamento) − 4,925 (plataforma)
perto(r.mc, 94.218);
perto(r.cpaMax, 94.218 / 1.1383);
perto(r.lucro, 94.218 - 55 * 1.1383);
// Preço para margem: no preço sugerido, o lucro tem de ser exatamente a margem pedida.
const ps = precoParaMargem(p, cfg, formas, 15);
perto(precificar({...p, preco: ps}, cfg, formas).lucroPct, 15);

const ref = {cpaMax: r.cpaMax, cpaAlvo: 55, roasBE: r.roasBE, metaPct: 13.83};
assert.equal(avaliarAnuncio({gasto: 90, compras: 0, receita: 0}, ref).etapa, 'pausar');
assert.equal(avaliarAnuncio({gasto: 30, compras: 0, receita: 0}, ref).etapa, 'teste');
assert.equal(avaliarAnuncio({gasto: 60, compras: 1, receita: 197}, ref).etapa, 'validacao');
assert.equal(avaliarAnuncio({gasto: 141, compras: 3, receita: 591}, ref).etapa, 'escala');
assert.equal(avaliarAnuncio({gasto: 270, compras: 3, receita: 591}, ref).etapa, 'pausar');

const d = dre([
  {id: 1, data: '2026-10-01', categoria: 'receita_vendas', descricao: '', valor_centavos: 1000000, pedidos: 50, origem: ''},
  {id: 2, data: '2026-10-01', categoria: 'das', descricao: '', valor_centavos: 40000, pedidos: 0, origem: ''},
  {id: 3, data: '2026-10-01', categoria: 'cmv', descricao: '', valor_centavos: 290000, pedidos: 0, origem: ''},
  {id: 4, data: '2026-10-01', categoria: 'midia', descricao: '', valor_centavos: 300000, pedidos: 0, origem: ''},
  {id: 5, data: '2026-10-01', categoria: 'imposto_midia', descricao: '', valor_centavos: 41490, pedidos: 0, origem: ''},
  {id: 6, data: '2026-10-01', categoria: 'contador', descricao: '', valor_centavos: 30000, pedidos: 0, origem: ''},
]);
perto(d.resultado, 10000 - 400 - 2900 - 3000 - 414.9 - 300);
perto(d.ticketMedio, 200);
perto(d.roasReal!, 10000 / 3414.9);

assert.equal(lerNumero('1.234,56'), 1234.56);
assert.equal(lerNumero('1,234.56'), 1234.56);
assert.equal(lerNumero('R$ 82,15'), 82.15);
assert.equal(lerNumero('82.15'), 82.15);

const csv = '﻿Início dos relatórios,Término dos relatórios,Nome do anúncio,Valor usado (BRL),Compras,Valor de conversão de compras\n2026-10-01,2026-10-07,"Feltro A, abertura",141.20,3,591\n2026-10-01,2026-10-07,Rosto real 03,82.15,,\n';
const m = lerExportMeta(csv);
assert.equal(m.ads.length, 2);
assert.equal(m.ads[0].anuncio, 'Feltro A, abertura');
assert.equal(m.ads[0].compras, 3);
assert.equal(m.ads[1].gasto, 82.15);
assert.equal(m.periodo, '2026-10-01 a 2026-10-07');
const csvBR = 'Nome do anúncio;Valor usado (BRL);Compras;Valor de conversão de compras\nX;1.234,50;2;394,00\n';
assert.equal(lerExportMeta(csvBR).ads[0].gasto, 1234.5);

console.log('Todos os testes passaram.');
