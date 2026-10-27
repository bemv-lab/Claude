// Plano de ação: experimentos documentados com antes e depois, e o alerta de queda de conversão com os testes sugeridos.
import {resumo, diasEntre, type Entrada} from './financeiro';

export type Experimento = {
  id: number; criado_em: string; titulo: string; hipotese: string; mudanca: string; sucesso: string; reversao: string;
  inicio: string | null; fim: string | null; status: 'planejado' | 'em_andamento' | 'concluido' | 'revertido'; decisao: string; criado_por: string;
};

const soma = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

/** Números do período para comparar antes e depois. A conversão é pago ÷ (pago + pendente + cancelado), como no Único Drop. */
export function metricasPeriodo(e: Entrada, ini: string, fim: string) {
  const r = resumo(e, ini, fim);
  const conv = (f: string) => {
    const x = r.porForma[f];
    const t = x ? x.pago.n + x.pendente.n + x.cancelado.n : 0;
    return {n: x?.pago.n ?? 0, total: t, pct: t ? (x!.pago.n / t) * 100 : null};
  };
  const dias = diasEntre(ini, fim).length;
  // Cartão recusado ou abandonado não vira pedido na Shopify, então a "conversão do cartão" é sempre ~100% e não serve de régua.
  // A régua do cartão é o volume (pedidos por dia, parcelas) e os pedidos pagos por checkout iniciado, que a Meta registra.
  const checkouts = r.funil.checkout;
  const cartaoPagos = r.pedidos.filter((p) => p.status === 'pago' && p.forma === 'cartao');
  return {
    ini, fim, dias, pagos: r.pagos.n, receita: r.receita, ticket: r.ticket, pedidosDia: r.pagos.n / dias,
    checkouts, convCheckout: checkouts >= 30 ? (r.pagos.n / checkouts) * 100 : null, gastoDia: r.ads.total / dias,
    cartaoDia: cartaoPagos.length / dias, parcelasMedia: cartaoPagos.length ? cartaoPagos.reduce((a, p) => a + p.parcelas, 0) / cartaoPagos.length : null,
    conversao: r.gerados.n + r.cancelados.n ? r.conversao : null, cartao: conv('cartao'), pix: conv('pix'),
    taxaPct: r.receita ? ((r.gateway + r.checkout) / r.receita) * 100 : 0, gatewayPct: r.receita ? (r.gateway / r.receita) * 100 : 0,
    lucroPedido: r.pagos.n ? r.lucroOperacao / r.pagos.n : null, lucro: r.lucroOperacao,
  };
}
export type Metricas = ReturnType<typeof metricasPeriodo>;

export const LIMITES = {minPagos: 20, quedaCheckoutPp: 5, quedaPedidosPct: 15, aceitaPedidosPct: 10};

/** Antes e depois de um experimento: o "antes" tem o mesmo tamanho do "depois" (no mínimo 14 dias) e termina na véspera do início. */
export function compararExperimento(e: Entrada, x: Experimento, hoje: string) {
  if (!x.inicio || x.status === 'planejado') return null;
  const fim = x.fim ?? hoje;
  const dias = Math.max(1, diasEntre(x.inicio, fim).length);
  const antes = metricasPeriodo(e, soma(x.inicio, -Math.max(dias, 14)), soma(x.inicio, -1));
  const depois = metricasPeriodo(e, x.inicio, fim);
  const pctDe = (a: number, d: number) => (a ? ((d - a) / a) * 100 : null);
  const dPedidos = pctDe(antes.pedidosDia, depois.pedidosDia), dCartaoDia = pctDe(antes.cartaoDia, depois.cartaoDia);
  const dCheckout = antes.convCheckout !== null && depois.convCheckout !== null ? depois.convCheckout - antes.convCheckout : null;
  const dLucro = antes.lucroPedido !== null && depois.lucroPedido !== null ? depois.lucroPedido - antes.lucroPedido : null;
  // Se o gasto em anúncios caiu muito, menos pedidos não prova que a mudança foi a causa.
  const gastoCaiu = antes.gastoDia > 0 && depois.gastoDia < antes.gastoDia * 0.85;
  let veredito: 'poucos_dados' | 'reverter' | 'manter' | 'observar' = 'observar';
  if (antes.pagos < LIMITES.minPagos || depois.pagos < LIMITES.minPagos) veredito = 'poucos_dados';
  else if ((dCheckout !== null && dCheckout <= -LIMITES.quedaCheckoutPp) || (!gastoCaiu && dPedidos !== null && dPedidos <= -LIMITES.quedaPedidosPct)) veredito = 'reverter';
  else if ((dPedidos === null || dPedidos > -LIMITES.aceitaPedidosPct) && (dLucro === null || dLucro > 0)) veredito = 'manter';
  return {antes, depois, dCheckout, dPedidos, dCartaoDia, dLucro, gastoCaiu, veredito};
}

/** Ações a testar quando a conversão cai, na ordem em que vale olhar. `forma` diz onde a queda apareceu. */
export function acoesParaQuedaDeConversao(forma: 'cartao' | 'pix' | 'geral', mudouPolitica: boolean) {
  const lista: string[] = [];
  if (mudouPolitica) lista.push('Houve mudança recente nas parcelas sem juros: reverter a regra e refazer o teste com uma mudança menor (por exemplo, 4x em vez de 3x).');
  if (forma !== 'pix') lista.push('Mostrar o valor da parcela no anúncio e na página do produto (“12x de R$ …”), para o cartão parecer mais leve sem a loja pagar juros.');
  if (forma !== 'cartao') lista.push('Conferir o fluxo do Pix: tempo para pagar, QR code e lembrete por mensagem para quem gerou e não pagou.');
  lista.push('Testar desconto de 3% a 5% no Pix para empurrar quem hesita no cartão para a forma mais barata (a loja economiza mais de 5% de taxa em cada pedido que migra).');
  lista.push('Olhar o funil da Meta (CTR, carrinho, checkout) para saber se a queda começou antes do pagamento: criativo cansado ou público novo ruim derrubam a conversão sem ter relação com taxas.');
  lista.push('Conferir o site no celular (velocidade, checkout, erros de cartão recusado) antes de culpar a oferta.');
  return lista;
}

/** Compara os últimos 14 dias com os 14 anteriores. Só alerta com 30 pedidos gerados em cada janela. */
export function quedaDeConversao(e: Entrada, hoje: string, limitePp = 5) {
  const rec = metricasPeriodo(e, soma(hoje, -13), hoje), ant = metricasPeriodo(e, soma(hoje, -27), soma(hoje, -14));
  const minimo = 30;
  const total = (m: Metricas) => m.cartao.total + m.pix.total;
  if (rec.conversao === null || ant.conversao === null || total(rec) < minimo || total(ant) < minimo) return null;
  const queda = ant.conversao - rec.conversao;
  if (queda < limitePp) return null;
  // Teste de duas proporções (95%): com poucos pedidos a queda pode ser só acaso.
  const [n1, n2] = [ant.cartao.total + ant.pix.total + 0, rec.cartao.total + rec.pix.total + 0];
  const [p1, p2] = [ant.conversao / 100, rec.conversao / 100];
  const pool = (p1 * n1 + p2 * n2) / (n1 + n2), se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  if (se > 0 && (p1 - p2) / se < 1.96) return null;
  const qCartao = ant.cartao.pct !== null && rec.cartao.pct !== null ? ant.cartao.pct - rec.cartao.pct : 0;
  const qPix = ant.pix.pct !== null && rec.pix.pct !== null ? ant.pix.pct - rec.pix.pct : 0;
  const forma = qCartao >= limitePp && qCartao > qPix ? 'cartao' : qPix >= limitePp && qPix > qCartao ? 'pix' : 'geral';
  return {recente: rec, anterior: ant, queda, qCartao, qPix, forma} as const;
}
