// Confere o motor com pedidos reais exportados da Shopify (JSON das consultas), sem banco:
//   npx tsx scripts/conferir.ts <pasta com p1.json, p2.json...>
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {mapearPedido, type PedidoShopify} from '../lib/shopify';
import {resumo, dreMes, conversaoDiaria, type Entrada} from '../lib/financeiro';

const pasta = process.argv[2];
const nodes = readdirSync(pasta).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => (JSON.parse(readFileSync(join(pasta, f), 'utf8')) as {nodes: PedidoShopify[]}).nodes);
const m = nodes.map(mapearPedido);
const e: Entrada = {
  pedidos: m.map((x) => x.pedido), itens: m.flatMap((x) => x.itens), ads: [], lancamentos: [],
  custos: new Map(), nomes: new Map(), taxas: [], cfg: {checkout_pct: 2.5, das_pct: 0, meta_imposto_pct: 0},
};
const brl = (v: number) => v.toFixed(2);
const d = dreMes(e, '2026-10');
console.log('DRE out/26 receitas', Object.fromEntries(Object.entries(d.receitas).map(([k, v]) => [k, brl(v)])), 'total', brl(d.totalReceitas));
console.log('  plataforma 2,5%', brl(d.despesas.find(([n]) => n.startsWith('Plataforma'))![1]));
const pix = conversaoDiaria(e, '2026-10-01', '2026-10-31', 'pix').total;
console.log('Pix out/26: pagos', pix.pago.n, brl(pix.pago.v), '· não pagos', pix.naoPago.n, brl(pix.naoPago.v));
const h = resumo(e, '2026-10-26', '2026-10-26');
console.log('Hoje 26/10: pagos', h.pagos.n, brl(h.pagos.v), 'ticket', brl(h.ticket), 'checkout', brl(h.checkout),
  'cartão', brl(h.porForma.cartao?.pago.v ?? 0), 'pix', brl(h.porForma.pix?.pago.v ?? 0));
