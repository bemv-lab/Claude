import Link from 'next/link';
import {PERIODOS} from '@/lib/dados';

const ABAS = [['', 'Financeiro'], ['detalhado', 'Detalhado'], ['ranking', 'Ranking'], ['conversao', 'Conversão'], ['dre', 'DRE'], ['despesas', 'Despesas'], ['banco', 'Conta PJ'], ['caixa', 'Caixa'], ['custos', 'Custos'], ['plano', 'Plano de ação']] as const;

/** Cabeçalho do módulo financeiro: abas + título + filtro de período (quando houver). */
export function CabecalhoFin({aba, titulo, sub, per, extra, base}: {
  aba: string; titulo: React.ReactNode; sub: string; per?: {chave: string; ini: string; fim: string}; extra?: React.ReactNode; base?: string;
}) {
  const q = per ? (per.chave === 'outra' ? `?de=${per.ini}&ate=${per.fim}` : `?p=${per.chave}`) : '';
  const caminho = `/financeiro${aba ? `/${aba}` : ''}`;
  return (
    <>
      <nav className="abas" aria-label="Relatórios financeiros">
        {ABAS.map(([k, n]) => <Link key={k} href={`/financeiro${k ? `/${k}` : ''}${['dre', 'despesas', 'conversao', 'banco', 'caixa', 'custos', 'plano'].includes(k) ? '' : q}`} aria-current={k === aba ? 'page' : undefined}>{n}</Link>)}
      </nav>
      <div className="topo">
        <div><div className="olho">Dinheiro</div><h1>{titulo}</h1><p className="nota" style={{marginTop: 6}}>{sub}</p></div>
        {extra}
      </div>
      {per && (
        <div className="filtro">
          <div className="abas">
            {PERIODOS.map(([k, n]) => <Link key={k} href={`${base ?? caminho}?p=${k}`} aria-current={per.chave === k ? 'page' : undefined}>{n}</Link>)}
          </div>
          <form action={base ?? caminho} className="datas">
            <input type="date" name="de" defaultValue={per.ini} aria-label="De" />
            <input type="date" name="ate" defaultValue={per.fim} aria-label="Até" />
            <button className="mini" type="submit">Aplicar</button>
          </form>
        </div>
      )}
    </>
  );
}

export const rotuloPeriodo = (ini: string, fim: string) => {
  const f = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
  return ini === fim ? f(ini) : `${f(ini)} a ${f(fim)}`;
};

/** Linha rótulo + valor, usada nas listas de detalhamento. */
export function Linha({r, v, cls, sub}: {r: React.ReactNode; v: React.ReactNode; cls?: string; sub?: boolean}) {
  return <div className={`linha${sub ? ' linha-sub' : ''}`}><span>{r}</span><span className={cls}>{v}</span></div>;
}
