'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {db} from '@/lib/db';
import {COOKIE, criarToken} from '@/lib/sessao';
import {confereSenha} from '@/lib/senha';
import {usuarioAtual} from '@/lib/usuario';
import {ehCategoria, lerNumero} from '@/lib/calc';
import {lerConfig} from '@/lib/dados';
import {lerExportMeta} from '@/lib/csv';

// Toda ação confere a sessão: o middleware protege as páginas, não as chamadas de ação.
async function exigir() {
  const u = await usuarioAtual();
  if (!u) redirect('/login');
  return u;
}
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => lerNumero(txt(fd, k));
const centavos = (fd: FormData, k: string) => Math.round(num(fd, k) * 100);
const pronto = (...caminhos: string[]) => caminhos.forEach((c) => revalidatePath(c));

export async function entrar(_: unknown, fd: FormData) {
  const email = txt(fd, 'email').toLowerCase();
  const u = db().prepare('SELECT email, senha FROM usuarios WHERE email = ?').get(email) as {email: string; senha: string} | undefined;
  if (!u || !confereSenha(txt(fd, 'senha'), u.senha)) return {erro: 'E-mail ou senha incorretos.', email};
  const {token, maxAge} = await criarToken(u.email);
  (await cookies()).set(COOKIE, token, {httpOnly: true, sameSite: 'lax', path: '/', maxAge, secure: process.env.CEREBRO_COOKIE_SEGURO === '1'});
  redirect('/');
}

export async function sair() {
  (await cookies()).delete(COOKIE);
  redirect('/login');
}

// ---------- Produtos ----------

export async function salvarProduto(fd: FormData) {
  await exigir();
  const id = Number(fd.get('id'));
  const d = db();
  // O custo vem da média dos pagamentos a fornecedor; só vale o digitado enquanto não há pagamento vinculado.
  const {lerCustosMedios} = await import('@/lib/dados');
  const ext = (d.prepare('SELECT shopify_id FROM produtos WHERE id = ?').get(id) as {shopify_id: string | null} | undefined)?.shopify_id;
  const custoAuto = !!ext && lerCustosMedios().medios.has(ext);
  d.prepare(`UPDATE produtos SET nome = ?, preco = ?, ${custoAuto ? '' : 'custo = ?, '}frete = ?, embalagem = ?, outros = ?, cpa_alvo = ?, exemplo = 0, atualizado_em = datetime('now') WHERE id = ?`)
    .run(...[txt(fd, 'nome') || 'Sem nome', num(fd, 'preco'), ...(custoAuto ? [] : [num(fd, 'custo')]), num(fd, 'frete'), num(fd, 'embalagem'), num(fd, 'outros'), num(fd, 'cpa_alvo'), id]);
  pronto('/precificacao', '/', '/campanhas');
}

export async function novoProduto() {
  await exigir();
  const r = db().prepare("INSERT INTO produtos (nome, cpa_alvo) VALUES ('Novo produto', ?)").run(lerConfig().cpa_alvo_padrao);
  redirect(`/precificacao?p=${r.lastInsertRowid}`);
}

export async function arquivarProduto(fd: FormData) {
  await exigir();
  db().prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(Number(fd.get('id')));
  redirect('/precificacao');
}

// ---------- Taxas, impostos e planos ----------

export async function salvarConfig(fd: FormData) {
  await exigir();
  const up = db().prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  const chaves = ['das_pct', 'plataforma_pct', 'meta_imposto_pct', 'cpa_alvo_padrao', 'meta_mes', 'reserva_pct', 'reserva_dias', 'prazo_cartao',
    'pix_pct', 'boleto_fixo', 'parcelas_sem_juros', 'taxa_repasse', 'custo_capital_mensal', 'meta_limite_cobranca', 'meta_saldo_devedor', 'colchao_caixa', 'shopify_anual_brl',
    'cartao_pj_limite', 'cartao_pj_fechamento', 'cartao_pj_vencimento'];
  for (const k of chaves) if (fd.has(k)) up.run(k, num(fd, k));
  // Prazo e "sem juros até Nx" valem a partir de hoje: o histórico mantém os pedidos antigos na regra da época.
  const d = db();
  const hojeSP = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'});
  const atual = d.prepare('SELECT prazo_cartao, sem_juros FROM politica_taxas ORDER BY desde DESC LIMIT 1').get() as {prazo_cartao: number; sem_juros: number} | undefined;
  const cfg = lerConfig();
  if (!atual || atual.prazo_cartao !== cfg.prazo_cartao || atual.sem_juros !== cfg.parcelas_sem_juros)
    d.prepare('INSERT INTO politica_taxas (desde, prazo_cartao, sem_juros) VALUES (?, ?, ?) ON CONFLICT(desde) DO UPDATE SET prazo_cartao = excluded.prazo_cartao, sem_juros = excluded.sem_juros').run(hojeSP, cfg.prazo_cartao, cfg.parcelas_sem_juros);
  pronto('/taxas', '/precificacao', '/', '/campanhas', '/financeiro', '/financeiro/custos', '/financeiro/banco');
}

/** Tabela de taxa por prazo de recebimento e de juros por parcela (a Cartpanda pode mudar). */
export async function salvarTabelasTaxas(fd: FormData) {
  await exigir();
  const d = db();
  const prazo = d.prepare('UPDATE cartao_prazos SET pct = ? WHERE dias = ?');
  const juros = d.prepare('UPDATE juros_parcela SET pct = ? WHERE parcelas = ?');
  for (const k of fd.keys()) {
    const m = k.match(/^(prazo|juros)_(\d+)$/);
    if (!m) continue;
    (m[1] === 'prazo' ? prazo : juros).run(num(fd, k), Number(m[2]));
  }
  d.prepare("UPDATE config SET valor = 0 WHERE chave = 'gateway_exemplo'").run();
  pronto('/taxas', '/precificacao', '/financeiro', '/financeiro/custos', '/');
}

export async function salvarPlano(fd: FormData) {
  await exigir();
  const id = Number(fd.get('id'));
  const v = [txt(fd, 'servico') || 'Serviço', txt(fd, 'plano'), num(fd, 'custo_mensal'), num(fd, 'taxa_pct'), Math.round(num(fd, 'gatilho_pedidos')), txt(fd, 'proximo'), txt(fd, 'obs')];
  if (id) db().prepare('UPDATE planos SET servico = ?, plano = ?, custo_mensal = ?, taxa_pct = ?, gatilho_pedidos = ?, proximo = ?, obs = ? WHERE id = ?').run(...v, id);
  else db().prepare('INSERT INTO planos (servico, plano, custo_mensal, taxa_pct, gatilho_pedidos, proximo, obs) VALUES (?,?,?,?,?,?,?)').run(...v);
  pronto('/taxas', '/');
}

export async function apagarPlano(fd: FormData) {
  await exigir();
  db().prepare('DELETE FROM planos WHERE id = ?').run(Number(fd.get('id')));
  pronto('/taxas', '/');
}

// ---------- Lançamentos ----------

export async function novoLancamento(fd: FormData) {
  const u = await exigir();
  const categoria = txt(fd, 'categoria');
  if (!ehCategoria(categoria)) return;
  const data = txt(fd, 'data');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
  const valor = centavos(fd, 'valor');
  if (valor <= 0) return;
  const d = db();
  const r = d.prepare('INSERT INTO lancamentos (data, categoria, descricao, valor_centavos, pedidos, origem, criado_por, pago, recorrente) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(data, categoria, txt(fd, 'descricao'), valor, Math.round(num(fd, 'pedidos')), 'manual', u.email, fd.get('a_pagar') ? 0 : 1, fd.get('recorrente') ? 1 : 0);
  // Gasto copiado do Gerenciador vem sem imposto: lança o imposto da Meta junto, vinculado.
  if (categoria === 'midia' && fd.get('sem_imposto')) {
    const pct = lerConfig().meta_imposto_pct;
    d.prepare('INSERT INTO lancamentos (data, categoria, descricao, valor_centavos, origem, vinculo, criado_por, recorrente) VALUES (?,?,?,?,?,?,?,?)')
      .run(data, 'imposto_midia', `Imposto Meta ${pct}% sobre ${txt(fd, 'descricao') || 'mídia'}`, Math.round((valor * pct) / 100), 'automatico', Number(r.lastInsertRowid), u.email, fd.get('recorrente') ? 1 : 0);
  }
  pronto('/financeiro/despesas', '/financeiro', '/');
}

export async function marcarPago(fd: FormData) {
  await exigir();
  db().prepare('UPDATE lancamentos SET pago = 1 WHERE id = ?').run(Number(fd.get('id')));
  pronto('/financeiro/despesas');
}

export async function apagarLancamento(fd: FormData) {
  await exigir();
  db().prepare('DELETE FROM lancamentos WHERE id = ?').run(Number(fd.get('id')));
  pronto('/financeiro/despesas', '/financeiro', '/');
}

// ---------- Campanhas ----------

export async function importarMeta(_: unknown, fd: FormData) {
  await exigir();
  const arq = fd.get('arquivo');
  if (!(arq instanceof File) || arq.size === 0) return {erro: 'Escolha o arquivo CSV exportado do Gerenciador.'};
  if (arq.size > 5_000_000) return {erro: 'Arquivo grande demais (máximo 5 MB).'};
  let lido;
  try {
    lido = lerExportMeta(await arq.text());
  } catch (e) {
    return {erro: (e as Error).message};
  }
  const d = db();
  const imp = d.prepare('INSERT INTO importacoes (arquivo, periodo) VALUES (?, ?)').run(arq.name, lido.periodo);
  const ins = d.prepare('INSERT INTO anuncios (importacao, campanha, conjunto, anuncio, gasto, compras, receita, impressoes, cliques) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const a of lido.ads) ins.run(Number(imp.lastInsertRowid), a.campanha, a.conjunto, a.anuncio, a.gasto, a.compras, a.receita, a.impressoes, a.cliques);
  pronto('/campanhas', '/');
  return {ok: `${lido.ads.length} anúncios importados.`};
}

// ---------- Memória ----------

export async function novaMemoria(fd: FormData) {
  const u = await exigir();
  const texto = txt(fd, 'texto');
  if (!texto) return;
  db().prepare('INSERT INTO memoria (area, texto, autor) VALUES (?,?,?)').run(txt(fd, 'area') || 'geral', texto, u.nome);
  pronto('/memoria', '/');
}

export async function apagarMemoria(fd: FormData) {
  await exigir();
  db().prepare('DELETE FROM memoria WHERE id = ?').run(Number(fd.get('id')));
  pronto('/memoria', '/');
}

// ---------- Sincronização (Shopify + Meta) ----------

export async function sincronizar(_: unknown, _fd: FormData) {
  await exigir();
  const {sincronizarShopify} = await import('@/lib/shopify');
  const {sincronizarMeta} = await import('@/lib/meta');
  const msgs: string[] = [];
  for (const f of [sincronizarShopify, () => sincronizarMeta(3)]) {
    try { msgs.push((await f()).msg); } catch (e) { msgs.push(`Erro: ${(e as Error).message}`); }
  }
  pronto('/financeiro', '/', '/precificacao');
  return {msgs};
}

// ---------- Extrato bancário ----------

export async function importarExtrato(_: unknown, fd: FormData) {
  await exigir();
  const arq = fd.get('arquivo');
  if (!(arq instanceof File) || arq.size === 0) return {erro: 'Escolha o arquivo OFX do extrato.'};
  if (arq.size > 10_000_000) return {erro: 'Arquivo grande demais (máximo 10 MB).'};
  const {importarOfx} = await import('@/lib/banco');
  try {
    const r = importarOfx(await arq.text());
    pronto('/financeiro/banco', '/financeiro/dre', '/financeiro');
    return {ok: `${r.n} movimentos de ${r.de.split('-').reverse().join('/')} a ${r.ate.split('-').reverse().join('/')} importados (sem duplicar).`};
  } catch (e) {
    return {erro: (e as Error).message};
  }
}

export async function classificarMov(fd: FormData) {
  await exigir();
  const {CATEGORIAS_BANCO, reclassificar, numeroPedido} = await import('@/lib/banco');
  const categoria = txt(fd, 'categoria');
  if (!(categoria in CATEGORIAS_BANCO)) return;
  const d = db();
  d.prepare("UPDATE banco SET categoria = ?, regra = 'manual', pedido_numero = ?, produto_ext = ?, quantidade = ? WHERE conta = ? AND fitid = ?")
    .run(categoria, numeroPedido(txt(fd, 'pedido')), txt(fd, 'produto'), Math.max(1, Math.round(num(fd, 'quantidade')) || 1), txt(fd, 'conta'), txt(fd, 'fitid'));
  const padrao = txt(fd, 'padrao').toLowerCase();
  if (fd.get('regra') && padrao.length >= 3) {
    d.prepare('INSERT INTO banco_regras (padrao, categoria, prioridade) VALUES (?, ?, 50) ON CONFLICT(padrao) DO UPDATE SET categoria = excluded.categoria').run(padrao, categoria);
    reclassificar();
  }
  pronto('/financeiro/banco', '/financeiro/dre', '/financeiro', '/financeiro/custos', '/precificacao', '/');
}

/** Importa compras de cartões e outras contas por CSV (conta, data, descricao, valor, categoria, pedido). */
export async function importarCartoes(_: unknown, fd: FormData) {
  await exigir();
  const arq = fd.get('arquivo');
  if (!(arq instanceof File) || arq.size === 0) return {erro: 'Escolha o arquivo CSV.'};
  if (arq.size > 5_000_000) return {erro: 'Arquivo grande demais (máximo 5 MB).'};
  const {importarCsv} = await import('@/lib/banco');
  try {
    const r = importarCsv(await arq.text());
    pronto('/financeiro/banco', '/financeiro/dre', '/financeiro', '/');
    return {ok: `${r.n} movimentos (${r.contas.join(', ')}) de ${r.de.split('-').reverse().join('/')} a ${r.ate.split('-').reverse().join('/')} importados (sem duplicar).`};
  } catch (e) {
    return {erro: (e as Error).message};
  }
}

/** Lançamento avulso de compra no cartão (ou do cartão pessoal). */
export async function novoMovimento(fd: FormData) {
  await exigir();
  const {adicionarMovimento, CONTAS_MANUAIS} = await import('@/lib/banco');
  const conta = txt(fd, 'conta'), data = txt(fd, 'data'), valor = num(fd, 'valor');
  if (!(conta in CONTAS_MANUAIS) || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !valor || !txt(fd, 'descricao')) return;
  adicionarMovimento({conta, data, descricao: txt(fd, 'descricao'), valor, categoria: txt(fd, 'categoria'), pedido: txt(fd, 'pedido')});
  pronto('/financeiro/banco', '/financeiro/dre', '/financeiro', '/');
}

/** Aplica todas as sugestões de vínculo entre compra de fornecedor e pedido. */
export async function aplicarSugestoes(fd: FormData) {
  await exigir();
  const up = db().prepare("UPDATE banco SET pedido_numero = ? WHERE conta = ? AND fitid = ? AND pedido_numero = ''");
  for (const v of fd.getAll('sugestao').map(String)) {
    const [conta, fitid, pedido] = v.split('\u0001');
    if (conta && fitid && pedido) up.run(pedido, conta, fitid);
  }
  pronto('/financeiro/banco');
}

/** Vincula de uma vez vários pagamentos de mesmo valor ao mesmo produto (cada um com a quantidade informada). */
export async function vincularGrupo(fd: FormData) {
  await exigir();
  const produto = txt(fd, 'produto');
  if (!produto) return;
  const quantidade = Math.max(1, Math.round(num(fd, 'quantidade')) || 1);
  const up = db().prepare("UPDATE banco SET produto_ext = ?, quantidade = ? WHERE conta = ? AND fitid = ? AND produto_ext = '' AND pedido_numero = ''");
  for (const v of fd.getAll('mov').map(String)) {
    const [conta, fitid] = v.split('\u0001');
    if (conta && fitid) up.run(produto, quantidade, conta, fitid);
  }
  pronto('/financeiro/banco', '/financeiro', '/financeiro/dre', '/financeiro/custos', '/precificacao', '/');
}

/** Âncoras do caixa: saldo disponível na Cartpanda hoje (do painel deles) e os valores que o Cérebro não consegue ler sozinho. */
export async function salvarAncorasCaixa(fd: FormData) {
  await exigir();
  const d = db();
  const hojeSP = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'});
  if (txt(fd, 'cartpanda_saldo') !== '') {
    d.prepare("INSERT INTO estado (chave, valor) VALUES ('cartpanda_saldo', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
      .run(JSON.stringify({valor: num(fd, 'cartpanda_saldo'), em: hojeSP}));
  }
  const up = d.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  for (const k of ['colchao_caixa', 'meta_saldo_devedor', 'meta_limite_cobranca', 'shopify_anual_brl', 'taxa_repasse']) if (txt(fd, k) !== '') up.run(k, num(fd, k));
  pronto('/financeiro/caixa', '/financeiro/custos', '/');
}

// ---------- Plano de ação (experimentos) ----------

export async function criarExperimento(fd: FormData) {
  const u = await exigir();
  const titulo = txt(fd, 'titulo');
  if (!titulo) return;
  db().prepare('INSERT INTO experimentos (titulo, hipotese, mudanca, sucesso, reversao, criado_por) VALUES (?,?,?,?,?,?)')
    .run(titulo, txt(fd, 'hipotese'), txt(fd, 'mudanca'), txt(fd, 'sucesso'), txt(fd, 'reversao'), u.nome);
  pronto('/financeiro/plano', '/');
}

/** Marca o começo do teste hoje: o "antes" é calculado até a véspera e o "depois" a partir de hoje. */
export async function iniciarExperimento(fd: FormData) {
  await exigir();
  const hojeSP = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'});
  db().prepare("UPDATE experimentos SET status = 'em_andamento', inicio = ? WHERE id = ? AND status = 'planejado'").run(txt(fd, 'inicio') || hojeSP, Number(fd.get('id')));
  pronto('/financeiro/plano', '/');
}

function fecharExperimento(fd: FormData, status: 'concluido' | 'revertido') {
  const hojeSP = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'});
  db().prepare("UPDATE experimentos SET status = ?, fim = ?, decisao = ? WHERE id = ? AND status = 'em_andamento'").run(status, hojeSP, txt(fd, 'decisao'), Number(fd.get('id')));
  pronto('/financeiro/plano', '/');
}

export async function concluirExperimento(fd: FormData) {
  await exigir();
  fecharExperimento(fd, 'concluido');
}

export async function reverterExperimento(fd: FormData) {
  await exigir();
  fecharExperimento(fd, 'revertido');
}

export async function apagarExperimento(fd: FormData) {
  await exigir();
  db().prepare("DELETE FROM experimentos WHERE id = ? AND status = 'planejado'").run(Number(fd.get('id')));
  pronto('/financeiro/plano');
}
