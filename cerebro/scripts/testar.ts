// Testes das regras de dinheiro: npm run testar
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {precificar, precoParaMargem, avaliarAnuncio, dre, taxaMedia, lerNumero, type Produto, type Config, type Forma} from '../lib/calc';
import {lerExportMeta} from '../lib/csv';
import {mapearPedido, localBR, type PedidoShopify, type Pedido} from '../lib/shopify';
import {mapearInsights, type AdDia} from '../lib/meta';
import {resumo, dreMes, ranking, conversaoDiaria, taxaDoPedido, caixaCartpanda, compararPlanos, montarTaxas, jurosAbsorvidos, simularSemJuros, compararPrazos, pixVsCartao, mixParcelas, radarCustos, taxaEfetivaSemanal, type Entrada} from '../lib/financeiro';
import {lerOfx, classificar, lancamentosDoBanco, lerCsvMovimentos, importarCsv, importarOfx, faturaCartao, saldoSocio, sugerirVinculos, possiveisDuplicidades, numeroPedido, custosMedios, gruposDeValorRepetido, REGRAS_INICIAIS, type MovBanco} from '../lib/banco';
import {db} from '../lib/db';
import {recorrencias, lerTaxas} from '../lib/dados';
import {previsaoCaixa, portoesDeCaixa, proximaCobrancaMeta, type EntradaCaixa} from '../lib/caixa';
import {metricasPeriodo, compararExperimento, quedaDeConversao, type Experimento} from '../lib/plano';

// Os testes usam um banco temporário: nunca tocam nos dados de verdade.
process.env.CEREBRO_DB = join(mkdtempSync(join(tmpdir(), 'cerebro-')), 'teste.db');

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
perto(h.cpa!, 104.475); perto(h.cpaReal!, (208.95 + 208.95 * 0.1383) / 2); perto(h.roasReal!, 455.81 / (208.95 * 1.1383)); perto(h.adsComImposto, 208.95 * 1.1383); perto(h.ticket, 227.905); assert.equal(h.funil.views, 140);
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

// ---------- Taxas do Cartpanda Pay, conferidas com o pagamento de 26/10/2026 (13 pedidos, taxas de transação R$ 215,37) ----------
const tx = lerTaxas();
const taxaDe = (forma: 'cartao' | 'pix' | 'boleto', parcelas: number, total: number) => taxaDoPedido({...mp[0].pedido, forma, parcelas, total}, tx);
const pagamento26: [number, 'cartao' | 'pix', number][] = [[239.9, 'cartao', 6], [239.9, 'cartao', 6], [239.9, 'cartao', 6], [339.8, 'pix', 1], [239.9, 'pix', 1], [223.11, 'cartao', 5],
  [239.9, 'pix', 1], [239.9, 'pix', 1], [239.9, 'pix', 1], [239.9, 'pix', 1], [339.8, 'pix', 1], [829.6, 'pix', 1], [239.9, 'pix', 1]];
perto(pagamento26.reduce((s2, [t, f, par]) => s2 + taxaDe(f, par, t), 0), 215.37, 0.03);
perto(taxaDe('cartao', 6, 239.9), 239.9 - 191.68, 0.006);
perto(taxaDe('cartao', 5, 223.11), 223.11 - 181.61, 0.006);
perto(taxaDe('cartao', 1, 239.9), 239.9 - 225.53, 0.006); // recebeu R$ 213,53 + R$ 12,00 de reserva
perto(taxaDe('pix', 1, 829.6), 829.6 - 821.39, 0.006);
perto(taxaDe('boleto', 1, 239.9), 3.5);
assert.ok(tx.every((t) => t.forma === 'boleto' || t.fixo === 0), 'não existe taxa fixa por pedido no cartão nem no Pix');
perto(taxaDe('cartao', 10, 100), 5.99); // acima de 6x o cliente paga os juros
perto(taxaDe('cartao', 6, 100), 20.1);
const juros = {2: 7.24, 3: 9.34, 4: 11.16, 5: 12.61, 6: 14.11, 7: 15.61, 8: 17.49, 9: 19.38, 10: 20.77, 11: 22.72, 12: 24.68};
const t12 = montarTaxas({pix_pct: 0.99, boleto_fixo: 3.5, base_pct: 4.99, sem_juros: 12, juros});
perto(t12.find((t) => t.forma === 'cartao' && t.parcelas === 12)!.pct, 4.99 + 24.68);
perto(t12.find((t) => t.forma === 'cartao' && t.parcelas === 1)!.pct, 4.99);
// Reserva de 5%: pedido 52321200 (R$ 215,91 em 6x) entrou R$ 161,71 + R$ 10,80 de reserva.
const cx = caixaCartpanda([mp[0].pedido], tx, '2026-10-26', {reserva_pct: 5, reserva_dias: 90, prazo_cartao: 2});
perto(cx.retida, 10.8); perto(cx.aLiberar, 161.71, 0.006);

// Planos da Cartpanda: Starter empata com o Light em R$ 24.402/mês.
const cp = compararPlanos(24603.15);
perto(cp.viradas[0].faturamento, 24402, 1); assert.equal(cp.melhor.nome, 'Starter');
assert.equal(compararPlanos(15000).melhor.nome, 'Light'); assert.equal(compararPlanos(60000).melhor.nome, 'Premium');

// ---------- Radar de custos ----------
const base = mp[0].pedido;
const pj: Pedido[] = [
  {...base, id: 'j1', forma: 'cartao', parcelas: 6, total: 200, status: 'pago'},
  {...base, id: 'j2', forma: 'cartao', parcelas: 2, total: 100, status: 'pago'},
  {...base, id: 'j3', forma: 'cartao', parcelas: 10, total: 100, status: 'pago'},
  {...base, id: 'j4', forma: 'pix', parcelas: 1, total: 100, status: 'pago'},
  {...base, id: 'j5', forma: 'cartao', parcelas: 1, total: 100, status: 'pago'},
];
const ja = jurosAbsorvidos(pj, juros, 6);
perto(ja.valor, 200 * 0.1411 + 100 * 0.0724); assert.equal(ja.nParcelados, 2); perto(ja.receitaCartao, 500);
const sim = simularSemJuros(pj, juros, 6);
perto(sim[2].custo, 100 * 0.0724); perto(sim[2].economiaVsAtual, ja.valor - 100 * 0.0724); assert.ok(sim[5].atual);
perto(sim[11].custo, ja.valor + 100 * 0.2077);
const pz = compararPrazos(9197, [{dias: 2, pct: 5.99}, {dias: 5, pct: 5.49}, {dias: 14, pct: 4.99}], 2, 1.2);
perto(pz[1].economia, 9197 * 0.005); perto(pz[1].capital, (9197 / 30) * 3); perto(pz[1].liquido, 9197 * 0.005 - ((9197 / 30) * 3 * 1.2) / 100);
perto(pz[2].economia, 9197 * 0.01); assert.equal(pz[0].atual, true); assert.equal(pz[0].capital, 0);
const pv = pixVsCartao(pj, tx);
assert.equal(pv.conversaoPix, 100);
perto(pv.pctCartao, ((200 * 20.1 + 100 * 13.23 + 100 * 5.99 + 100 * 5.99) / 100 / 500) * 100); perto(pv.pctPix, 0.99);
// Parcelamento médio e cenários: cartão em 6x, 2x, 10x e à vista.
const mixT = mixParcelas(pj);
assert.equal(mixT.n, 4); perto(mixT.mediaParcelas, 4.75); perto(mixT.avista, 25); perto(mixT.ate3, 50); perto(mixT.de4a6, 25);
const radarMix = radarCustos({...ent, pedidos: pj, itens: [], ads: [], lancamentos: [], taxas: tx}, '2026-10-01', '2026-10-31', {juros, sem_juros: 6, prazos: [{dias: 2, pct: 5.99}], prazo_atual: 2, custo_capital_mes: 1.2, taxa_repasse: 4.9});
const s3 = radarMix.simulacao.find((x) => x.ate === 3)!;
assert.equal(s3.afetados, 1, 'só o pedido de 6x passaria a pagar juros ao sair de 6x para 3x'); perto(s3.economia, 200 * 0.1411 - 0);
assert.equal(radarMix.simulacao.find((x) => x.ate === 6)!.afetados, 0);
// Mudar "sem juros" não reescreve o passado: a taxa de cada pedido vem da regra em vigor no dia do pagamento.
const hist = [...montarTaxas({pix_pct: 0.99, boleto_fixo: 3.5, base_pct: 5.99, sem_juros: 6, juros}).map((t) => ({...t, desde: ''})),
  ...montarTaxas({pix_pct: 0.99, boleto_fixo: 3.5, base_pct: 5.99, sem_juros: 3, juros}).map((t) => ({...t, desde: '2026-10-20'}))];
const p6 = (diaPago: string): Pedido => ({...pj[0], dia: diaPago, dia_pago: diaPago, parcelas: 6, total: 100});
perto(taxaDoPedido(p6('2026-10-10'), hist), 20.1); perto(taxaDoPedido(p6('2026-10-20'), hist), 5.99); perto(taxaDoPedido(p6('2026-10-25'), hist), 5.99);
perto(taxaDoPedido({...p6('2026-10-25'), parcelas: 4}, hist), 5.99); // depois da mudança, 4x passa a ser juros do cliente
perto(taxaDoPedido({...p6('2026-10-10'), parcelas: 4}, hist), 5.99 + 11.16); // antes, a loja assumia
perto(taxaDoPedido({...p6('2026-10-25'), parcelas: 3}, hist), 5.99 + 9.34);
perto(jurosAbsorvidos([p6('2026-10-10'), p6('2026-10-25')], juros, (dia) => (dia >= '2026-10-20' ? 3 : 6)).valor, 14.11);
const radarTeste = radarCustos(ent, '2026-10-25', '2026-10-26', {juros, sem_juros: 6, prazos: [{dias: 2, pct: 5.99}, {dias: 5, pct: 5.49}], prazo_atual: 2, custo_capital_mes: 1.2, taxa_repasse: 4.9});
assert.equal(radarTeste.prazos.length, 2); assert.ok(radarTeste.repasse.diasComVenda >= 1); perto(radarTeste.repasse.custoPorSaque, 4.9);
perto(radarCustos(ent, '2026-10-25', '2026-10-26', {juros, sem_juros: 6, prazos: [{dias: 2, pct: 5.99}], prazo_atual: 2, custo_capital_mes: 1.2, taxa_repasse: 4.9, saques30: 3}).repasse.custo, 14.7, 0.001); // R$ 4,90 em cada saque
const tendencia = taxaEfetivaSemanal(ent, '2026-10-26', 8); assert.equal(tendencia.serie.length, 8);

const bd = db();

// ---------- Extrato OFX, cartões e classificação ----------
const ofx = `<OFX><BANKACCTFROM><BANKID>077</BANKID><ACCTID>1</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261026<TRNAMT>179.68<FITID>A1<NAME>Cartão De Crédito - Cartpanda<MEMO>Credito domicilio cartao</STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261026<TRNAMT>-829.47<FITID>A2<NAME>Simples Nacional<MEMO>SIMPLES NACIONAL</STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261013<TRNAMT>-149.16<FITID>A3<NAME>Stripe Brasil<MEMO>Pix enviado</STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261018<TRNAMT>-69.99<FITID>A4<NAME>Ebanx Instituicao<MEMO>Pix enviado</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261019<TRNAMT>69.99<FITID>A5<NAME>Ebanx Instituicao<MEMO>Pix enviado devolvido</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>8100.10<DTASOF>20261026</LEDGERBAL></OFX>`;
const lo = lerOfx(ofx);
assert.equal(lo.movs.length, 5); assert.equal(lo.saldo, 8100.1); assert.equal(lo.movs[1].data, '2026-10-26');
const extra = {pedido_numero: '', produto_ext: '', obs: '', quantidade: 1};
const cls: MovBanco[] = lo.movs.map((x) => ({...x, ...extra, categoria: classificar(x, REGRAS_INICIAIS), regra: 'auto'}));
assert.deepEqual(cls.map((x) => x.categoria), ['recebimento_vendas', 'das_mei', 'taxas_cartpanda', 'fornecedor', 'fornecedor']);
const lb = lancamentosDoBanco(cls);
assert.equal(lb.length, 1, 'só o MEI atrasado é despesa; repasse, checkout e a compra do fornecedor (Ebanx) com seu estorno ficam fora do DRE');
assert.equal(lb[0].categoria, 'regularizacao'); assert.equal(lb[0].data, '2026-10-26', 'regularização fica na data do pagamento');
const dasDoMes = lancamentosDoBanco([{...cls[1], categoria: 'das'}]);
assert.equal(dasDoMes[0].categoria, 'das'); assert.equal(dasDoMes[0].data, '2026-09-30', 'DAS do mês pago em outubro é competência de setembro');
const nomes: [string, string][] = [
  ['Maree Instituicao De Pagamento Ltda', 'fornecedor'], ['Pix Marketplace', 'fornecedor'], ['Mercadolivre*mercado', 'fornecedor'], ['Mercado*mercadolivre', 'fornecedor'],
  ['MERCADO PAGO INST DE PAGTO LTD', 'fornecedor'], ['Shopee*tupi Tech Ltd', 'fornecedor'], ['Mp *melimais', 'assinaturas'], ['Htm       *nico Dr', 'assinaturas'],
  ['Runway', 'assinaturas'], ['Ebury Banco De Cambio', 'fornecedor'], ['Vindi Pagamentos', 'a_identificar'], ['DI*google Google', 'assinaturas'], ['Iof Internacional', 'tarifas'], ['Barbara Emanuelle Melo Vieira', 'reembolso_socio'],
  ['Rrt Assessoria E Consultoria', 'enquadramento'], ['Cdb Credito Banco Inter S A', 'aplicacao'], ['Lucas Vinicios De Oliveira Coutinho', 'transferencia'], ['Fornecedor Qualquer', 'a_classificar'],
];
for (const [n, esperado] of nomes) assert.equal(classificar({nome: n, memo: ''}, REGRAS_INICIAIS), esperado, n);
// Importar duas vezes não duplica; o que foi classificado à mão não muda.
assert.equal(importarOfx(ofx).n, 5); importarOfx(ofx);
assert.equal((bd.prepare('SELECT count(*) n FROM banco').get() as {n: number}).n, 5);
bd.prepare("UPDATE banco SET categoria = 'das', regra = 'manual' WHERE fitid = 'A2'").run(); importarOfx(ofx);
assert.equal((bd.prepare("SELECT categoria FROM banco WHERE fitid = 'A2'").get() as {categoria: string}).categoria, 'das');

const csvCartao = 'conta;data;descricao;valor;categoria\ncartao-pj;2026-10-25;Mercadolivre*mercado;-90,99;\ncartao-pj;25/10/2026;Mercadolivre*mercado;-90,99;\ncartao-pj;2026-10-22;Mp *melimais;-9,90;\ncartao-pessoal;2026-10-26;Meta Ads;-3.418,12;anuncios\n';
const mv = lerCsvMovimentos(csvCartao);
assert.equal(mv.length, 4); assert.equal(new Set(mv.map((m) => m.fitid)).size, 4, 'linhas iguais no mesmo dia continuam distintas'); assert.equal(mv[1].data, '2026-10-25');
perto(mv[3].valor, -3418.12); assert.equal(mv[3].categoria, 'anuncios');
assert.throws(() => lerCsvMovimentos('conta;data;descricao;valor\noutra;2026-10-25;X;-1'), /desconhecida/);
assert.equal(importarCsv(csvCartao).n, 4); importarCsv(csvCartao);
assert.equal((bd.prepare("SELECT count(*) n FROM banco WHERE conta LIKE 'cartao%'").get() as {n: number}).n, 4);

const compra = (data: string, valor: number, extraMov: Partial<MovBanco> = {}): MovBanco =>
  ({conta: 'cartao-pj', fitid: `${data}-${valor}-${Math.random()}`, data, valor: -valor, tipo: '', nome: '', memo: '', categoria: 'fornecedor', regra: 'auto', ...extra, pedido_numero: '', produto_ext: '', obs: '', quantidade: 1, ...extraMov});
// Fatura de novembro do cartão PJ (print de 26/10): R$ 762,78 aberta, limite R$ 800, fecha dia 3, vence dia 10.
const compras = [['2026-10-25', 90.99], ['2026-10-25', 90.99], ['2026-10-25', 90.99], ['2026-10-25', 90.99], ['2026-10-22', 9.9], ['2026-10-17', 1.47], ['2026-10-16', 6.5],
  ['2026-10-15', 42.08], ['2026-10-14', 65.09], ['2026-10-14', 63.09], ['2026-10-14', 69.95], ['2026-10-14', 71.25], ['2026-10-10', 69.49], ['2026-10-02', 50]] as [string, number][];
const ft = faturaCartao(compras.map(([d, v]) => compra(d, v)), '2026-10-26', {fechamento: 3, vencimento: 10, limite: 800});
perto(ft.total, 762.78); perto(ft.disponivel, 37.22); assert.equal(ft.inicio, '2026-10-04'); assert.equal(ft.fecha, '2026-11-03'); assert.equal(ft.vencimento, '2026-11-10');
assert.equal(faturaCartao([], '2026-11-02', {fechamento: 3, vencimento: 10, limite: 800}).fecha, '2026-11-03');
const so = saldoSocio([compra('2026-10-13', 1313.73, {conta: 'cartao-pessoal', categoria: 'anuncios'}), compra('2026-10-26', 3418.12, {conta: 'cartao-pessoal', categoria: 'anuncios'}),
  compra('2026-10-19', 1620.56, {conta: '077-1', categoria: 'reembolso_socio'})]);
perto(so.pago, 4731.85); perto(so.reembolsado, 1620.56); perto(so.aReembolsar, 3111.29);

// Conciliação: compra de fornecedor do mesmo valor do custo do pedido, até 5 dias depois do pagamento, do pedido mais antigo ao mais novo.
const custos111 = new Map([['111', 90.99]]);
const fornecedor = [compra('2026-10-26', 90.99, {fitid: 'f1'}), compra('2026-10-27', 90.99, {fitid: 'f2'}), compra('2026-10-27', 76.23, {fitid: 'f3'})];
const sug = sugerirVinculos(fornecedor, ent.pedidos, ent.itens, custos111);
assert.deepEqual(sug.map((s) => [s.fitid, s.pedido]), [['f1', '1'], ['f2', '2']]);
const sug2 = sugerirVinculos([{...fornecedor[0], pedido_numero: '1'}, fornecedor[1]], ent.pedidos, ent.itens, custos111);
assert.deepEqual(sug2.map((s) => [s.fitid, s.pedido]), [['f2', '2']]);
assert.equal(numeroPedido('#20944'), '20944');
// Mesmo valor no cartão e por boleto no mesmo dia (R$ 65,09 em 14/10): possível pagamento em duplicidade. R$ 90,99 é custo conhecido e repete à vontade.
const dup = possiveisDuplicidades([compra('2026-10-14', 65.09), compra('2026-10-14', 65.09, {conta: '077-1'}), compra('2026-10-25', 90.99), compra('2026-10-25', 90.99, {conta: '077-1'}),
  compra('2026-10-20', 70, {pedido_numero: '5'}), compra('2026-10-20', 70, {conta: '077-1'})], [90.99]);
assert.equal(dup.length, 1); perto(-dup[0][0].valor, 65.09);
const recorrente = possiveisDuplicidades([compra('2026-10-14', 71.25), compra('2026-10-14', 71.25, {conta: '077-1'}), compra('2026-10-13', 71.25, {conta: '077-1'}), compra('2026-10-12', 71.25, {conta: '077-1'})], []);
assert.equal(recorrente.length, 0, 'valor que se repete é produto comprado várias vezes');

// Custo médio pelos pagamentos a fornecedor (vinculados a produto com quantidade ou a pedido); devolução abate; produto sem vínculo fica de fora.
const itensCM = [
  {pedido_id: 'p2', produto_ext: 'T1', nome: 'Livro', quantidade: 2, preco: 100}, {pedido_id: 'p3', produto_ext: 'A', nome: 'A', quantidade: 1, preco: 50}, {pedido_id: 'p3', produto_ext: 'B', nome: 'B', quantidade: 1, preco: 150},
];
const cm = custosMedios([
  compra('2026-10-01', 400, {fitid: 'c1', produto_ext: 'T1', quantidade: 10}), compra('2026-10-05', 90, {fitid: 'c2', pedido_numero: '2'}),
  compra('2026-10-06', 80, {fitid: 'c3', pedido_numero: '3'}), compra('2026-10-07', 40, {fitid: 'c4'}), compra('2026-10-08', 30, {fitid: 'c5', produto_ext: 'Z'}),
], [{id: 'p2', numero: '#2'}, {id: 'p3', numero: '#3'}], itensCM, new Map([['A', 10], ['B', 30]]));
perto(cm.medios.get('T1')!.custo, 490 / 12); assert.equal(cm.medios.get('T1')!.compras, 2);
perto(cm.medios.get('A')!.custo, 20); perto(cm.medios.get('B')!.custo, 60, 0.001);
perto(cm.medios.get('Z')!.custo, 30); assert.equal(cm.semVinculo, 1); perto(cm.valorSemVinculo, 40);
const dev = custosMedios([compra('2026-10-01', 100, {produto_ext: 'T1', quantidade: 2}), {...compra('2026-10-02', 0, {produto_ext: 'T1', quantidade: 1}), valor: 50}], [], []);
perto(dev.medios.get('T1')!.custo, 50, 0.001);
const gr = gruposDeValorRepetido([compra('2026-10-01', 90.99), compra('2026-10-02', 90.99), compra('2026-10-03', 75), compra('2026-10-04', 90.99, {produto_ext: 'T1'})]);
assert.equal(gr.length, 1); assert.equal(gr[0].n, 2); perto(gr[0].valor, 90.99);

// Caixa: a Meta cobra ao chegar em R$ 3.000 de gasto (R$ 3.415 com imposto) mais o saldo devedor; o Cérebro diz se pode usar o saldo ou precisa sacar.
const caixaBase: EntradaCaixa = {hoje: '2026-10-27', saldoConta: 1000, cartpanda: {disponivel: 500, liberacoes: [], pixPorDia: 100, cartaoPorDia: 100, prazoCartao: 2},
  fornecedor: {pendentes: 200, porDia: 150}, meta: {gastoDiario: 500, acumulado: 2000, limite: 3000, saldoDevedor: 80, impostoPct: 13.83, ultimaCobranca: '2026-10-26'},
  saque: {taxa: 4.9, nUltimos30: 6}, colchao: 0, fatura: {valor: 0, vencimento: null}, devidoSocio: 0};
const cobM = proximaCobrancaMeta(caixaBase.meta, '2026-10-27');
assert.equal(cobM.dias, 2); assert.equal(cobM.dia, '2026-10-29'); perto(cobM.valor, 3000 * 1.1383 + 80);
assert.equal(previsaoCaixa(caixaBase).recomendacao.tipo, 'falta');
assert.equal(previsaoCaixa({...caixaBase, saldoConta: 6000}).recomendacao.tipo, 'usar');
const pSacar = previsaoCaixa({...caixaBase, saldoConta: 3000, cartpanda: {...caixaBase.cartpanda, disponivel: 2000}});
assert.equal(pSacar.recomendacao.tipo, 'sacar'); assert.equal(pSacar.recomendacao.saque, Math.ceil(200 + 450 + 3000 * 1.1383 + 80 - 3000));
assert.equal(pSacar.dias.length, 10); assert.ok(pSacar.dias[1].meta > 0 && pSacar.dias[0].meta === 0, 'a Meta cobra no 2º dia');
assert.equal(previsaoCaixa({...caixaBase, meta: {...caixaBase.meta, acumulado: 3100}}).cob.dias, 0);
const comFatura = previsaoCaixa({...caixaBase, saldoConta: 6000, fatura: {valor: 800, vencimento: '2026-10-30'}, devidoSocio: 3000});
perto(comFatura.necessidade3, 200 + 450 + 3000 * 1.1383 + 80 + 800); assert.equal(comFatura.dias[2].fatura, 800);
perto(comFatura.folgaTotal10, 6000 + 500 - comFatura.necessidade10 - 3000, 0.001);
const pt = portoesDeCaixa(1000, [{chave: 'a', nome: 'A', capital: 600, ganho: '', observacao: ''}, {chave: 'b', nome: 'B', capital: 700, ganho: '', observacao: ''}, {chave: 'c', nome: 'C', capital: 0, ganho: '', observacao: ''}]);
assert.deepEqual(pt.map((q) => q.aberto), [true, false, false]); perto(pt[1].falta, 50);

// Plano de ação: antes e depois de um experimento e queda de conversão.
const pedT = (dia: string, forma: 'cartao' | 'pix', status: Pedido['status'], i: number): Pedido => ({...pj[0], id: `x${dia}${forma}${status}${i}`, dia, dia_pago: status === 'pago' ? dia : null, forma, parcelas: forma === 'cartao' ? 3 : 1, status, total: 200});
const dias14 = (ini: string, pagos: number, pendentes: number) => Array.from({length: 14}, (_, d) => new Date(new Date(`${ini}T12:00:00Z`).getTime() + d * 86400_000).toISOString().slice(0, 10))
  .flatMap((dia, d) => [...(d < pagos ? [pedT(dia, 'cartao', 'pago', d), pedT(dia, 'cartao', 'pago', d + 100)] : []), ...(d < pendentes ? [pedT(dia, 'cartao', 'pendente', d)] : [])]);
const entPlano = (ps: Pedido[]) => ({...ent, pedidos: ps, itens: [], ads: [], lancamentos: [], taxas: tx});
// 14 dias antes: 28 pagos e 14 pendentes (66,7%); 14 dias depois: 20 pagos e 14 pendentes (58,8% no cartão... 20/34).
const antesPs = dias14('2026-10-01', 14, 14), depoisPs = dias14('2026-10-15', 10, 14);
const ePl = entPlano([...antesPs, ...depoisPs]);
const mAntes = metricasPeriodo(ePl, '2026-10-01', '2026-10-14');
assert.equal(mAntes.pagos, 28); perto(mAntes.cartao.pct!, (28 / 42) * 100); perto(mAntes.pedidosDia, 2); assert.equal(mAntes.pix.pct, null);
const exp: Experimento = {id: 1, criado_em: '', titulo: 'Sem juros até 3x', hipotese: '', mudanca: '', sucesso: '', reversao: '', inicio: '2026-10-15', fim: null, status: 'em_andamento', decisao: '', criado_por: ''};
const cmp = compararExperimento(ePl, exp, '2026-10-28')!;
perto(cmp.dPedidos!, -28.57, 0.01); assert.equal(cmp.veredito, 'reverter'); assert.equal(cmp.dCheckout, null, 'sem dados de checkout da Meta');
// Com checkouts da Meta (98 antes e 98 depois), pagos de 28 para 20: queda de ~8 pontos mesmo com gasto estável.
const adsDia = (dia: string, checkout: number): AdDia => ({data: dia, plataforma: 'facebook', anuncio_id: 'a', anuncio: '', campanha_id: '', campanha: '', conjunto_id: '', conjunto: '', gasto: 100, impressoes: 0, cliques: 0, views: 0, carrinho: 0, checkout, compras: 0, valor_compras: 0});
const comAds = {...ePl, ads: [...Array.from({length: 14}, (_, d) => adsDia(new Date(Date.UTC(2026, 9, 1 + d, 12)).toISOString().slice(0, 10), 7)), ...Array.from({length: 14}, (_, d) => adsDia(new Date(Date.UTC(2026, 9, 15 + d, 12)).toISOString().slice(0, 10), 7))]};
const cmpAds = compararExperimento(comAds, exp, '2026-10-28')!;
perto(cmpAds.antes.convCheckout!, (28 / 98) * 100, 0.001); perto(cmpAds.depois.convCheckout!, (20 / 98) * 100, 0.001); perto(cmpAds.dCheckout!, ((20 - 28) / 98) * 100, 0.001); assert.equal(cmpAds.veredito, 'reverter');
// Mesmo volume antes e depois e lucro igual: observar, não manter.
const igual = compararExperimento(entPlano([...dias14('2026-10-01', 14, 14), ...dias14('2026-10-15', 14, 14)]), exp, '2026-10-28')!;
assert.equal(igual.veredito, 'observar'); perto(igual.dPedidos!, 0, 0.001);
assert.equal(compararExperimento(ePl, {...exp, status: 'planejado', inicio: null}, '2026-10-28'), null);
const poucos = compararExperimento(entPlano([...dias14('2026-10-01', 3, 3), ...dias14('2026-10-15', 3, 3)]), exp, '2026-10-28')!;
assert.equal(poucos.veredito, 'poucos_dados');
assert.equal(quedaDeConversao(ePl, '2026-10-28'), null, 'queda de 8 pontos com poucos pedidos pode ser acaso (z < 1,96)');
const ePl2 = entPlano([...dias14('2026-10-01', 14, 4), ...dias14('2026-10-15', 8, 14)]);
const qd = quedaDeConversao(ePl2, '2026-10-28')!;
assert.ok(qd && qd.queda > 5 && qd.forma === 'cartao');
assert.equal(quedaDeConversao(entPlano(antesPs), '2026-10-28'), null, 'sem pedidos nas duas janelas não alerta');

// DRE: regularização aparece à parte e não entra no lucro recorrente.
const dreReg = dreMes({...ent, lancamentos: [{id: 1, data: '2026-10-26', categoria: 'regularizacao', descricao: 'MEI', valor_centavos: 82947, pedidos: 0, origem: 'banco'}]}, '2026-10');
perto(dreReg.pontual, 829.47); perto(dreReg.lucroRecorrente - dreReg.lucro, 829.47);

console.log('Todos os testes passaram.');
