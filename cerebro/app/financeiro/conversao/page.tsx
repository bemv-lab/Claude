import Casca from '@/components/Casca';
import {CabecalhoFin} from '@/components/Fin';
import {entrada, mesAtual} from '@/lib/dados';
import {conversaoDiaria} from '@/lib/financeiro';
import {fmtBRL, fmtPct} from '@/lib/calc';

export const dynamic = 'force-dynamic';

const TIPOS = [['todos', 'Todas as formas'], ['pix', 'Pix'], ['cartao', 'Cartão'], ['boleto', 'Boleto']] as const;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default async function Conversao({searchParams}: {searchParams: Promise<{tipo?: string; mes?: string}>}) {
  const q = await searchParams;
  const tipo = TIPOS.some(([k]) => k === q.tipo) ? q.tipo! : 'pix';
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : mesAtual();
  const [a, m] = mes.split('-').map(Number);
  const fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const c = conversaoDiaria(entrada(`${mes}-01`, fim), `${mes}-01`, fim, tipo);
  const nome = TIPOS.find(([k]) => k === tipo)![1];
  const total = c.total.pago.n + c.total.naoPago.n;
  const anos = [a - 1, a, a + 1];

  return (
    <Casca>
      <CabecalhoFin aba="conversao" titulo={<>Relatório de <b>conversão</b></>} sub="A conversão de cada dia comparada com o dia anterior, para achar onde recuperar vendas." />
      <div className="cartao">
        <form action="/financeiro/conversao">
          <div className="campos">
            <label htmlFor="tipo">Tipo de conversão<select id="tipo" name="tipo" defaultValue={tipo}>{TIPOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label htmlFor="mes">Mês<select id="mes" name="mes" defaultValue={mes}>{anos.flatMap((ano) => MESES.map((n, i) => { const v = `${ano}-${String(i + 1).padStart(2, '0')}`; return <option key={v} value={v}>{n} {ano}</option>; }))}</select></label>
          </div>
          <div className="acoes"><button type="submit">Buscar</button></div>
        </form>
      </div>

      <div className="kpis kpis-cor" style={{gridTemplateColumns: 'repeat(3, 1fr)'}}>
        <div className="kpi k-lucro"><span className="rot">{nome}: convertido</span><span className="val sobe">{total ? fmtPct((c.total.pago.n / total) * 100) : '–'}</span><span className="var">{c.total.pago.n} conversões · {fmtBRL(c.total.pago.v)}</span></div>
        <div className="kpi k-taxas"><span className="rot">{nome}: não convertido</span><span className="val desce">{total ? fmtPct((c.total.naoPago.n / total) * 100) : '–'}</span><span className="var">{c.total.naoPago.n} pendentes ou cancelados · {fmtBRL(c.total.naoPago.v)}</span></div>
        <div className="kpi k-mkt"><span className="rot">Total</span><span className="val">{total ? '100%' : '–'}</span><span className="var">{total} pedidos · {fmtBRL(c.total.pago.v + c.total.naoPago.v)}</span></div>
      </div>

      <div className="cartao">
        <div><h2>Conversão diária</h2><p className="nota">Seta para cima: converteu mais que no dia anterior.</p></div>
        {c.linhas.length === 0 ? <p className="vazio">Sem pedidos de {nome.toLowerCase()} neste mês.</p> : (
          <div className="tabela"><table>
            <thead><tr><th>Dia</th><th className="n">Pago</th><th className="n">Pendente ou cancelado</th><th className="n">Todos</th></tr></thead>
            <tbody>{c.linhas.map((l, i) => {
              const ant = c.linhas[i - 1], sobe = !ant || l.taxa >= ant.taxa, t = l.pago.n + l.naoPago.n;
              return (
                <tr key={l.dia}>
                  <td><b>Dia {l.dia.slice(8)}</b> <span className={sobe ? 'sobe' : 'desce'} aria-label={sobe ? 'subiu' : 'caiu'}>{sobe ? '▲' : '▼'}</span>
                    <span className="barrinha"><span style={{width: `${l.taxa}%`}} /></span></td>
                  <td className="n">{fmtPct(l.taxa)} · {l.pago.n} · {fmtBRL(l.pago.v)}</td>
                  <td className="n">{fmtPct(100 - l.taxa)} · {l.naoPago.n} · {fmtBRL(l.naoPago.v)}</td>
                  <td className="n">{t} · {fmtBRL(l.pago.v + l.naoPago.v)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
    </Casca>
  );
}
