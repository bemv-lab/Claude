import Link from 'next/link';
import Casca from '@/components/Casca';
import {hoje, lancamentosDoMes, mesAtual} from '@/lib/dados';
import {CATEGORIAS, dre, ehCategoria, fmtBRL, fmtPct} from '@/lib/calc';
import {apagarLancamento, novoLancamento} from '@/app/acoes';
import Novo from './Novo';

export const dynamic = 'force-dynamic';

const GRUPOS: [string, string][] = [
  ['receita', 'Receita bruta'], ['deducoes', 'Deduções'], ['cmv', 'Custo dos produtos'], ['variaveis', 'Despesas variáveis de venda'],
  ['marketing', 'Marketing'], ['fixas', 'Despesas fixas'], ['financeiras', 'Despesas financeiras'], ['outras', 'Outras receitas'],
];

const desloca = (m: string, d: number) => {
  const [a, mm] = m.split('-').map(Number);
  const t = a * 12 + (mm - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export default async function Financeiro({searchParams}: {searchParams: Promise<{mes?: string}>}) {
  const q = (await searchParams).mes;
  const mes = q && /^\d{4}-\d{2}$/.test(q) ? q : mesAtual();
  const lancs = lancamentosDoMes(mes);
  const r = dre(lancs);
  const nome = new Date(`${mes}-15T12:00:00`).toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
  const cats = (grupo: string) => Object.entries(CATEGORIAS).filter(([, c]) => c.grupo === grupo).map(([k, c]) => [k, c.nome, r.porCategoria[k] ?? 0] as const).filter(([, , v]) => v);
  const linha = (rot: string, v: number, cls = 'forte') => <tr className={cls}><td>{rot}</td><td className="n">{fmtBRL(v)}</td><td className="n">{r.grupos.receita ? fmtPct((v / r.grupos.receita) * 100) : '–'}</td></tr>;

  return (
    <Casca>
      <div className="topo">
        <div><div className="olho">Dinheiro</div><h1>Financeiro · <b>{nome}</b></h1></div>
        <div className="abas">
          <Link href={`/financeiro?mes=${desloca(mes, -1)}`}>← mês anterior</Link>
          <Link href={`/financeiro?mes=${desloca(mes, 1)}`}>próximo →</Link>
        </div>
      </div>

      <div className="cartao">
        <h2>Novo lançamento</h2>
        <Novo acao={novoLancamento} hoje={mes === mesAtual() ? hoje() : `${mes}-01`} categorias={Object.entries(CATEGORIAS).map(([k, c]) => [k, c.nome, c.grupo])} />
      </div>

      <div className="meio">
        <div className="cartao">
          <h2>DRE do mês</h2>
          <div className="tabela"><table>
            <thead><tr><th>Conta</th><th className="n">R$</th><th className="n">% receita</th></tr></thead>
            <tbody>
              {linha('Receita bruta', r.grupos.receita)}
              {cats('deducoes').map(([k, n, v]) => <tr key={k}><td className="sub">(−) {n}</td><td className="n">{fmtBRL(-v)}</td><td /></tr>)}
              {linha('Receita líquida', r.receitaLiquida)}
              {cats('cmv').map(([k, n, v]) => <tr key={k}><td className="sub">(−) {n}</td><td className="n">{fmtBRL(-v)}</td><td /></tr>)}
              {linha('Lucro bruto', r.lucroBruto)}
              {[...cats('variaveis'), ...cats('marketing')].map(([k, n, v]) => <tr key={k}><td className="sub">(−) {n}</td><td className="n">{fmtBRL(-v)}</td><td /></tr>)}
              {linha('Margem de contribuição', r.margemContribuicao)}
              {[...cats('fixas'), ...cats('financeiras')].map(([k, n, v]) => <tr key={k}><td className="sub">(−) {n}</td><td className="n">{fmtBRL(-v)}</td><td /></tr>)}
              {cats('outras').map(([k, n, v]) => <tr key={k}><td className="sub">(+) {n}</td><td className="n">{fmtBRL(v)}</td><td /></tr>)}
              {linha('Resultado líquido', r.resultado, 'total')}
            </tbody>
          </table></div>
          <p className="nota">{r.pedidos} pedidos · ticket médio {fmtBRL(r.ticketMedio)} · mídia real {fmtBRL(r.midiaTotal)} (com imposto)</p>
        </div>

        <div className="cartao">
          <h2>Lançamentos ({lancs.length})</h2>
          {lancs.length === 0 ? <p className="vazio">Nada lançado em {nome}.</p> : (
            <div className="tabela"><table>
              <thead><tr><th>Data</th><th>Conta</th><th className="n">Valor</th><th /></tr></thead>
              <tbody>
                {lancs.map((l) => {
                  const c = ehCategoria(l.categoria) ? CATEGORIAS[l.categoria] : null;
                  const entra = c?.grupo === 'receita' || c?.grupo === 'outras';
                  return (
                    <tr key={l.id}>
                      <td className="n">{l.data.slice(8)}/{l.data.slice(5, 7)}</td>
                      <td>{c?.nome ?? l.categoria}{l.descricao && <><br /><span className="nota">{l.descricao}{l.pedidos ? ` · ${l.pedidos} pedidos` : ''}</span></>}</td>
                      <td className={`n ${entra ? 'sobe' : ''}`}>{entra ? '' : '−'}{fmtBRL(l.valor_centavos / 100)}</td>
                      <td><form action={apagarLancamento}><input type="hidden" name="id" value={l.id} /><button className="mini" type="submit" aria-label="Apagar lançamento">×</button></form></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </Casca>
  );
}
