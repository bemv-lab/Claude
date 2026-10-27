import Link from 'next/link';
import Casca from '@/components/Casca';
import {CabecalhoFin} from '@/components/Fin';
import {entrada, mesAtual} from '@/lib/dados';
import {dreMes, NOME_FORMA} from '@/lib/financeiro';
import {fmtBRL, fmtPct} from '@/lib/calc';

export const dynamic = 'force-dynamic';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function Barra({r, v, base, cls}: {r: string; v: number; base: number; cls: string}) {
  const pct = base ? (v / base) * 100 : 0;
  return (
    <div className="dre-linha">
      <div><span>{r}</span><span className={cls}>{fmtPct(pct)}<br /><small className="nota">{fmtBRL(v)}</small></span></div>
      <span className="barrinha"><span className={cls === 'desce' ? 'neg' : ''} style={{width: `${Math.min(100, pct)}%`}} /></span>
    </div>
  );
}

export default async function Dre({searchParams}: {searchParams: Promise<{mes?: string}>}) {
  const q = await searchParams;
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : mesAtual();
  const [a, m] = mes.split('-').map(Number);
  const fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const d = dreMes(entrada(`${mes}-01`, fim), mes);
  const impostos = d.despesas.filter(([n]) => n.startsWith('Imposto')).reduce((s, [, v]) => s + v, 0);

  return (
    <Casca>
      <CabecalhoFin aba="dre" titulo={<>Relatório de <b>DRE</b></>} sub="Resultado da empresa no mês, pela data de compensação das vendas (dia do pagamento), com as despesas lançadas." />
      <div className="cartao">
        <form action="/financeiro/dre">
          <div className="campos">
            <label htmlFor="mes">Mês<select id="mes" name="mes" defaultValue={mes}>{[a - 1, a, a + 1].flatMap((ano) => MESES.map((n, i) => { const v = `${ano}-${String(i + 1).padStart(2, '0')}`; return <option key={v} value={v}>{n} {ano}</option>; }))}</select></label>
          </div>
          <div className="acoes"><button type="submit">Buscar</button></div>
        </form>
      </div>

      <div className="grade3">
        <div className="cartao">
          <h2>Receitas</h2>
          <div><small className="nota">Total recebido</small><div className="grande sobe">{fmtBRL(d.totalReceitas)}</div></div>
          {(['cartao', 'boleto', 'pix', 'outro'] as const).map((f) => <Barra key={f} r={NOME_FORMA[f]} v={d.receitas[f]} base={d.totalReceitas} cls="sobe" />)}
          {d.outrasReceitas > 0 && <Barra r="Outras receitas" v={d.outrasReceitas} base={d.totalReceitas} cls="sobe" />}
        </div>
        <div className="cartao">
          <h2>Despesas</h2>
          <div><small className="nota">Total de despesas</small><div className="grande desce">{fmtBRL(d.totalDespesas)}</div></div>
          {d.despesas.map(([n, v]) => <Barra key={n} r={n} v={v} base={d.totalReceitas} cls="desce" />)}
          <p className="nota">Percentuais sobre a receita do mês.</p>
        </div>
        <div className="coluna">
          <div className="cartao">
            <h2>Resultado</h2>
            <div><small className="nota">Lucro líquido</small><div className={`grande ${d.lucro < 0 ? 'desce' : ''}`}>{fmtBRL(d.lucro)}</div></div>
            <Barra r="Margem de lucro" v={d.lucro} base={d.totalReceitas} cls="sobe" />
            <div className="dre-linha"><div><span>ROI (lucro ÷ anúncios com imposto Meta)</span><span className="sobe">{d.roi === null ? '–' : fmtPct(d.roi)}</span></div></div>
            {d.pontual > 0 && <div className="dre-linha"><div><span>Lucro sem despesas pontuais<br /><small className="nota">tira regularização do MEI e enquadramento ({fmtBRL(d.pontual)})</small></span><span className="sobe">{fmtBRL(d.lucroRecorrente)}</span></div></div>}
          </div>
          <div className="cartao alerta">
            <h2>Diferença para o Único Drop</h2>
            <p>No Único Drop, o DAS e o imposto da Meta estão em 0%. Só por isso, o lucro de lá aparece <b>{fmtBRL(impostos)}</b> maior neste mês do que o que sobra de verdade.</p>
            <p className="nota">As taxas do cartão por parcela são as da Cartpanda (cartão 5,99% mais os juros que a loja assume). O Único Drop pode recalcular períodos antigos com outra taxa: compare pedido a pedido.</p>
            {d.semCusto > 0 && <p className="desce">{d.semCusto} produto(s) vendido(s) sem custo cadastrado. <Link href="/precificacao">Cadastrar custo</Link></p>}
          </div>
        </div>
      </div>
    </Casca>
  );
}
