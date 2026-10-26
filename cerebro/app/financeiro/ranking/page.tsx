import Link from 'next/link';
import Casca from '@/components/Casca';
import {CabecalhoFin, rotuloPeriodo} from '@/components/Fin';
import {BarraPartes} from '@/components/graficos';
import {entrada, periodo} from '@/lib/dados';
import {resumo, ranking} from '@/lib/financeiro';
import {fmtBRL, fmtPct} from '@/lib/calc';

export const dynamic = 'force-dynamic';

const PARTES = [['custo', 'Custo', 'var(--c-custo)'], ['marketing', 'Marketing', 'var(--c-mkt)'], ['tarifas', 'Tarifas e impostos', 'var(--c-taxas)'], ['lucro', 'Lucro', 'var(--c-lucro)']] as const;

export default async function Ranking({searchParams}: {searchParams: Promise<{p?: string; de?: string; ate?: string; f?: string; q?: string}>}) {
  const q = await searchParams;
  const per = periodo(q);
  const e = entrada(per.ini, per.fim);
  const r = resumo(e, per.ini, per.fim);
  const todos = ranking(r, e);
  const filtro = q.f ?? 'todos', busca = (q.q ?? '').toLowerCase();
  const lista = todos.filter((p) => (filtro === 'prejuizo' ? p.lucro < 0 : filtro === 'semcusto' ? p.semCusto : true) && (!busca || p.nome.toLowerCase().includes(busca)));
  const lucroTotal = todos.reduce((s, p) => s + p.lucro, 0);
  const receitaTotal = todos.reduce((s, p) => s + p.receita, 0);
  let acc = 0, n80 = 0;
  for (const p of [...todos].sort((a, b) => b.receita - a.receita)) { if (acc < receitaTotal * 0.8) { acc += p.receita; n80++; } }
  const primeiro = [...todos].sort((a, b) => b.receita - a.receita)[0];
  const alerta = todos.filter((p) => p.lucro < 0 || p.semCusto);
  const qs = per.chave === 'outra' ? `de=${per.ini}&ate=${per.fim}` : `p=${per.chave}`;
  const maxAbs = Math.max(1, ...todos.map((p) => Math.abs(p.lucro)));
  const temNeg = todos.some((p) => p.lucro < 0);

  return (
    <Casca>
      <CabecalhoFin aba="ranking" base="/financeiro/ranking" per={per} titulo={<>Ranking de <b>produtos</b></>} sub={`Receita, custo, marketing, tarifas e lucro por produto em ${rotuloPeriodo(per.ini, per.fim)}. Use para decidir onde pôr verba e o que revisar.`} />

      <div className="kpis kpis-cor">
        <div className="kpi k-receita"><span className="rot">Receita líquida</span><span className="val">{fmtBRL(receitaTotal)}</span><span className="var">{todos.reduce((s, p) => s + p.quantidade, 0)} itens pagos · {fmtBRL(todos.reduce((s, p) => s + p.pendente, 0))} pendente</span></div>
        <div className="kpi k-lucro"><span className="rot">Lucro dos produtos</span><span className={`val ${lucroTotal < 0 ? 'desce' : ''}`}>{fmtBRL(lucroTotal)}</span><span className="var">margem de {receitaTotal ? fmtPct((lucroTotal / receitaTotal) * 100) : '0%'} sobre a receita</span></div>
        <div className="kpi k-mkt"><span className="rot">Concentração</span><span className="val">{n80} produto{n80 === 1 ? '' : 's'}</span><span className="var">{n80 === 1 ? 'faz' : 'fazem'} 80% da receita{primeiro ? ` · o 1º tem ${fmtPct((primeiro.receita / receitaTotal) * 100)}` : ''}</span></div>
        <div className="kpi k-taxas"><span className="rot">Atenção</span><span className="val">{alerta.length ? `${alerta.length} produto${alerta.length === 1 ? '' : 's'}` : 'Tudo certo'}</span><span className="var">{alerta.length ? 'no prejuízo ou sem custo cadastrado' : 'nenhum no prejuízo ou sem custo'}</span></div>
      </div>

      <div className="meio">
        <div className="cartao">
          <div><h2>Para onde vai a receita</h2><p className="nota">Cada barra é a receita do produto dividida entre custo, marketing, tarifas e lucro.</p></div>
          <div className="legenda">{PARTES.map(([, n, c]) => <span key={n} className="lg-cor" style={{['--c' as string]: c}}>{n}</span>)}</div>
          {todos.slice(0, 8).map((p) => (
            <div className="partes-linha" key={p.produto}><span>{p.nome}</span>
              <BarraPartes partes={PARTES.map(([k, n, c]) => ({nome: n, v: Math.max(0, p[k]), cor: c}))} /></div>
          ))}
        </div>
        <div className="cartao">
          <div><h2>Quem dá lucro e quem dá prejuízo</h2><p className="nota">Lucro por produto no período</p></div>
          {todos.slice(0, 10).map((p) => (
            <div className="lucro-linha" key={p.produto}><span>{p.nome}</span>
              <span className={`eixo${temNeg ? ' com-neg' : ''}`}><span className={p.lucro < 0 ? 'neg' : 'pos'} style={{width: `${(Math.abs(p.lucro) / maxAbs) * (temNeg ? 50 : 100)}%`}} /></span>
              <b className={p.lucro < 0 ? 'desce' : 'sobe'}>{fmtBRL(p.lucro)}</b></div>
          ))}
        </div>
      </div>

      <div className="cartao">
        <div className="topo"><div><h2>Desempenho por produto</h2><p className="nota">Marketing: gasto dos anúncios que trouxeram o pedido (pela UTM); o restante é rateado pela receita. Inclui o imposto da Meta.</p></div></div>
        <div className="acoes">
          <form action="/financeiro/ranking"><input type="hidden" name={per.chave === 'outra' ? 'de' : 'p'} value={per.chave === 'outra' ? per.ini : per.chave} />{per.chave === 'outra' && <input type="hidden" name="ate" value={per.fim} />}
            <input name="q" defaultValue={q.q} placeholder="Filtrar pelo nome do produto" aria-label="Filtrar produto" style={{width: 260}} /></form>
          <div className="abas">
            {[['todos', `Todos ${todos.length}`], ['prejuizo', `Com prejuízo ${todos.filter((p) => p.lucro < 0).length}`], ['semcusto', `Sem custo ${todos.filter((p) => p.semCusto).length}`]].map(([k, n]) =>
              <Link key={k} href={`/financeiro/ranking?${qs}&f=${k}`} aria-current={filtro === k ? 'page' : undefined}>{n}</Link>)}
          </div>
        </div>
        <div className="tabela"><table>
          <thead><tr><th>#</th><th>Produto</th><th className="n">Receita</th><th className="n">Pendente</th><th className="n">Custo</th><th className="n">Marketing · CPA</th><th className="n">Tarifas</th><th className="n">Conversão</th><th className="n">Lucro · margem</th></tr></thead>
          <tbody>
            {lista.map((p, i) => (
              <tr key={p.produto}>
                <td><span className="pos">{i + 1}</span></td>
                <td><b>{p.nome}</b><br /><small className="nota">{p.quantidade} un. · {p.pagos} pedido(s)</small></td>
                <td className="n">{fmtBRL(p.receita)}</td>
                <td className="n">{fmtBRL(p.pendente)}<br /><small className="nota">{p.nPendente} pend.</small></td>
                <td className="n">{p.semCusto ? <Link href="/precificacao" className="desce">sem custo</Link> : fmtBRL(p.custo)}</td>
                <td className="n">{fmtBRL(p.marketing)}<br /><small className="nota">CPA {p.cpa === null ? '–' : fmtBRL(p.cpa)}</small></td>
                <td className="n">{fmtBRL(p.tarifas)}</td>
                <td className="n">{fmtPct(p.conversao)}</td>
                <td className="n"><b className={p.lucro < 0 ? 'desce' : 'sobe'}>{fmtBRL(p.lucro)}</b><br /><small className="nota">{fmtPct(p.margem)}</small></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {lista.length === 0 && <p className="vazio">Nenhum produto neste filtro.</p>}
      </div>
    </Casca>
  );
}
