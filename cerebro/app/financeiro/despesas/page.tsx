import Link from 'next/link';
import Casca from '@/components/Casca';
import {CabecalhoFin} from '@/components/Fin';
import {hoje, mesAtual, recorrencias} from '@/lib/dados';
import {db} from '@/lib/db';
import {CATEGORIAS, ehCategoria, fmtBRL, type Lancamento} from '@/lib/calc';
import {apagarLancamento, marcarPago, novoLancamento} from '@/app/acoes';
import Novo from './Novo';

export const dynamic = 'force-dynamic';

// Vendas, custo dos produtos, gateway e checkout vêm dos pedidos: não se lançam à mão.
const MANUAIS = Object.entries(CATEGORIAS).filter(([k]) => !['receita_vendas', 'cmv', 'taxa_pagamento', 'plataforma', 'imposto_midia'].includes(k));

const desloca = (m: string, d: number) => {
  const [a, mm] = m.split('-').map(Number);
  const t = a * 12 + (mm - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export default async function Despesas({searchParams}: {searchParams: Promise<{mes?: string; cat?: string; st?: string}>}) {
  const q = await searchParams;
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : mesAtual();
  const [a, m] = mes.split('-').map(Number);
  const ini = `${mes}-01`, fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const d = db();
  const proprios = d.prepare('SELECT * FROM lancamentos WHERE data BETWEEN ? AND ? ORDER BY data DESC, id DESC').all(ini, fim).map((l) => ({...(l as object)})) as Lancamento[];
  const repetidos = recorrencias(d.prepare('SELECT * FROM lancamentos WHERE recorrente = 1 AND data < ?').all(ini).map((l) => ({...(l as object)})) as Lancamento[], ini, fim);
  const todos = [...proprios, ...repetidos].filter((l) => !['receita_vendas', 'cmv', 'taxa_pagamento', 'plataforma'].includes(l.categoria));
  const lista = todos.filter((l) => (!q.cat || l.categoria === q.cat) && (!q.st || (q.st === 'pago' ? l.pago : !l.pago)));
  const total = lista.reduce((s, l) => s + l.valor_centavos / 100, 0);
  const aPagar = todos.filter((l) => !l.pago).reduce((s, l) => s + l.valor_centavos / 100, 0);
  const nome = new Date(`${mes}-15T12:00:00`).toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});

  return (
    <Casca>
      <CabecalhoFin aba="despesas" titulo={<>Despesas · <b>{nome}</b></>} sub="Gastos pagos por fora da conta PJ (ex.: no cartão de um sócio). O que sai da conta PJ entra sozinho pelo extrato; vendas, custo dos produtos e taxas vêm dos pedidos." />

      <div className="cartao">
        <h2>Novo lançamento</h2>
        <Novo acao={novoLancamento} hoje={mes === mesAtual() ? hoje() : ini} categorias={MANUAIS.map(([k, c]) => [k, c.nome, c.grupo])} />
      </div>

      <div className="cartao">
        <form action="/financeiro/despesas">
          <div className="campos">
            <label htmlFor="f-mes">Mês<input id="f-mes" name="mes" type="month" defaultValue={mes} /></label>
            <label htmlFor="f-cat">Categoria<select id="f-cat" name="cat" defaultValue={q.cat ?? ''}><option value="">Todas as categorias</option>{MANUAIS.map(([k, c]) => <option key={k} value={k}>{c.nome}</option>)}</select></label>
            <label htmlFor="f-st">Status<select id="f-st" name="st" defaultValue={q.st ?? ''}><option value="">Todos os status</option><option value="pago">Pago</option><option value="apagar">A pagar</option></select></label>
          </div>
          <div className="acoes"><button type="submit">Buscar lançamentos</button>
            <Link className="botao leve" href={`/financeiro/despesas?mes=${desloca(mes, -1)}`}>← mês anterior</Link>
            <Link className="botao leve" href={`/financeiro/despesas?mes=${desloca(mes, 1)}`}>próximo →</Link></div>
        </form>
        <p className="nota">{lista.length} lançamento(s) · {fmtBRL(total)}{aPagar ? ` · ${fmtBRL(aPagar)} a pagar no mês` : ''}</p>
        {lista.length === 0 ? <p className="vazio">Nenhum lançamento encontrado. Altere os filtros ou cadastre um novo lançamento.</p> : (
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Status</th><th className="n">Valor</th><th /></tr></thead>
            <tbody>
              {lista.map((l) => {
                const c = ehCategoria(l.categoria) ? CATEGORIAS[l.categoria] : null;
                const entra = c?.grupo === 'outras';
                const rep = l.origem === 'recorrente';
                return (
                  <tr key={`${l.id}-${l.data}`}>
                    <td className="n">{l.data.slice(8)}/{l.data.slice(5, 7)}</td>
                    <td>{c?.nome ?? l.categoria}{l.recorrente ? <> <span className="tag">mensal</span></> : null}</td>
                    <td>{l.descricao}{rep && <span className="nota"> (repetição automática)</span>}</td>
                    <td>{rep ? <span className="chip">previsto</span> : l.pago ? <span className="chip g">pago</span> :
                      <form action={marcarPago}><input type="hidden" name="id" value={l.id} /><button className="mini" type="submit">a pagar · marcar pago</button></form>}</td>
                    <td className={`n ${entra ? 'sobe' : ''}`}>{entra ? '' : '−'}{fmtBRL(l.valor_centavos / 100)}</td>
                    <td>{!rep && <form action={apagarLancamento}><input type="hidden" name="id" value={l.id} /><button className="mini" type="submit" aria-label="Apagar lançamento">×</button></form>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        <p className="nota">Despesas mensais aparecem sozinhas nos meses seguintes. Para parar uma recorrência, apague o lançamento original.</p>
      </div>
    </Casca>
  );
}
