// Testes das regras de dinheiro: npm run testar
import assert from 'node:assert/strict';
import {precificar, precoParaMargem, avaliarAnuncio, dre, taxaMedia, lerNumero, type Produto, type Config, type Forma} from '../lib/calc';
import {lerExportMeta} from '../lib/csv';
import {mapearPedido, localBR, type PedidoShopify} from '../lib/shopify';
import {mapearInsights} from '../lib/meta';
import {resumo, dreMes, ranking, conversaoDiaria, taxaDoPedido, caixaCartpanda, compararPlanos, type Entrada} from '../lib/financeiro';
import {lerOfx, classificar, lancamentosDoBanco, REGRAS_INICIAIS} from '../lib/banco';
import {recorrencias, lerTaxas} from '../lib/dados';

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

// ---------- Módulo financeiro (pedidos sintéticos, no formato da Shopify + Cartpanda) ----------
const din = (v: number) => ({shopMoney: {amount: String(v)}});
function ped(id: string, criado: string, status: string, tipo: string, total: number, extra: Partial<PedidoShopify> = {}, attrs: Record<string, string> = {}, itens: [string, number, number][] = [['111', 1, total]]): PedidoShopify {
  return {
    id: `gid://shopify/Order/${id}`, name: `#${id}`, createdAt: criado, cancelledAt: null, displayFinancialStatus: status, paymentGatewayNames: [`cartpanda_${tipo}`],
    currentTotalPriceSet: din(status === 'VOIDED' ? 0 : total), totalPriceSet: din(total), subtotalPriceSet: din(total), totalShippingPriceSet: din(0), totalDiscountsSet: din(0), totalRefundedSet: din(0),
    discountCodes: [], shippingAddress: {provinceCode: 'SP'}, customer: {id: 'gid://shopify/Customer/9'},
    customAttributes: Object.entries({shipping_payment_type: tipo, ...attrs}).map(([key, value]) => ({key, value})),
    lineItems: {nodes: itens.map(([p, q, pr]) => ({name: `Produto ${p} - 1 unidade`, quantity: q, product: {id: `gid://shopify/Product/${p}`}, originalUnitPriceSet: din(pr)}))},
    transactions: status === 'PAID' ? [{kind: 'CAPTURE', status: 'SUCCESS', processedAt: criado}] : [], ...extra,
  };
}
assert.deepEqual(localBR('2026-10-27T02:30:00Z'), {dia: '2026-10-26', hora: 23});
const brutos = [
  ped('1', '2026-10-26T13:00:00Z', 'PAID', 'cc', 215.91, {}, {aditional_info_parcels_number: '6', 'Bandeira do cartão': 'Mastercard', utm_content: 'AD1'}),
  ped('2', '2026-10-26T10:20:00Z', 'PAID', 'pix', 239.9, {}, {utm_content: 'AD1'}, [['111', 1, 239.9]]),
  ped('3', '2026-10-25T15:00:00Z', 'PENDING', 'pix', 239.9),
  ped('4', '2026-10-25T16:00:00Z', 'VOIDED', 'pix', 479.8),
  ped('5', '2026-10-25T19:00:00Z', 'PAID', 'boleto', 339.8, {}, {}, [['111', 1, 239.9], ['222', 1, 99.9]]),
];
const mp = brutos.map(mapearPedido);
assert.equal(mp[0].pedido.forma, 'cartao'); assert.equal(mp[0].pedido.parcelas, 6); assert.equal(mp[0].pedido.bandeira, 'mastercard');
assert.equal(mp[3].pedido.status, 'cancelado'); assert.equal(mp[3].pedido.total, 479.8, 'cancelado usa o valor gerado, não o atual (0)');
assert.equal(mp[2].pedido.status, 'pendente'); assert.equal(mp[2].pedido.dia_pago, null);
const taxasG = [{forma: 'pix', parcelas: 1, pct: 0.99, fixo: 0}, {forma: 'boleto', parcelas: 1, pct: 0, fixo: 3.5}, {forma: 'cartao', parcelas: 1, pct: 5.99, fixo: 0}, {forma: 'cartao', parcelas: 6, pct: 14.11, fixo: 0}];
perto(taxaDoPedido(mp[0].pedido, taxasG), 215.91 * 0.1411);
perto(taxaDoPedido(mp[4].pedido, taxasG), 3.5);
const ent: Entrada = {
  pedidos: mp.map((x) => x.pedido), itens: mp.flatMap((x) => x.itens),
  ads: [mapearInsights({date_start: '2026-10-26', ad_id: 'AD1', spend: '208.95', impressions: '6478', inline_link_clicks: '146', actions: [{action_type: 'landing_page_view', value: '140'}, {action_type: 'add_to_cart', value: '4'}]})],
  lancamentos: [{id: 1, data: '2026-10-05', categoria: 'contador', descricao: '', valor_centavos: 30000, pedidos: 0, origem: ''}],
  custos: new Map([['111', 90.99]]), nomes: new Map([['111', 'Livro Fazenda']]), taxas: taxasG,
  cfg: {checkout_pct: 2.5, das_pct: 4, meta_imposto_pct: 13.83},
};
const h = resumo(ent, '2026-10-26', '2026-10-26');
perto(h.receita, 455.81); assert.equal(h.pagos.n, 2); perto(h.custo, 181.98); perto(h.checkout, 11.395);
perto(h.gateway, 215.91 * 0.1411 + 239.9 * 0.0099); perto(h.imposto, 455.81 * 0.04); perto(h.impostoMeta, 208.95 * 0.1383);
perto(h.lucro, 455.81 - 181.98 - 208.95 - h.checkout - h.gateway - h.imposto - h.impostoMeta);
perto(h.cpa!, 104.475); perto(h.ticket, 227.905); assert.equal(h.funil.views, 140);
// Lucro "como no Único Drop" (DAS e imposto Meta em 0%, cartão 5,99% + tabela): R$ 7,71 no print de 26/10.
const ud = resumo({...ent, cfg: {...ent.cfg, das_pct: 0, meta_imposto_pct: 0}, taxas: taxasG.map((t) => t.forma === 'cartao' && t.parcelas === 6 ? {...t, pct: 20.10} : t)}, '2026-10-26', '2026-10-26');
perto(ud.lucro, 7.71, 0.02);
const sem = resumo(ent, '2026-10-25', '2026-10-25');
assert.equal(sem.semCusto, 1, 'produto 222 sem custo'); assert.equal(sem.cancelados.n, 1); assert.equal(sem.pendentes.n, 1);
const conv = conversaoDiaria(ent, '2026-10-25', '2026-10-25', 'pix').total;
assert.equal(conv.naoPago.n, 2); perto(conv.naoPago.v, 719.7);
const dreOut = dreMes(ent, '2026-10');
perto(dreOut.totalReceitas, 455.81 + 339.8); perto(dreOut.despesas.find(([n]) => n === 'Despesas fixas')![1], 300);
const rk = ranking(resumo(ent, '2026-10-25', '2026-10-26'), ent);
perto(rk.reduce((s2, p) => s2 + p.marketing, 0), 208.95 * 1.1383, 0.05);
assert.ok(rk.find((p) => p.produto === '222')!.marketing < 1, 'anúncio AD1 trouxe só o produto 111');
const rec = recorrencias([{id: 9, data: '2026-01-31', categoria: 'assinaturas', descricao: 'Shopify', valor_centavos: 100, pedidos: 0, origem: '', recorrente: 1}], '2026-02-01', '2026-04-30');
assert.deepEqual(rec.map((r) => r.data), ['2026-02-28', '2026-03-31', '2026-04-30']);

// Taxas iniciais contra o extrato da Cartpanda de 26/10/2026 (valor do pedido → valor líquido, sem os R$ 0,35 de processamento).
const tx = lerTaxas();
const liquido = (forma: 'cartao' | 'pix', parcelas: number, total: number) =>
  total - (taxaDoPedido({...mp[0].pedido, forma, parcelas, total}, tx) - 0.35);
perto(liquido('cartao', 6, 239.9), 191.68, 0.006);
perto(liquido('cartao', 5, 223.11), 181.61, 0.006);
perto(liquido('pix', 1, 239.9), 237.52, 0.006);
perto(liquido('pix', 1, 339.8), 336.44, 0.006);
perto(liquido('cartao', 1, 239.9), 225.53, 0.006);
perto(liquido('pix', 1, 829.6), 821.39, 0.006);
// Reserva de 5%: pedido 52321200 (R$ 215,91 em 6x) entrou R$ 161,71 + R$ 10,80 de reserva.
const cx = caixaCartpanda([mp[0].pedido], tx, '2026-10-26', {reserva_pct: 5, reserva_dias: 90, prazo_cartao: 2});
perto(cx.retida, 10.8); perto(cx.aLiberar, 161.71 - 0.35, 0.006); // os R$ 0,35 saem numa linha "Taxa" à parte

// Planos da Cartpanda: Starter empata com o Light em R$ 24.402/mês.
const cp = compararPlanos(24603.15);
perto(cp.viradas[0].faturamento, 24402, 1); assert.equal(cp.melhor.nome, 'Starter');
assert.equal(compararPlanos(15000).melhor.nome, 'Light'); assert.equal(compararPlanos(60000).melhor.nome, 'Premium');
// Taxas iniciais: 7x a 12x sem acréscimo (sem juros só até 6x).
perto(taxaDoPedido({...mp[0].pedido, parcelas: 10, total: 100}, tx), 5.99 + 0.35);

// Extrato OFX (formato do Inter) e classificação.
const ofx = `<OFX><BANKACCTFROM><BANKID>077</BANKID><ACCTID>1</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261026<TRNAMT>179.68<FITID>A1<NAME>Cartão De Crédito - Cartpanda<MEMO>Credito domicilio cartao</STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261026<TRNAMT>-829.47<FITID>A2<NAME>Simples Nacional<MEMO>SIMPLES NACIONAL</STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261013<TRNAMT>-149.16<FITID>A3<NAME>Stripe Brasil<MEMO>Pix enviado</STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261018<TRNAMT>-69.99<FITID>A4<NAME>Ebanx Instituicao<MEMO>Pix enviado</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261019<TRNAMT>69.99<FITID>A5<NAME>Ebanx Instituicao<MEMO>Pix enviado devolvido</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>8100.10<DTASOF>20261026</LEDGERBAL></OFX>`;
const lo = lerOfx(ofx);
assert.equal(lo.movs.length, 5); assert.equal(lo.saldo, 8100.1); assert.equal(lo.movs[1].data, '2026-10-26');
const cls = lo.movs.map((x) => ({...x, categoria: classificar(x, REGRAS_INICIAIS), regra: 'auto'}));
assert.deepEqual(cls.map((x) => x.categoria), ['recebimento_vendas', 'das', 'taxas_cartpanda', 'assinaturas', 'assinaturas']);
const lb = lancamentosDoBanco(cls);
assert.equal(lb.length, 3, 'DAS e a assinatura com seu estorno; repasse e checkout ficam fora do DRE');
assert.equal(lb[0].data, '2026-09-30', 'DAS pago em outubro é competência de setembro');
assert.equal(lb.filter((l) => l.categoria === 'assinaturas').reduce((s2, l) => s2 + l.valor_centavos, 0), 0, 'estorno anula a assinatura');

console.log('Todos os testes passaram.');
