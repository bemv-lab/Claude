// Conector "rocco-cerebro": dá a qualquer conversa com o Claude acesso aos números e à memória da Rocco.
// Roda por stdio: `npm run mcp` (o Claude Code chama sozinho via .mcp.json na raiz do repositório).
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {db} from '../lib/db';
import {alertas, lerConfig, lerFormas, lerMemoria, lerPlanos, lerProdutos, mesAtual, resumoMes, ultimaImportacao, hoje} from '../lib/dados';
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
    `Receita ${fmtBRL(r.grupos.receita)} · ${r.pedidos} pedidos · ticket ${fmtBRL(r.ticketMedio)}`,
    `Deduções ${fmtBRL(r.grupos.deducoes)} · CMV ${fmtBRL(r.grupos.cmv)} · variáveis ${fmtBRL(r.grupos.variaveis)} · marketing ${fmtBRL(r.grupos.marketing)} (imposto Meta ${fmtBRL(r.porCategoria.imposto_midia ?? 0)})`,
    `Fixas ${fmtBRL(r.grupos.fixas)} · financeiras ${fmtBRL(r.grupos.financeiras)} · outras receitas ${fmtBRL(r.grupos.outras)}`,
    `Margem de contribuição ${fmtBRL(r.margemContribuicao)} · resultado ${fmtBRL(r.resultado)} (${fmtPct(r.margemLiquidaPct)}) · ROAS real ${r.roasReal === null ? '–' : fmtNum(r.roasReal)}`,
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
    `DAS ${fmtPct(cfg.das_pct)} · plataforma ${fmtPct(cfg.plataforma_pct)} · imposto Meta ${fmtPct(cfg.meta_imposto_pct)} sobre o gasto do Gerenciador · taxa média de pagamento ${fmtPct(taxa)}${cfg.taxas_exemplo ? ' (TAXAS DE EXEMPLO, ainda não confirmadas)' : ''}`,
    formas.map((f) => `- ${f.nome}: taxa ${fmtPct(f.taxa_pct)}, ${fmtPct(f.mix_pct)} dos pedidos`).join('\n'),
    `## Produtos`, blocoProdutos() || '(nenhum)',
    `## Mês ${mes}`, blocoMes(mes),
    `## Planos e gatilhos`, lerPlanos().map((p) => `- ${p.servico} · ${p.plano}: R$ ${p.custo_mensal}/mês, ${fmtPct(p.taxa_pct)}, reavaliar em ${p.gatilho_pedidos} pedidos/mês → ${p.proximo}. ${p.obs}`).join('\n') || '(nenhum)',
    `## Alertas`, alertas(mes).map((a) => `- [${a.onde}] ${a.texto}`).join('\n') || '(nenhum)',
    `## Memória recente`, lerMemoria('', 20).map((m) => `- ${m.criado_em.slice(0, 10)} [${m.area}] ${m.texto}`).join('\n'),
  ].join('\n\n'));
});

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
}, async ({mes}) => texto(blocoMes(mes ?? mesAtual())));

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
