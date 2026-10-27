// Pedidos da Shopify (checkout Cartpanda) para o Cérebro.
// Guarda só o que o financeiro usa: nada de CPF, nome, e-mail, endereço ou dados de cartão.
import {db} from './db';

export type PedidoShopify = {
  id: string; name: string; createdAt: string; cancelledAt: string | null; displayFinancialStatus: string;
  paymentGatewayNames: string[];
  currentTotalPriceSet: Dinheiro; totalPriceSet?: Dinheiro; subtotalPriceSet?: Dinheiro; totalShippingPriceSet?: Dinheiro; totalDiscountsSet?: Dinheiro; totalRefundedSet?: Dinheiro;
  customer?: {id: string} | null; discountCodes: string[]; shippingAddress: {provinceCode: string | null} | null;
  customAttributes: {key: string; value: string | null}[];
  lineItems: {nodes: {title?: string; name: string; quantity: number; product: {id: string} | null; originalUnitPriceSet: Dinheiro}[]};
  transactions: {kind: string; status: string; processedAt: string | null; amountSet?: Dinheiro}[];
};
type Dinheiro = {shopMoney: {amount: string}};

export type Pedido = {
  id: string; numero: string; origem: string; criado_em: string; dia: string; hora: number; pago_em: string | null; dia_pago: string | null;
  status: 'pago' | 'pendente' | 'cancelado' | 'reembolsado'; forma: 'cartao' | 'pix' | 'boleto' | 'outro'; parcelas: number; bandeira: string;
  total: number; subtotal: number; frete: number; desconto: number; reembolsado: number; cupom: string; uf: string;
  cliente_id: string; utm_source: string; utm_campaign: string; utm_content: string; utm_term: string;
};
export type Item = {pedido_id: string; produto_ext: string; nome: string; quantidade: number; preco: number};

const valor = (m?: Dinheiro) => (m ? parseFloat(m.shopMoney.amount) || 0 : 0);
const idCurto = (gid: string) => gid.split('/').pop() ?? gid;

/** Data e hora no fuso de Brasília (a loja é -03, sem horário de verão). */
export function localBR(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return {dia: d.toISOString().slice(0, 10), hora: d.getUTCHours()};
}

export function mapearPedido(n: PedidoShopify): {pedido: Pedido; itens: Item[]} {
  const at = (k: string) => (n.customAttributes.find((a) => a.key === k)?.value ?? '').trim();
  const gw = (n.paymentGatewayNames[0] ?? '').toLowerCase();
  const tipo = at('shipping_payment_type').toLowerCase() || (gw.includes('pix') ? 'pix' : gw.includes('boleto') ? 'boleto' : gw.includes('cc') || gw.includes('card') ? 'cc' : '');
  const forma = tipo === 'cc' ? 'cartao' : tipo === 'pix' ? 'pix' : tipo === 'boleto' ? 'boleto' : 'outro';
  const fs = n.displayFinancialStatus;
  const status: Pedido['status'] = n.cancelledAt || fs === 'VOIDED' ? 'cancelado'
    : fs === 'REFUNDED' ? 'reembolsado'
    : fs === 'PAID' || fs === 'PARTIALLY_REFUNDED' || fs === 'PARTIALLY_PAID' ? 'pago' : 'pendente';
  const captura = n.transactions.find((t) => (t.kind === 'CAPTURE' || t.kind === 'SALE') && t.status === 'SUCCESS' && t.processedAt);
  const pagoEm = status === 'pago' || status === 'reembolsado' ? captura?.processedAt ?? n.createdAt : null;
  const {dia, hora} = localBR(n.createdAt);
  const cupom = at('discount_code') || (n.discountCodes[0] ?? '').replace(/\(.*\)$/, '').trim();
  const id = idCurto(n.id);
  return {
    pedido: {
      id, numero: n.name, origem: 'shopify', criado_em: n.createdAt, dia, hora,
      pago_em: pagoEm, dia_pago: pagoEm ? localBR(pagoEm).dia : null,
      status, forma, parcelas: forma === 'cartao' ? Math.max(1, parseInt(at('aditional_info_parcels_number')) || 1) : 1,
      bandeira: forma === 'cartao' ? at('Bandeira do cartão').toLowerCase() : '',
      // Pedido cancelado fica com total atual 0 na Shopify; para a conversão vale o valor que foi gerado.
      total: status === 'cancelado' ? valor(n.totalPriceSet) || valor(n.subtotalPriceSet) : valor(n.currentTotalPriceSet), subtotal: valor(n.subtotalPriceSet), frete: valor(n.totalShippingPriceSet),
      desconto: valor(n.totalDiscountsSet), reembolsado: valor(n.totalRefundedSet), cupom: cupom.toUpperCase(),
      uf: n.shippingAddress?.provinceCode ?? '',
      cliente_id: n.customer ? idCurto(n.customer.id) : '', utm_source: at('utm_source'), utm_campaign: at('utm_campaign'), utm_content: at('utm_content'), utm_term: at('utm_term'),
    },
    itens: n.lineItems.nodes.map((l) => ({
      pedido_id: id, produto_ext: l.product ? idCurto(l.product.id) : `sem-produto:${l.name}`,
      // `title` é o nome do produto; `name` junta a variante ("Livro de Tecido - vaca").
      nome: l.title || l.name, quantidade: l.quantity, preco: valor(l.originalUnitPriceSet),
    })),
  };
}

/** Grava (ou atualiza) pedidos e cria no cadastro os produtos novos, ainda sem custo. */
export function gravarPedidos(lista: {pedido: Pedido; itens: Item[]}[]) {
  const d = db();
  const cols = ['id', 'numero', 'origem', 'criado_em', 'dia', 'hora', 'pago_em', 'dia_pago', 'status', 'forma', 'parcelas', 'bandeira', 'total', 'subtotal', 'frete', 'desconto', 'reembolsado', 'cupom', 'uf', 'cliente_id', 'utm_source', 'utm_campaign', 'utm_content', 'utm_term'] as const;
  const up = d.prepare(`INSERT INTO pedidos (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
    ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}, atualizado_em = datetime('now')`);
  const apaga = d.prepare('DELETE FROM pedido_itens WHERE pedido_id = ?');
  const item = d.prepare('INSERT INTO pedido_itens (pedido_id, produto_ext, nome, quantidade, preco) VALUES (?, ?, ?, ?, ?)');
  const produto = d.prepare("INSERT INTO produtos (nome, preco, shopify_id) VALUES (?, ?, ?) ON CONFLICT(shopify_id) DO NOTHING");
  d.exec('BEGIN');
  try {
    for (const {pedido, itens} of lista) {
      up.run(...cols.map((c) => pedido[c]));
      apaga.run(pedido.id);
      for (const i of itens) {
        item.run(i.pedido_id, i.produto_ext, i.nome, i.quantidade, i.preco);
        if (!i.produto_ext.startsWith('sem-produto:')) produto.run(i.nome.replace(/\s+-\s+1 unidade$/i, ''), i.preco, i.produto_ext);
      }
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return lista.length;
}

const CONSULTA = `query($q: String, $after: String) { orders(first: 100, after: $after, query: $q, sortKey: UPDATED_AT) {
  pageInfo { hasNextPage endCursor }
  nodes { id name createdAt cancelledAt displayFinancialStatus paymentGatewayNames
    currentTotalPriceSet { shopMoney { amount } } totalPriceSet { shopMoney { amount } } subtotalPriceSet { shopMoney { amount } } totalShippingPriceSet { shopMoney { amount } }
    totalDiscountsSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } } discountCodes shippingAddress { provinceCode } customer { id }
    customAttributes { key value }
    lineItems(first: 30) { nodes { title name quantity product { id } originalUnitPriceSet { shopMoney { amount } } } }
    transactions(first: 10) { kind status processedAt amountSet { shopMoney { amount } } } } } }`;

/** Busca na Shopify os pedidos alterados desde a última sincronização (na primeira vez, 60 dias). */
export async function sincronizarShopify() {
  const loja = process.env.SHOPIFY_LOJA, token = process.env.SHOPIFY_TOKEN;
  if (!loja || !token) return {ok: false, msg: 'Shopify: defina SHOPIFY_LOJA e SHOPIFY_TOKEN no .env.'};
  const d = db();
  const ultima = (d.prepare("SELECT valor FROM estado WHERE chave = 'shopify_ultima'").get() as {valor: string} | undefined)?.valor;
  const desde = ultima ? new Date(new Date(ultima).getTime() - 10 * 60_000) : new Date(Date.now() - 60 * 86400_000);
  const inicio = new Date().toISOString();
  let after: string | null = null, total = 0;
  do {
    const r = await fetch(`https://${loja}/admin/api/2025-07/graphql.json`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': token},
      body: JSON.stringify({query: CONSULTA, variables: {q: `updated_at:>='${desde.toISOString()}'`, after}}),
    });
    if (!r.ok) return {ok: false, msg: `Shopify respondeu ${r.status}. Confira o token e as permissões (read_orders).`};
    const j = (await r.json()) as {data?: {orders: {pageInfo: {hasNextPage: boolean; endCursor: string}; nodes: PedidoShopify[]}}; errors?: unknown};
    if (!j.data) return {ok: false, msg: `Shopify: ${JSON.stringify(j.errors).slice(0, 200)}`};
    total += gravarPedidos(j.data.orders.nodes.map(mapearPedido));
    after = j.data.orders.pageInfo.hasNextPage ? j.data.orders.pageInfo.endCursor : null;
  } while (after);
  d.prepare("INSERT INTO estado (chave, valor) VALUES ('shopify_ultima', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(inicio);
  return {ok: true, msg: `Shopify: ${total} pedidos atualizados.`};
}
