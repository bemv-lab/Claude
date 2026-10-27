// Previsão de caixa dos próximos dias: o que entra, o que precisa ser pago (fornecedor e Meta) e se dá para usar o saldo ou é hora de sacar.
// Funções puras: a tela, o painel inicial e o conector MCP usam as mesmas contas.

const soma = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

export type EntradaCaixa = {
  hoje: string;
  saldoConta: number; // saldo do extrato (sem o CDB de garantia)
  cartpanda: {
    disponivel: number; // já liberado na Cartpanda e ainda não sacado
    liberacoes: {dia: string; valor: number}[]; // cartão a liberar (D+2) e devolução da reserva, com a data
    pixPorDia: number; // Pix líquido médio por dia (entra no próprio dia, já sem a reserva)
    cartaoPorDia: number; // cartão líquido médio por dia (entra em D+prazo)
    prazoCartao: number;
  };
  fornecedor: {
    pendentes: number; // custo dos pedidos pagos há até 2 dias sem compra vinculada
    porDia: number; // custo médio diário dos pedidos pagos (últimos 14 dias)
  };
  meta: {
    gastoDiario: number; // gasto médio diário (sem imposto), últimos 7 dias
    acumulado: number | null; // gasto desde a última cobrança (sem imposto); null se não houve cobrança lançada
    limite: number; // gasto que dispara a cobrança (R$ 3.000)
    saldoDevedor: number; // cobranças que falharam e entram na próxima
    impostoPct: number;
    ultimaCobranca: string | null;
  };
  saque: {taxa: number; nUltimos30: number}; // R$ 4,90 por saque
  colchao: number; // dinheiro que a Bárbara quer sempre manter na conta
  fatura: {valor: number; vencimento: string | null}; // fatura aberta do cartão PJ
  devidoSocio: number; // despesas pagas no cartão pessoal ainda não reembolsadas
};

export type DiaCaixa = {dia: string; entra: number; vendas: number; fornecedor: number; meta: number; fatura: number; saldo: number};

/** Quando e quanto a Meta vai cobrar (gasto que atinge o limite, mais imposto, mais o saldo devedor). */
export function proximaCobrancaMeta(m: EntradaCaixa['meta'], hoje: string) {
  const restante = m.acumulado === null ? m.limite : Math.max(0, m.limite - m.acumulado);
  const dias = restante <= 0 ? 0 : m.gastoDiario > 0 ? Math.ceil(restante / m.gastoDiario) : null;
  const valor = m.limite * (1 + m.impostoPct / 100) + m.saldoDevedor;
  return {dias, dia: dias === null ? null : soma(hoje, dias), valor, acumulado: m.acumulado, restante};
}

export function previsaoCaixa(x: EntradaCaixa, horizonte = 10) {
  const cob = proximaCobrancaMeta(x.meta, x.hoje);
  const dias: DiaCaixa[] = [];
  let saldo = x.saldoConta + x.cartpanda.disponivel;
  let minimo = saldo, diaMinimo = x.hoje;
  for (let d = 1; d <= horizonte; d++) {
    const dia = soma(x.hoje, d);
    const liberado = x.cartpanda.liberacoes.filter((l) => l.dia === dia).reduce((s, l) => s + l.valor, 0);
    const vendas = x.cartpanda.pixPorDia + (d >= x.cartpanda.prazoCartao + 1 ? x.cartpanda.cartaoPorDia : 0);
    const fornecedor = x.fornecedor.porDia + (d === 1 ? x.fornecedor.pendentes : 0);
    const meta = cob.dias !== null && Math.max(cob.dias, 1) === d ? cob.valor : 0;
    const fatura = x.fatura.vencimento === dia ? x.fatura.valor : 0;
    saldo += liberado + vendas - fornecedor - meta - fatura;
    dias.push({dia, entra: liberado, vendas, fornecedor, meta, fatura, saldo});
    if (saldo < minimo) { minimo = saldo; diaMinimo = dia; }
  }

  // Necessidade até 3 e 10 dias: fornecedor (pendentes + média) e Meta (cobrança dentro do prazo).
  const fornecedorAte = (n: number) => x.fornecedor.pendentes + x.fornecedor.porDia * n;
  const metaAte = (n: number) => (cob.dias !== null && Math.max(cob.dias, 1) <= n ? cob.valor : 0);
  const faturaAte = (n: number) => (x.fatura.vencimento && x.fatura.vencimento <= soma(x.hoje, n) ? x.fatura.valor : 0);
  const necessidade3 = fornecedorAte(3) + metaAte(3) + faturaAte(3);
  const necessidade10 = fornecedorAte(10) + metaAte(10) + faturaAte(10);
  const folgaConta3 = x.saldoConta - necessidade3 - x.colchao;
  // Folga para as otimizações: o que sobra depois de tudo o que vence em 10 dias e do que a empresa deve à Bárbara.
  const comprometido10 = {fornecedor: fornecedorAte(10), meta: metaAte(10), fatura: faturaAte(10), socio: x.devidoSocio, colchao: x.colchao};
  const folgaTotal10 = x.saldoConta + x.cartpanda.disponivel - necessidade10 - x.colchao - x.devidoSocio;

  let recomendacao: {tipo: 'usar' | 'sacar' | 'falta'; titulo: string; detalhe: string; saque: number};
  if (folgaConta3 >= 0) {
    recomendacao = {tipo: 'usar', saque: 0, titulo: 'Pode pagar os pedidos com o saldo da conta.',
      detalhe: `Depois de pagar o fornecedor dos próximos 3 dias${faturaAte(3) ? ', a fatura do cartão PJ' : ''} e separar a cobrança da Meta, ainda sobram R$ ${fmt(folgaConta3)} na conta. Não precisa sacar agora (cada saque custa R$ ${fmt(x.saque.taxa)}).${x.devidoSocio > 0 ? ` Lembrete: a empresa ainda deve R$ ${fmt(x.devidoSocio)} à Bárbara; reembolsar tudo agora deixaria R$ ${fmt(folgaConta3 - x.devidoSocio)}.` : ''}`};
  } else if (x.saldoConta + x.cartpanda.disponivel - necessidade3 - x.colchao >= 0) {
    const saque = Math.ceil(-folgaConta3);
    recomendacao = {tipo: 'sacar', saque, titulo: `Peça um saque de pelo menos R$ ${fmt(saque)}.`,
      detalhe: `A conta tem R$ ${fmt(x.saldoConta)}, mas fornecedor${faturaAte(3) ? ', fatura do cartão' : ''} e Meta pedem R$ ${fmt(necessidade3)} nos próximos 3 dias. Sem o saque, pagar os pedidos comeria o dinheiro reservado para a Meta. A Cartpanda tem cerca de R$ ${fmt(x.cartpanda.disponivel)} liberados.`};
  } else {
    const falta = Math.ceil(necessidade3 + x.colchao - x.saldoConta - x.cartpanda.disponivel);
    recomendacao = {tipo: 'falta', saque: Math.max(0, Math.floor(x.cartpanda.disponivel)), titulo: `Faltam cerca de R$ ${fmt(falta)} para os próximos 3 dias, mesmo sacando tudo.`,
      detalhe: `Conta R$ ${fmt(x.saldoConta)} + liberado na Cartpanda R$ ${fmt(x.cartpanda.disponivel)} contra R$ ${fmt(necessidade3)} de fornecedor, Meta${faturaAte(3) ? ' e fatura do cartão' : ''}. Entram ainda ${fmt(x.cartpanda.liberacoes.filter((l) => l.dia <= soma(x.hoje, 3)).reduce((s, l) => s + l.valor, 0))} liberados até lá. Pague primeiro a Meta (a cobrança falha se o cartão não passa) e segure compras de fornecedor sem pedido pago.`};
  }
  return {cob, dias, minimo, diaMinimo, necessidade3, necessidade10, folgaConta3, folgaTotal10, comprometido10, recomendacao};
}

const fmt = (n: number) => n.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});

export type Portao = {chave: string; nome: string; capital: number; ganho: string; aberto: boolean; falta: number; observacao: string};

/**
 * Otimizações que dependem de caixa. Cada uma "abre" quando a folga livre (depois do que já está comprometido nos próximos 10 dias)
 * passa de 1,5× o dinheiro que ela deixa parado. Até lá ficam no radar.
 */
export function portoesDeCaixa(folgaLivre: number, itens: Omit<Portao, 'aberto' | 'falta'>[]): Portao[] {
  return itens.map((i) => {
    const preciso = i.capital * 1.5;
    return {...i, aberto: i.capital > 0 && folgaLivre >= preciso, falta: Math.max(0, preciso - folgaLivre)};
  });
}
