import Casca from '@/components/Casca';
import {CabecalhoFin, Linha} from '@/components/Fin';
import {entrada, lerBanco, lerConfig, mesAtual, saldosBanco} from '@/lib/dados';
import {CATEGORIAS_BANCO, fluxoCaixa} from '@/lib/banco';
import {resumo, taxaDoPedido} from '@/lib/financeiro';
import {fmtBRL} from '@/lib/calc';
import {classificarMov} from '@/app/acoes';
import ImportarExtrato from './ImportarExtrato';

export const dynamic = 'force-dynamic';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const padraoDe = (nome: string) => nome.toLowerCase().split(/\s+/).slice(0, 2).join(' ');

export default async function Banco({searchParams}: {searchParams: Promise<{mes?: string; cat?: string}>}) {
  const q = await searchParams;
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : mesAtual();
  const [a, m] = mes.split('-').map(Number);
  const ini = `${mes}-01`, fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const movs = lerBanco(ini, fim);
  const fc = fluxoCaixa(movs);
  const saldos = saldosBanco();
  const cfg = lerConfig();
  // Conciliação com as vendas do mês (pedidos pagos no mês).
  const e = entrada(ini, fim);
  const pagos = e.pedidos.filter((p) => p.status === 'pago' && p.dia_pago && p.dia_pago >= ini && p.dia_pago <= fim);
  const esperado = pagos.reduce((s, p) => s + p.total - taxaDoPedido(p, e.taxas) - Math.round(p.total * cfg.reserva_pct) / 100, 0);
  const recebido = fc.porCategoria.find((c) => c.k === 'recebimento_vendas')?.liquido ?? 0;
  const r = resumo({...e, pedidos: pagos.map((p) => ({...p, dia: p.dia_pago!}))}, ini, fim);
  const fornecedorPago = -(fc.porCategoria.find((c) => c.k === 'fornecedor')?.liquido ?? 0);
  const nFornecedor = movs.filter((x) => x.categoria === 'fornecedor' && x.valor < 0).length;
  const checkoutCobrado = -(fc.porCategoria.find((c) => c.k === 'taxas_cartpanda')?.liquido ?? 0);
  const aClassificar = movs.filter((x) => x.categoria === 'a_classificar');
  const lista = q.cat ? movs.filter((x) => x.categoria === q.cat) : movs;

  return (
    <Casca>
      <CabecalhoFin aba="banco" titulo={<>Conta <b>PJ</b></>} sub="Extrato do banco: o dinheiro que de fato entrou e saiu. As despesas pagas por aqui entram sozinhas no DRE." />

      <div className="cartao">
        <div className="topo"><h2>Importar extrato</h2>{saldos.map((s) => <span key={s.conta} className="tag">{s.banco} · saldo {fmtBRL(s.saldo)} em {s.em.split('-').reverse().join('/')}</span>)}</div>
        <p className="nota">No app do banco, exporte o extrato em OFX (pode ser o período inteiro: o Cérebro não duplica movimentos).</p>
        <ImportarExtrato />
        <form action="/financeiro/banco"><div className="acoes">
          <select name="mes" defaultValue={mes} aria-label="Mês" style={{width: 'auto'}}>{[a - 1, a].flatMap((ano) => MESES.map((n, i) => { const v = `${ano}-${String(i + 1).padStart(2, '0')}`; return <option key={v} value={v}>{n} {ano}</option>; }))}</select>
          <button type="submit" className="leve">Ver mês</button></div></form>
      </div>

      <div className="kpis kpis-cor">
        <div className="kpi k-receita"><span className="rot">Entrou no mês</span><span className="val">{fmtBRL(fc.entradas)}</span><span className="var">{movs.filter((x) => x.valor > 0).length} movimentos</span></div>
        <div className="kpi k-taxas"><span className="rot">Saiu no mês</span><span className="val">{fmtBRL(fc.saidas)}</span><span className="var">{movs.filter((x) => x.valor < 0).length} movimentos</span></div>
        <div className="kpi k-lucro"><span className="rot">Resultado de caixa</span><span className={`val ${fc.resultado < 0 ? 'desce' : ''}`}>{fmtBRL(fc.resultado)}</span><span className="var">entradas menos saídas</span></div>
        <div className="kpi k-custo"><span className="rot">A classificar</span><span className={`val ${aClassificar.length ? 'desce' : ''}`}>{aClassificar.length}</span><span className="var">{aClassificar.length ? 'movimentos sem categoria' : 'tudo classificado'}</span></div>
      </div>

      <div className="meio">
        <div className="cartao">
          <div><h2>Repasses da Cartpanda</h2><p className="nota">O que caiu na conta comparado com o que as vendas pagas do mês deveriam render</p></div>
          <div className="res">
            <Linha r="Recebido da Cartpanda" v={fmtBRL(recebido)} />
            <Linha r={`Esperado das vendas pagas (${pagos.length} pedidos, já sem taxas e reserva)`} v={fmtBRL(esperado)} />
            <Linha r={<b>Diferença</b>} v={<b className={recebido - esperado < 0 ? 'desce' : 'sobe'}>{fmtBRL(recebido - esperado)}</b>} />
            <Linha r="Checkout cobrado pela Cartpanda (Stripe)" v={fmtBRL(checkoutCobrado)} />
            <Linha r="Checkout calculado (2,5% das vendas do mês)" v={fmtBRL(r.checkout)} />
          </div>
          <p className="nota">O checkout é cobrado toda segunda pela semana anterior, então o mês fecha com uma semana de atraso. Diferença pequena no repasse também é prazo: cartão cai em D+2 e a reserva de {cfg.reserva_pct}% volta em {cfg.reserva_dias} dias, então o começo e o fim do mês se deslocam.</p>
        </div>
        <div className="cartao">
          <div><h2>Fornecedor</h2><p className="nota">O que foi pago comparado com o custo dos produtos vendidos no mês</p></div>
          <div className="res">
            <Linha r={`Pago ao fornecedor (${nFornecedor} Pix, já sem devoluções)`} v={fmtBRL(fornecedorPago)} />
            <Linha r={`Custo calculado dos produtos (${r.pagos.n} pedidos pagos)`} v={fmtBRL(r.custo)} />
            <Linha r={<b>Diferença</b>} v={<b>{fmtBRL(fornecedorPago - r.custo)}</b>} />
          </div>
          <p className="nota">{r.semCusto ? `${r.semCusto} produto(s) sem custo cadastrado: o custo calculado está menor do que deveria. ` : ''}Pago a mais pode ser estoque ou frete do fornecedor; a menos, pedido ainda não pago a ele.</p>
        </div>
      </div>

      <div className="cartao">
        <div><h2>Para onde foi o dinheiro</h2><p className="nota">Mês por categoria. As que têm DRE entram como despesa no resultado.</p></div>
        <div className="tabela"><table>
          <thead><tr><th>Categoria</th><th>No DRE</th><th className="n">Entrou</th><th className="n">Saiu</th><th className="n">Líquido</th></tr></thead>
          <tbody>{fc.porCategoria.map((c) => {
            const cat = CATEGORIAS_BANCO[c.k] ?? CATEGORIAS_BANCO.a_classificar;
            return (
              <tr key={c.k}>
                <td><a href={`/financeiro/banco?mes=${mes}&cat=${c.k}`}>{cat.nome}</a> <small className="nota">({c.n})</small><br /><small className="nota">{cat.ajuda}</small></td>
                <td>{cat.dre ? <span className="chip g">despesa</span> : <span className="chip">fora do resultado</span>}</td>
                <td className="n sobe">{c.entra ? fmtBRL(c.entra) : ''}</td>
                <td className="n desce">{c.sai ? fmtBRL(-c.sai) : ''}</td>
                <td className={`n ${c.liquido < 0 ? 'desce' : 'sobe'}`}>{fmtBRL(c.liquido)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>

      <div className="cartao">
        <div className="topo"><div><h2>Movimentos {q.cat ? `· ${CATEGORIAS_BANCO[q.cat]?.nome ?? ''}` : ''}</h2><p className="nota">Mude a categoria e, se quiser, crie uma regra para os próximos extratos.</p></div>
          {q.cat && <a className="nota" href={`/financeiro/banco?mes=${mes}`}>ver todos</a>}</div>
        {lista.length === 0 ? <p className="vazio">Nenhum movimento neste mês. Importe o extrato em OFX.</p> : (
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Descrição</th><th className="n">Valor</th><th>Categoria</th></tr></thead>
            <tbody>{[...lista].sort((x, y) => (x.categoria === 'a_classificar' ? -1 : 0) - (y.categoria === 'a_classificar' ? -1 : 0) || y.data.localeCompare(x.data)).map((x) => (
              <tr key={`${x.conta}-${x.fitid}`}>
                <td className="n">{x.data.slice(8)}/{x.data.slice(5, 7)}</td>
                <td>{x.nome}<br /><small className="nota">{x.memo.replace(/^[^:]*:\s*/, '').replace(/"/g, '').slice(0, 70)}</small></td>
                <td className={`n ${x.valor < 0 ? 'desce' : 'sobe'}`}>{fmtBRL(x.valor)}</td>
                <td>
                  <form action={classificarMov} className="classificar">
                    <input type="hidden" name="conta" value={x.conta} /><input type="hidden" name="fitid" value={x.fitid} /><input type="hidden" name="padrao" value={padraoDe(x.nome)} />
                    <select name="categoria" defaultValue={x.categoria} aria-label="Categoria">{Object.entries(CATEGORIAS_BANCO).map(([k, c]) => <option key={k} value={k}>{c.nome}</option>)}</select>
                    <label className="check"><input type="checkbox" name="regra" defaultChecked={x.categoria === 'a_classificar'} /> regra para “{padraoDe(x.nome)}”</label>
                    <button className="mini" type="submit">Salvar</button>
                    {x.regra === 'manual' && <span className="tag">manual</span>}
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </Casca>
  );
}
