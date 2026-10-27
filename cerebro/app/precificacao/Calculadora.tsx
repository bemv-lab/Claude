'use client';
import {useState} from 'react';
import Link from 'next/link';
import {precificar, precoParaMargem, fmtBRL, fmtNum, fmtPct, type Config, type Forma, type Produto} from '@/lib/calc';
import {salvarProduto, arquivarProduto} from '@/app/acoes';

const CAMPOS: [keyof Produto, string][] = [
  ['preco', 'Preço de venda (R$)'], ['custo', 'Custo do produto (R$)'], ['frete', 'Frete pago pela loja (R$)'],
  ['embalagem', 'Embalagem e brinde (R$)'], ['outros', 'Outros por pedido (R$)'], ['cpa_alvo', 'CPA alvo no Gerenciador (R$)'],
];

export default function Calculadora({produto, cfg, formas}: {produto: Produto; cfg: Config; formas: Forma[]}) {
  const [p, setP] = useState(produto);
  const [margem, setMargem] = useState(15);
  const r = precificar(p, cfg, formas);
  const sugerido = precoParaMargem(p, cfg, formas, margem);
  const mudou = JSON.stringify(p) !== JSON.stringify(produto);
  const set = (k: keyof Produto, v: string) => setP({...p, [k]: k === 'nome' ? v : parseFloat(v.replace(',', '.')) || 0});

  return (
    <div className="meio">
      <div className="cartao">
        <form action={salvarProduto}>
          <input type="hidden" name="id" value={p.id} />
          <label htmlFor="nome">Produto<input id="nome" name="nome" value={p.nome} onChange={(e) => set('nome', e.target.value)} /></label>
          <div className="campos">
            {CAMPOS.map(([k, rot]) => (
              <label key={k} htmlFor={k}>{rot}<input id={k} name={k} type="number" step="0.01" value={(p[k] as number) ?? 0} readOnly={k === 'custo' && p.custo_origem === 'media'} onChange={(e) => set(k, e.target.value)} /></label>
            ))}
          </div>
          {p.custo_origem === 'media'
            ? <p className="nota">Custo = média dos pagamentos a fornecedor: {p.custo_compras} pagamento(s) para {p.custo_unidades} unidade(s). Muda sozinho quando você vincula novos pagamentos em <Link href="/financeiro/banco">Conta PJ</Link>.</p>
            : <p className="nota erro">Sem pagamento a fornecedor vinculado a este produto: o custo {p.custo_origem === 'manual' ? 'digitado aqui é só uma estimativa' : 'está zerado e o lucro fica inflado'}. Vincule os pagamentos em <Link href="/financeiro/banco">Conta PJ</Link>.</p>}
          {p.exemplo ? <p className="selo" style={{alignSelf: 'flex-start'}}>valores de exemplo: confira e salve</p> : null}
          <div className="acoes">
            <button type="submit" disabled={!mudou && !p.exemplo}>Salvar</button>
            {mudou && <button type="button" className="leve" onClick={() => setP(produto)}>Desfazer</button>}
          </div>
        </form>
        <p className="nota">DAS {fmtPct(cfg.das_pct)}, plataforma {fmtPct(cfg.plataforma_pct)}, imposto Meta {fmtPct(cfg.meta_imposto_pct)} e o mix de pagamento vêm de <Link href="/taxas">Taxas e planos</Link>.</p>
        <div className="cartao" style={{background: 'var(--sunk)', border: 0}}>
          <h2>Que preço dá a margem que eu quero?</h2>
          <label htmlFor="margem">Margem líquida alvo, depois da mídia (%)<input id="margem" type="number" step="1" value={margem} onChange={(e) => setMargem(parseFloat(e.target.value) || 0)} /></label>
          <p>Preço mínimo: <b>{isFinite(sugerido) ? fmtBRL(sugerido) : 'impossível com essas taxas'}</b> <span className="nota">(no CPA alvo de {fmtBRL(r.cpaAlvo)})</span></p>
        </div>
      </div>
      <div className="cartao">
        <div className="destaque">
          <div><small>Margem de contribuição</small><b className={r.mc < 0 ? 'desce' : ''}>{fmtBRL(r.mc)}</b><small>{fmtPct(r.mcPct)} do preço, antes da mídia</small></div>
          <div><small>Lucro por pedido no CPA alvo</small><b className={r.lucro < 0 ? 'desce' : ''}>{fmtBRL(r.lucro)}</b><small>{fmtPct(r.lucroPct)} do preço</small></div>
          <div><small>CPA máximo no Gerenciador</small><b>{fmtBRL(r.cpaMax)}</b><small>acima disso, prejuízo</small></div>
          <div><small>ROAS de break-even</small><b>{isFinite(r.roasBE) ? fmtNum(r.roasBE) : 'sem margem'}</b><small>como o Gerenciador mostra</small></div>
        </div>
        <div className="res">
          {r.linhas.map(([rot, v]) => <div className="linha" key={rot}><span>{rot}</span><span>{fmtBRL(v)}</span></div>)}
          <div className="linha forte"><span>Margem de contribuição</span><span>{fmtBRL(r.mc)}</span></div>
          <div className="linha"><span>Mídia no CPA alvo</span><span>{fmtBRL(-r.cpaAlvo)}</span></div>
          <div className="linha"><span>Imposto da Meta sobre a mídia ({fmtPct(cfg.meta_imposto_pct)})</span><span>{fmtBRL(-r.impostoMidia)}</span></div>
          <div className="linha forte"><span>Lucro por pedido</span><span>{fmtBRL(r.lucro)}</span></div>
        </div>
        <p className="nota">O Gerenciador mostra o gasto <b>sem</b> o imposto da Meta: um CPA de {fmtBRL(r.cpaAlvo)} no Gerenciador custa {fmtBRL(r.cpaAlvo + r.impostoMidia)} na fatura. Por isso o CPA máximo e o ROAS de break-even acima já estão descontados dele.</p>
        <p className="nota">A taxa de pagamento é a média ponderada pelo que os clientes escolhem. Oferecer 10× sem juros pesa só nos pedidos que usam 10×.</p>
        <form action={arquivarProduto}><input type="hidden" name="id" value={p.id} /><button className="mini" type="submit">Arquivar produto</button></form>
      </div>
    </div>
  );
}
