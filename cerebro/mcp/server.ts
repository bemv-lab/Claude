// Conector "rocco-cerebro": dá a qualquer conversa com o Claude acesso aos números e à memória da Rocco.
// Roda por stdio: `npm run mcp` (o Claude Code chama sozinho via .mcp.json na raiz do repositório).
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {db} from '../lib/db';
import {alertas, avisosDeCustos, caixaPrevisto, custosDosProdutos, entrada, faturaCartaoPJ, lerConfig, lerFormas, lerMemoria, lerPlanos, lerProdutos, mesAtual, periodo, radar30, resumoMes, saldoComSocio, saldosBanco, ultimaImportacao, hoje} from '../lib/dados';
import {dreMes, resumo, ranking} from '../lib/financeiro';
import {CATEGORIAS, ehCategoria, fmtBRL, fmtNum, fmtPct, precificar, taxaMedia, type Produto} from '../lib/calc';

const srv = new McpServer({name: 'rocco-cerebro', version: '0.1.0'});
const texto = (t: string) => ({content: [{type: 'text' as const, text: t}]});

function blocoProdutos() {
  const cfg = lerConfig(), formas = lerFormas();
  return lerProdutos().map((p) => {
    const r = precificar(p, cfg, formas);
    return `- ${p.nome}${p.exemplo ? ' (valores de exemplo)' : ''}: preço ${fmtBRL(p.preco)}, custo ${fmtBRL(p.custo)}, MC ${fmtBRL(r.mc)} (${fmtPct(r.mcPct)}), CPA máx no Gerenciador ${fmtBRL(r.cpaMax)}, ROAS break-even ${fmtNum(r.roasBE)}, lucro/pedido no CPA alvo ${fmtBRL(r.lucro)}`;
  }).join('\n');
}

function blocoMes(mes: string) {
  const r = resumoMes(mes);
  return [
    `Receita paga ${fmtBRL(r.receita)} · ${r.pagos.n} pedidos pagos · ${r.pendentes.n} pendentes · ticket ${fmtBRL(r.ticket)} · conversão ${fmtPct(r.conversao)}`,
    `Custo dos produtos ${fmtBRL(r.custo)}${r.semCusto ? ` (${r.semCusto} produto(s) sem custo cadastrado)` : ''} · anúncios ${fmtBRL(r.ads.total)} (Meta ${fmtBRL(r.ads.facebook)})`,
    `Checkout ${fmtBRL(r.checkout)} · gateway ${fmtBRL(r.gateway)} · DAS ${fmtBRL(r.imposto)}${r.impostoEstimado ? ' (estimado)' : ''} · imposto Meta ${fmtBRL(r.impostoMeta)}`,
    `Lucro ${fmtBRL(r.lucro)} (${fmtPct(r.margem)}) · ROI ${r.roi === null ? '–' : fmtPct(r.roi)} · CPA ${r.cpa === null ? '–' : fmtBRL(r.cpa)} no Gerenciador / ${r.cpaReal === null ? '–' : fmtBRL(r.cpaReal)} real (com imposto Meta) · despesas lançadas ${fmtBRL(r.adicionais)}`,
  ].join('\n');
}

function blocoDre(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const d = dreMes(entrada(`${mes}-01`, fim), mes);
  return [
    `DRE ${mes} (data de pagamento). Receitas ${fmtBRL(d.totalReceitas)}: ${Object.entries(d.receitas).filter(([, v]) => v).map(([k, v]) => `${k} ${fmtBRL(v)}`).join(', ')}`,
    ...d.despesas.map(([n, v]) => `- ${n}: ${fmtBRL(v)}`),
    `Lucro ${fmtBRL(d.lucro)} · margem ${fmtPct(d.margem)} · ROI ${d.roi === null ? '–' : fmtPct(d.roi)}`,
  ].join('\n');
}

srv.registerTool('contexto_rocco', {
  description: 'Resumo atual da Rocco Kids: taxas e impostos, produtos com margem e CPA máximo, resultado do mês, alertas, planos e as decisões mais recentes. Chame no começo de qualquer conversa sobre a Rocco.',
  inputSchema: {},
}, async () => {
  const cfg = lerConfig(), formas = lerFormas();
  const {taxa} = taxaMedia(formas);
  const mes = mesAtual();
  return texto([
    `# Cérebro Rocco · ${hoje()}`,
    `## Taxas`,
    `DAS ${fmtPct(cfg.das_pct)} · checkout ${fmtPct(cfg.plataforma_pct)} · imposto Meta ${fmtPct(cfg.meta_imposto_pct)} sobre o gasto do Gerenciador · taxa média de pagamento ${fmtPct(taxa)}`,
    `Cartão cai em D+${cfg.prazo_cartao}; a loja assume os juros de parcelamento até ${cfg.parcelas_sem_juros}x; Pix ${fmtPct(cfg.pix_pct)}; boleto ${fmtBRL(cfg.boleto_fixo)}; sem taxa fixa por pedido.`,
    formas.map((f) => `- ${f.nome}: taxa ${fmtPct(f.taxa_pct)}, ${fmtPct(f.mix_pct)} dos pedidos`).join('\n'),
    `## Produtos`, blocoProdutos() || '(nenhum)',
    `## Mês ${mes}`, blocoMes(mes),
    `## Caixa`, (() => {
      const fat = faturaCartaoPJ(), socio = saldoComSocio();
      return [...saldosBanco().map((b) => `Saldo na conta PJ: ${fmtBRL(b.saldo)} em ${b.em}`),
        `Cartão PJ: fatura aberta ${fmtBRL(fat.total)} (vence ${fat.vencimento}), limite disponível ${fmtBRL(fat.disponivel)} de ${fmtBRL(fat.limite)}`,
        `A empresa deve à Bárbara ${fmtBRL(socio.aReembolsar)} (pago no cartão pessoal ${fmtBRL(socio.pago)}, reembolsado ${fmtBRL(socio.reembolsado)})`].join('\n');
    })(),
    `## Planos e gatilhos`, lerPlanos().map((p) => `- ${p.servico} · ${p.plano}: R$ ${p.custo_mensal}/mês, ${fmtPct(p.taxa_pct)}, reavaliar em ${p.gatilho_pedidos} pedidos/mês → ${p.proximo}. ${p.obs}`).join('\n') || '(nenhum)',
    `## Alertas`, alertas(mes).map((a) => `- [${a.onde}] ${a.texto}`).join('\n') || '(nenhum)',
    `## Memória recente`, lerMemoria('', 20).map((m) => `- ${m.criado_em.slice(0, 10)} [${m.area}] ${m.texto}`).join('\n'),
  ].join('\n\n'));
});

srv.registerTool('custos', {
  description: 'Radar de custos dos últimos 30 dias: taxa de pagamento, juros de parcelamento que a loja assume (e quanto custaria assumir menos), prazo de recebimento do cartão (D+2, D+5, D+14), Pix contra cartão, DAS efetivo estimado e o que o sistema questiona.',
  inputSchema: {},
}, async () => {
  const x = radar30();
  return texto([
    `Últimos 30 dias (${x.ini} a ${x.fim}): receita ${fmtBRL(x.r.receita)}, ${x.r.pagos.n} pedidos pagos`,
    `Taxa de pagamento (gateway + checkout): ${fmtPct(x.taxaTotalPct)} da receita. Tendência: 4 últimas semanas ${fmtPct(x.tendencia.recente)}, 4 anteriores ${fmtPct(x.tendencia.anterior)}`,
    `Juros assumidos por oferecer sem juros até ${x.cfg.parcelas_sem_juros}x: ${fmtBRL(x.juros.valor)} (${fmtPct(x.juros.pctReceita)} da receita). Cada pedido extra rende ~${fmtBRL(x.margemExtra)}.`,
    'Custo de assumir os juros até Nx (por mês): ' + x.simulacao.map((s2) => `${s2.ate}x ${fmtBRL(s2.custo)}${s2.atual ? ' (hoje)' : ''}`).join(' · '),
    'Prazo de recebimento: ' + x.prazos.map((p2) => `D+${p2.dias} ${fmtPct(p2.pct)}${p2.atual ? ' (hoje)' : `, economiza ${fmtBRL(p2.economia)}/mês, ${fmtBRL(p2.capital)} parados, líquido ${fmtBRL(p2.liquido)}`}`).join(' | '),
    `Cartão custa ${fmtPct(x.pix.pctCartao)} contra ${fmtPct(x.pix.pctPix)} do Pix; cada pedido que migra economiza ${fmtBRL(x.pix.economiaPorPedido)}; desconto no Pix de até ${fmtPct(x.pix.descontoMax)} ainda compensa.`,
    `Parcelamento no cartão: média de ${fmtNum(x.mix.mediaParcelas, 1)}x; ${fmtPct(x.mix.avista)} à vista, ${fmtPct(x.mix.ate3)} até 3x. Compradores afetados e tolerância por cenário: ` + x.simulacao.filter((s2) => s2.ate <= 6).map((s2) => `${s2.ate}x → ${s2.afetados} afetados, economia ${fmtBRL(s2.economia)}${s2.toleranciaPct === null ? '' : `, aguenta perder ${fmtPct(s2.toleranciaPct)} deles`}`).join(' | '),
    `Pix contra cartão: conversão do Pix ${x.pix.conversaoPix === null ? '–' : fmtPct(x.pix.conversaoPix)}; o cartão recusado não vira pedido, então as conversões não são comparáveis. A economia só é real se o comprador migrar em vez de desistir.`,
    `Imposto da Meta nos últimos 30 dias: ${fmtBRL(x.r.impostoMeta)} sobre ${fmtBRL(x.r.ads.total)} de anúncios. CPA no Gerenciador ${x.r.cpa === null ? '–' : fmtBRL(x.r.cpa)}, CPA real ${x.r.cpaReal === null ? '–' : fmtBRL(x.r.cpaReal)}; ROAS no Gerenciador ${x.r.roas === null ? '–' : fmtNum(x.r.roas)}, real ${x.r.roasReal === null ? '–' : fmtNum(x.r.roasReal)}.`,
    `Saques: ${x.repasse.saques} nos últimos 30 dias a ${fmtBRL(x.repasse.custoPorSaque)} cada = ${fmtBRL(x.repasse.custo)}.`,
    '## O que o sistema questiona', ...(avisosDeCustos(x).map((a2) => `- [${a2.onde}] ${a2.texto}`)),
  ].join('\n'));
});

srv.registerTool('caixa', {
  description: 'Previsão de caixa dos próximos 10 dias: saldo da conta, liberado na Cartpanda, fornecedor a pagar, cobrança prevista da Meta, se dá para usar o saldo ou é hora de sacar (R$ 4,90 por saque), e as otimizações que esperam por caixa (D+5, D+14, saque em lote, Shopify anual).',
  inputSchema: {},
}, async () => {
  const {x, prev, portoes} = caixaPrevisto();
  return texto([
    `Caixa em ${x.hoje}: conta PJ ${fmtBRL(x.saldoConta)}${x.saldoContaEm ? ` (extrato de ${x.saldoContaEm})` : ''}; liberado na Cartpanda ${fmtBRL(x.cartpanda.disponivel)} (${x.origemCartpanda}); colchão ${fmtBRL(x.colchao)}`,
    `Fornecedor: ${fmtBRL(x.fornecedor.pendentes)} de pedidos recentes sem compra vinculada + ${fmtBRL(x.fornecedor.porDia)} por dia`,
    `Meta: ${prev.cob.dia ? `cobrança de ~${fmtBRL(prev.cob.valor)} prevista para ${prev.cob.dia}` : 'sem previsão'} (gasto ${fmtBRL(x.meta.gastoDiario)} por dia, saldo devedor ${fmtBRL(x.meta.saldoDevedor)})`,
    `## Recomendação: ${prev.recomendacao.titulo}`, prev.recomendacao.detalhe,
    '## Dia a dia', ...prev.dias.map((d) => `${d.dia}: liberações ${fmtBRL(d.entra)}, vendas novas ${fmtBRL(d.vendas)}, fornecedor ${fmtBRL(d.fornecedor)}, Meta ${fmtBRL(d.meta)}, fatura PJ ${fmtBRL(d.fatura)} → saldo ${fmtBRL(d.saldo)}`),
    `Saques nos últimos 30 dias: ${x.saques} (R$ ${x.saque.taxa.toFixed(2).replace('.', ',')} cada)`,
    `Folga para otimizações (10 dias): ${fmtBRL(prev.folgaTotal10)} depois de fornecedor, Meta, fatura do cartão PJ (${fmtBRL(prev.comprometido10.fatura)}) e do que a empresa deve à Bárbara (${fmtBRL(prev.comprometido10.socio)})`,
    '## Aguardando caixa', ...portoes.map((q) => `- ${q.nome}: ${q.capital ? `${fmtBRL(q.capital)} parados` : 'sem valor'}, ${q.aberto ? 'JÁ DÁ PARA FAZER' : `faltam ${fmtBRL(q.falta)} de folga`}. ${q.ganho}`),
  ].join('\n'));
});

srv.registerTool('custo_produtos', {
  description: 'Custo de cada produto: média dos pagamentos a fornecedor (valor pago ÷ unidades), com quantos pagamentos e unidades a sustentam.',
  inputSchema: {},
}, async () => texto(custosDosProdutos().map((c) => `- ${c.nome}: ${c.custo ? fmtBRL(c.custo) : 'sem custo'} (${c.origem === 'media' ? `média de ${c.compras} pagamento(s) para ${c.unidades} unidade(s)` : c.origem === 'manual' ? 'estimativa digitada' : 'sem pagamento vinculado'})`).join('\n')));

srv.registerTool('buscar_memoria', {
  description: 'Busca decisões, aprendizados e regras gravados na memória da Rocco.',
  inputSchema: {termo: z.string().describe('Palavra ou trecho; vazio lista as mais recentes')},
}, async ({termo}) => {
  const m = lerMemoria(termo, 50);
  return texto(m.length ? m.map((x) => `#${x.id} ${x.criado_em.slice(0, 10)} [${x.area}] (${x.autor}) ${x.texto}`).join('\n') : 'Nada encontrado.');
});

srv.registerTool('registrar_memoria', {
  description: 'Grava uma decisão ou aprendizado na memória compartilhada da Rocco, para as próximas conversas. Use quando a Bárbara ou o Lucas decidirem algo, ou quando um teste trouxer um aprendizado.',
  inputSchema: {
    area: z.enum(['financeiro', 'campanhas', 'criativos', 'produto', 'operação', 'contabilidade', 'regra fixa', 'geral']),
    texto: z.string().min(5).describe('O que foi decidido e por quê, em uma ou duas frases'),
  },
}, async ({area, texto: t}) => {
  const r = db().prepare('INSERT INTO memoria (area, texto, autor) VALUES (?,?,?)').run(area, t, 'Claude');
  return texto(`Gravado (#${r.lastInsertRowid}).`);
});

srv.registerTool('precificar', {
  description: 'Calcula margem, CPA máximo, ROAS de break-even e lucro por pedido de um produto cadastrado, com ajustes hipotéticos opcionais (ex.: e se o preço for 179?).',
  inputSchema: {
    produto: z.string().describe('Nome (ou parte) do produto cadastrado'),
    preco: z.number().optional(), custo: z.number().optional(), frete: z.number().optional(), cpa_alvo: z.number().optional(),
  },
}, async ({produto, ...ajustes}) => {
  const p = lerProdutos().find((x) => x.nome.toLowerCase().includes(produto.toLowerCase()));
  if (!p) return texto(`Produto não encontrado. Cadastrados: ${lerProdutos().map((x) => x.nome).join(', ')}`);
  const q: Produto = {...p, ...Object.fromEntries(Object.entries(ajustes).filter(([, v]) => v !== undefined))};
  const r = precificar(q, lerConfig(), lerFormas());
  return texto([
    `${q.nome}${p.exemplo ? ' (valores de exemplo)' : ''}`,
    ...r.linhas.map(([k, v]) => `${k}: ${fmtBRL(v)}`),
    `Margem de contribuição: ${fmtBRL(r.mc)} (${fmtPct(r.mcPct)})`,
    `CPA máximo no Gerenciador: ${fmtBRL(r.cpaMax)} · ROAS break-even: ${fmtNum(r.roasBE)}`,
    `No CPA alvo ${fmtBRL(r.cpaAlvo)} (+ imposto Meta ${fmtBRL(r.impostoMidia)}): lucro ${fmtBRL(r.lucro)} por pedido (${fmtPct(r.lucroPct)})`,
  ].join('\n'));
});

srv.registerTool('dre', {
  description: 'DRE de um mês (Simples Nacional, comércio) a partir dos lançamentos.',
  inputSchema: {mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('AAAA-MM; padrão: mês atual')},
}, async ({mes}) => texto(blocoDre(mes ?? mesAtual())));

srv.registerTool('financeiro', {
  description: 'Números do período como no dashboard financeiro (pedidos da Shopify + anúncios da Meta + despesas): receita, custos, taxas, DAS, imposto Meta, lucro, CPA, ROI e o ranking de produtos.',
  inputSchema: {periodo: z.enum(['hoje', 'ontem', '7d', '30d', 'mes', 'mes-passado']).default('7d'), de: z.string().optional(), ate: z.string().optional()},
}, async ({periodo: p, de, ate}) => {
  const per = periodo({p, de, ate});
  const e = entrada(per.ini, per.fim);
  const r = resumo(e, per.ini, per.fim);
  const rk = ranking(r, e).slice(0, 10);
  return texto([
    `Período ${per.ini} a ${per.fim}`,
    `Receita ${fmtBRL(r.receita)} · ${r.pagos.n} pagos · ${r.pendentes.n} pendentes (${fmtBRL(r.pendentes.v)}) · conversão ${fmtPct(r.conversao)} · ticket ${fmtBRL(r.ticket)}`,
    `Custo ${fmtBRL(r.custo)} · anúncios ${fmtBRL(r.ads.total)} · checkout ${fmtBRL(r.checkout)} · gateway ${fmtBRL(r.gateway)} · DAS ${fmtBRL(r.imposto)} · imposto Meta ${fmtBRL(r.impostoMeta)}`,
    `Lucro ${fmtBRL(r.lucro)} (${fmtPct(r.margem)}) · CPA ${r.cpa === null ? '–' : fmtBRL(r.cpa)} (real ${r.cpaReal === null ? '–' : fmtBRL(r.cpaReal)}) · ROAS ${r.roas === null ? '–' : fmtNum(r.roas)} (real ${r.roasReal === null ? '–' : fmtNum(r.roasReal)}) · ROI ${r.roi === null ? '–' : fmtPct(r.roi)}`,
    'Produtos (lucro):', ...rk.map((x) => `- ${x.nome}: receita ${fmtBRL(x.receita)}, custo ${x.semCusto ? 'SEM CUSTO' : fmtBRL(x.custo)}, marketing ${fmtBRL(x.marketing)}, lucro ${fmtBRL(x.lucro)} (${fmtPct(x.margem)})`),
  ].join('\n'));
});

srv.registerTool('lancar', {
  description: `Registra um lançamento financeiro. Contas: ${Object.entries(CATEGORIAS).map(([k, c]) => `${k} (${c.nome})`).join(', ')}. Confirme valores com a pessoa antes de lançar.`,
  inputSchema: {
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), categoria: z.string(), valor: z.number().positive().describe('Em reais'),
    descricao: z.string().default(''), pedidos: z.number().int().min(0).default(0),
    gasto_do_gerenciador: z.boolean().default(false).describe('Para mídia: valor sem imposto copiado do Gerenciador; lança o imposto Meta junto'),
  },
}, async (a) => {
  if (!ehCategoria(a.categoria)) return texto(`Conta inválida: ${a.categoria}`);
  const d = db();
  const r = d.prepare("INSERT INTO lancamentos (data, categoria, descricao, valor_centavos, pedidos, origem, criado_por) VALUES (?,?,?,?,?,'claude','Claude')")
    .run(a.data, a.categoria, a.descricao, Math.round(a.valor * 100), a.pedidos);
  let extra = '';
  if (a.categoria === 'midia' && a.gasto_do_gerenciador) {
    const pct = lerConfig().meta_imposto_pct, imp = Math.round(a.valor * pct);
    d.prepare("INSERT INTO lancamentos (data, categoria, descricao, valor_centavos, origem, vinculo, criado_por) VALUES (?,?,?,?,'automatico',?,'Claude')")
      .run(a.data, 'imposto_midia', `Imposto Meta ${pct}% sobre ${a.descricao || 'mídia'}`, imp, Number(r.lastInsertRowid));
    extra = ` + imposto Meta ${fmtBRL(imp / 100)}`;
  }
  return texto(`Lançado #${r.lastInsertRowid}: ${CATEGORIAS[a.categoria].nome} ${fmtBRL(a.valor)}${extra}.`);
});

srv.registerTool('avaliar_campanhas', {
  description: 'Esteira de testes da última importação da Meta: cada anúncio classificado em teste, validação, escala ou pausar, com o motivo.',
  inputSchema: {},
}, async () => {
  const u = ultimaImportacao();
  if (!u) return texto('Nenhuma importação da Meta ainda.');
  return texto([`Importação ${u.imp.arquivo} ${u.imp.periodo} · CPA máx ${fmtBRL(u.ref?.cpaMax ?? 0)} · ROAS BE ${fmtNum(u.ref?.roasBE ?? 0)}`,
    ...u.ads.map((a) => `- [${a.etapa}] ${a.anuncio}: ${fmtBRL(a.gasto)}, ${a.compras} vendas. ${a.motivo}`)].join('\n'));
});

srv.connect(new StdioServerTransport()).catch((e) => { console.error(e); process.exit(1); });
