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
  db().prepare(`UPDATE produtos SET nome = ?, preco = ?, custo = ?, frete = ?, embalagem = ?, outros = ?, cpa_alvo = ?, exemplo = 0, atualizado_em = datetime('now') WHERE id = ?`)
    .run(txt(fd, 'nome') || 'Sem nome', num(fd, 'preco'), num(fd, 'custo'), num(fd, 'frete'), num(fd, 'embalagem'), num(fd, 'outros'), num(fd, 'cpa_alvo'), id);
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
  for (const k of ['das_pct', 'plataforma_pct', 'meta_imposto_pct', 'cpa_alvo_padrao']) up.run(k, num(fd, k));
  pronto('/taxas', '/precificacao', '/', '/campanhas');
}

export async function salvarFormas(fd: FormData) {
  await exigir();
  const up = db().prepare('UPDATE formas_pagamento SET nome = ?, taxa_pct = ?, mix_pct = ? WHERE id = ?');
  for (const id of fd.getAll('id').map(Number)) up.run(txt(fd, `nome_${id}`) || 'Sem nome', num(fd, `taxa_${id}`), num(fd, `mix_${id}`), id);
  db().prepare("UPDATE config SET valor = 0 WHERE chave = 'taxas_exemplo'").run();
  pronto('/taxas', '/precificacao', '/', '/campanhas');
}

export async function novaForma() {
  await exigir();
  db().prepare("INSERT INTO formas_pagamento (nome, ordem) VALUES ('Nova forma', 99)").run();
  pronto('/taxas');
}

export async function apagarForma(fd: FormData) {
  await exigir();
  db().prepare('DELETE FROM formas_pagamento WHERE id = ?').run(Number(fd.get('apagar')));
  pronto('/taxas', '/precificacao');
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
  const r = d.prepare('INSERT INTO lancamentos (data, categoria, descricao, valor_centavos, pedidos, origem, criado_por) VALUES (?,?,?,?,?,?,?)')
    .run(data, categoria, txt(fd, 'descricao'), valor, Math.round(num(fd, 'pedidos')), 'manual', u.email);
  // Gasto copiado do Gerenciador vem sem imposto: lança o imposto da Meta junto, vinculado.
  if (categoria === 'midia' && fd.get('sem_imposto')) {
    const pct = lerConfig().meta_imposto_pct;
    d.prepare('INSERT INTO lancamentos (data, categoria, descricao, valor_centavos, origem, vinculo, criado_por) VALUES (?,?,?,?,?,?,?)')
      .run(data, 'imposto_midia', `Imposto Meta ${pct}% sobre ${txt(fd, 'descricao') || 'mídia'}`, Math.round((valor * pct) / 100), 'automatico', Number(r.lastInsertRowid), u.email);
  }
  pronto('/financeiro', '/');
}

export async function apagarLancamento(fd: FormData) {
  await exigir();
  db().prepare('DELETE FROM lancamentos WHERE id = ?').run(Number(fd.get('id')));
  pronto('/financeiro', '/');
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
