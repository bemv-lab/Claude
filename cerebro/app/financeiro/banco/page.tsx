import Casca from '@/components/Casca';
import {CabecalhoFin, Linha} from '@/components/Fin';
import {custosDosProdutos, desloca, entrada, faturaCartaoPJ, hoje, lerBanco, lerConfig, lerCustosMedios, lerProdutos, mesAtual, saldoComSocio, saldosBanco} from '@/lib/dados';
import {CATEGORIAS_BANCO, CONTAS_MANUAIS, fluxoCaixa, gruposDeValorRepetido, nomeConta, numeroPedido, possiveisDuplicidades, sugerirVinculos} from '@/lib/banco';
import {resumo, taxaDoPedido} from '@/lib/financeiro';
import {fmtBRL} from '@/lib/calc';
import {aplicarSugestoes, classificarMov, importarCartoes, importarExtrato, novoMovimento, vincularGrupo} from '@/app/acoes';
import ImportarArquivo from './ImportarArquivo';

export const dynamic = 'force-dynamic';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const padraoDe = (nome: string) => nome.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const ehCartao = (conta: string) => conta.startsWith('cartao');

export default async function Banco({searchParams}: {searchParams: Promise<{mes?: string; cat?: string}>}) {
  const q = await searchParams;
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : mesAtual();
  const [a, m] = mes.split('-').map(Number);
  const ini = `${mes}-01`, fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const movs = lerBanco(ini, fim);
  const movsConta = movs.filter((x) => !ehCartao(x.conta));
  const fcTudo = fluxoCaixa(movs), fcConta = fluxoCaixa(movsConta);
  const saldos = saldosBanco();
  const cfg = lerConfig();
  const produtos = lerProdutos();
  const fatura = faturaCartaoPJ();
  const socio = saldoComSocio();
  const pessoal = lerBanco('2000-01-01', '2999-12-31').filter((x) => x.conta === 'cartao-pessoal').sort((a, b) => b.data.localeCompare(a.data));

  // Conciliação com as vendas do mês (pedidos pagos no mês); os pedidos vêm de uma semana antes para casar compras com pedidos.
  const e = entrada(desloca(ini, -7), fim);
  const pagos = e.pedidos.filter((p) => p.status === 'pago' && p.dia_pago && p.dia_pago >= ini && p.dia_pago <= fim);
  const esperado = pagos.reduce((s, p) => s + p.total - taxaDoPedido(p, e.taxas) - Math.round(p.total * cfg.reserva_pct) / 100, 0);
  const recebido = fcConta.porCategoria.find((c) => c.k === 'recebimento_vendas')?.liquido ?? 0;
  const r = resumo({...e, pedidos: pagos.map((p) => ({...p, dia: p.dia_pago!}))}, ini, fim);
  const fornecedorPago = -(fcTudo.porCategoria.find((c) => c.k === 'fornecedor')?.liquido ?? 0);
  const nFornecedor = movs.filter((x) => x.categoria === 'fornecedor' && x.valor < 0).length;
  const checkoutCobrado = -(fcConta.porCategoria.find((c) => c.k === 'taxas_cartpanda')?.liquido ?? 0);
  const aClassificar = movs.filter((x) => x.categoria === 'a_classificar');
  const lista = q.cat ? movs.filter((x) => x.categoria === q.cat) : movs;

  // Compras de fornecedor sem vínculo e pedidos pagos sem compra vinculada.
  const todas = lerBanco('2000-01-01', '2999-12-31');
  const sugestoes = sugerirVinculos(todas, e.pedidos, e.itens, e.custos);
  const vinculados = new Set(todas.filter((x) => x.pedido_numero).map((x) => x.pedido_numero));
  const semCompra = pagos.filter((p) => !vinculados.has(numeroPedido(p.numero)) && !sugestoes.some((s) => s.pedido === numeroPedido(p.numero)));
  const compras = movs.filter((x) => (x.categoria === 'fornecedor' || x.categoria === 'estoque') && x.valor < 0);
  const semVinculo = compras.filter((x) => !x.pedido_numero && !x.produto_ext);
  const custos = custosDosProdutos();
  const grupos = gruposDeValorRepetido(todas).slice(0, 12);
  const { semVinculo: nSemVinculo, valorSemVinculo } = lerCustosMedios();
  const duplicidades = possiveisDuplicidades(todas, [...new Set(e.custos.values())]).filter(([x]) => x.data >= ini && x.data <= fim);

  return (
    <Casca>
      <CabecalhoFin aba="banco" titulo={<>Conta <b>PJ</b> e cartões</>} sub="O dinheiro que de fato entrou e saiu: extrato do banco, cartão PJ e cartão pessoal. As despesas entram sozinhas no DRE e as compras de fornecedor se vinculam aos pedidos." />

      <div className="cartao">
        <div className="topo"><h2>Importar</h2>{saldos.map((s) => <span key={s.conta} className="tag">{s.banco} · saldo {fmtBRL(s.saldo)} em {s.em.split('-').reverse().join('/')}</span>)}</div>
        <p className="nota">Extrato do banco em OFX (o Cérebro não duplica movimentos):</p>
        <ImportarArquivo acao={importarExtrato} accept=".ofx,.OFX" rotulo="Arquivo OFX do extrato" botao="Importar extrato" />
        <p className="nota">Compras de cartão em CSV (colunas conta, data, descricao, valor negativo, categoria e pedido opcionais; contas: {Object.keys(CONTAS_MANUAIS).join(', ')}):</p>
        <ImportarArquivo acao={importarCartoes} accept=".csv,text/csv" rotulo="Arquivo CSV de compras no cartão" botao="Importar compras" />
        <details>
          <summary className="nota">Lançar uma compra à mão</summary>
          <form action={novoMovimento}>
            <div className="campos">
              <label htmlFor="mv-conta">Onde foi pago<select id="mv-conta" name="conta">{Object.entries(CONTAS_MANUAIS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label htmlFor="mv-data">Data<input id="mv-data" name="data" type="date" defaultValue={hoje()} required /></label>
              <label htmlFor="mv-desc">Descrição<input id="mv-desc" name="descricao" placeholder="Meta Ads, Shopify, Mercado Livre…" required /></label>
              <label htmlFor="mv-valor">Valor (R$)<input id="mv-valor" name="valor" className="num" inputMode="decimal" placeholder="0,00" required /></label>
              <label htmlFor="mv-cat">Categoria<select id="mv-cat" name="categoria" defaultValue=""><option value="">Classificar sozinho</option>{Object.entries(CATEGORIAS_BANCO).map(([k, c]) => <option key={k} value={k}>{c.nome}</option>)}</select></label>
              <label htmlFor="mv-ped">Pedido (opcional)<input id="mv-ped" name="pedido" placeholder="#20944" /></label>
            </div>
            <div className="acoes"><button type="submit">Lançar</button></div>
          </form>
        </details>
        <form action="/financeiro/banco"><div className="acoes">
          <select name="mes" defaultValue={mes} aria-label="Mês" style={{width: 'auto'}}>{[a - 1, a].flatMap((ano) => MESES.map((n, i) => { const v = `${ano}-${String(i + 1).padStart(2, '0')}`; return <option key={v} value={v}>{n} {ano}</option>; }))}</select>
          <button type="submit" className="leve">Ver mês</button></div></form>
      </div>

      <div className="kpis kpis-cor">
        <div className="kpi k-receita"><span className="rot">Entrou na conta</span><span className="val">{fmtBRL(fcConta.entradas)}</span><span className="var">{movsConta.filter((x) => x.valor > 0).length} movimentos</span></div>
        <div className="kpi k-taxas"><span className="rot">Saiu da conta</span><span className="val">{fmtBRL(fcConta.saidas)}</span><span className="var">{movsConta.filter((x) => x.valor < 0).length} movimentos</span></div>
        <div className="kpi k-lucro"><span className="rot">Resultado de caixa</span><span className={`val ${fcConta.resultado < 0 ? 'desce' : ''}`}>{fmtBRL(fcConta.resultado)}</span><span className="var">só a conta; compras no cartão saem quando a fatura é paga</span></div>
        <div className="kpi k-custo"><span className="rot">A classificar</span><span className={`val ${aClassificar.length ? 'desce' : ''}`}>{aClassificar.length}</span><span className="var">{aClassificar.length ? 'fora do DRE até classificar' : 'tudo classificado'}</span></div>
      </div>

      <div className="meio">
        <div className="cartao">
          <div className="topo"><div><h2>Cartão PJ (Inter)</h2><p className="nota">Fatura aberta · fecha dia {cfg.cartao_pj_fechamento}, vence dia {cfg.cartao_pj_vencimento}</p></div><span className="tag">vence {dm(fatura.vencimento)}</span></div>
          <div className="destaque">
            <div><small>Fatura aberta</small><b>{fmtBRL(fatura.total)}</b><small>compras de {dm(fatura.inicio)} a {dm(fatura.fecha)}</small></div>
            <div><small>Limite disponível</small><b>{fmtBRL(fatura.disponivel)}</b><small>de {fmtBRL(fatura.limite)}, garantido por CDB</small></div>
          </div>
          {fatura.itens.length === 0 ? <p className="vazio">Sem compras no ciclo. Importe a fatura em CSV ou lance à mão.</p> : (
            <div className="tabela"><table><tbody>{fatura.itens.map((x) => <tr key={x.fitid}><td className="n">{dm(x.data)}</td><td>{x.nome}</td><td className="nota">{(CATEGORIAS_BANCO[x.categoria] ?? CATEGORIAS_BANCO.a_classificar).nome}</td><td className="n desce">{fmtBRL(x.valor)}</td></tr>)}</tbody></table></div>
          )}
          <p className="nota">Para pagar a Meta por aqui, o limite precisa cobrir cada cobrança (hoje ~R$ 3,4 mil). Com limite garantido por CDB, isso trava um valor parecido em caixa.</p>
        </div>
        <div className="cartao">
          <div><h2>Saldo com a Bárbara</h2><p className="nota">Despesas da empresa pagas no cartão pessoal e o que já foi devolvido</p></div>
          <div className="res">
            {pessoal.map((x) => <Linha key={x.fitid} sub r={`${dm(x.data)} · ${x.nome}`} v={fmtBRL(-x.valor)} />)}
            <Linha r="Pago no cartão pessoal (Meta, Shopify…)" v={fmtBRL(socio.pago)} />
            <Linha r="Já reembolsado pela conta PJ" v={fmtBRL(socio.reembolsado)} />
            <Linha r={<b>A empresa deve à Bárbara</b>} v={<b className={socio.aReembolsar > 0 ? 'desce' : ''}>{fmtBRL(socio.aReembolsar)}</b>} />
            {cfg.meta_saldo_devedor > 0 && <Linha sub r="Fora disso, ainda a pagar à Meta (saldo devedor, entra na próxima cobrança)" v={fmtBRL(cfg.meta_saldo_devedor)} />}
          </div>
          <p className="nota">Reembolso não é salário nem lucro e não entra no DRE: a despesa já está na Meta, no Shopify etc. Só entra aqui o que foi lançado como “{CONTAS_MANUAIS['cartao-pessoal']}”: confira a lista acima com a fatura do cartão e lance o que faltar (Shopify de US$ 19 por mês, ferramentas, a cobrança da Meta de hoje…).</p>
        </div>
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
          <p className="nota">O checkout é cobrado toda segunda pela semana anterior, então o mês fecha com uma semana de atraso. Diferença pequena no repasse também é prazo: cartão cai em D+{cfg.prazo_cartao} e a reserva de {cfg.reserva_pct}% volta em {cfg.reserva_dias} dias.</p>
        </div>
        <div className="cartao">
          <div><h2>Fornecedor</h2><p className="nota">O que foi pago (conta e cartões) comparado com o custo dos produtos vendidos no mês</p></div>
          <div className="res">
            <Linha r={`Pago a fornecedores (${nFornecedor} pagamentos, já sem devoluções)`} v={fmtBRL(fornecedorPago)} />
            <Linha r={`Custo calculado dos produtos (${r.pagos.n} pedidos pagos)`} v={fmtBRL(r.custo)} />
            <Linha r={<b>Diferença</b>} v={<b>{fmtBRL(fornecedorPago - r.custo)}</b>} />
            <Linha r="Compras ainda sem pedido ou produto" v={`${semVinculo.length} de ${compras.length}`} />
            <Linha r="Pedidos pagos sem compra vinculada" v={String(semCompra.length)} />
          </div>
          <p className="nota">{r.semCusto ? `${r.semCusto} produto(s) sem custo cadastrado: o custo calculado está menor do que deveria. ` : ''}Pedido pago sem compra vinculada pode ser compra paga fora desta conta, estoque ou pedido que ainda não foi comprado do fornecedor.</p>
          {duplicidades.map(([x, y]) => <p key={x.fitid + y.fitid} className="erro">Possível pagamento em duplicidade: {fmtBRL(-x.valor)} em {dm(x.data)} ({nomeConta(x.conta)}) e em {dm(y.data)} ({nomeConta(y.conta)}). Se foram duas compras, vincule cada uma ao seu pedido; se não, peça o estorno.</p>)}
          {sugestoes.length > 0 && (
            <form action={aplicarSugestoes}>
              <p className="nota"><b>{sugestoes.length} vínculos sugeridos</b> (mesmo valor do custo do pedido, até 5 dias depois do pagamento):</p>
              <div className="tabela"><table><tbody>{sugestoes.slice(0, 8).map((s) => <tr key={s.fitid}><td className="n">{dm(s.data)}</td><td className="n">{fmtBRL(s.valor)}</td><td>→ pedido #{s.pedido}</td>
                <td><input type="hidden" name="sugestao" value={`${s.conta}\u0001${s.fitid}\u0001${s.pedido}`} /></td></tr>)}</tbody></table></div>
              {sugestoes.slice(8).map((s) => <input key={s.fitid} type="hidden" name="sugestao" value={`${s.conta}\u0001${s.fitid}\u0001${s.pedido}`} />)}
              <div className="acoes"><button type="submit">Aplicar os {sugestoes.length} vínculos</button></div>
            </form>
          )}
        </div>
      </div>

      <div className="cartao">
        <div><h2>Custo médio dos produtos</h2><p className="nota">Valor pago ao fornecedor ÷ unidades, de todos os pagamentos vinculados a um pedido ou produto. É este custo que entra no lucro, no ranking e na precificação.</p></div>
        <div className="tabela"><table>
          <thead><tr><th>Produto</th><th className="n">Custo médio</th><th className="n">Unidades</th><th className="n">Pago</th><th className="n">Pagamentos</th><th>Origem</th></tr></thead>
          <tbody>{custos.map((c) => (
            <tr key={c.shopify_id}>
              <td>{c.nome.replace(/\s+-\s+1 unidade$/i, '')}</td>
              <td className="n">{c.custo > 0 ? fmtBRL(c.custo) : '–'}</td>
              <td className="n">{c.unidades || ''}</td>
              <td className="n">{c.valor ? fmtBRL(c.valor) : ''}</td>
              <td className="n">{c.compras || ''}</td>
              <td>{c.origem === 'media' ? <span className="chip g">média dos pagamentos</span> : c.origem === 'manual' ? <span className="chip w">estimativa digitada</span> : <span className="chip">sem custo</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="nota">{nSemVinculo} pagamento(s) a fornecedor ({fmtBRL(valorSemVinculo)}) ainda sem pedido ou produto não entram na média. Quanto mais pagamentos vinculados, mais exato o custo.</p>
        {grupos.length > 0 && (
          <details open>
            <summary className="nota"><b>Vincular de uma vez:</b> pagamentos de mesmo valor (provavelmente o mesmo produto comprado várias vezes)</summary>
            {grupos.map((g) => (
              <form key={g.valor} action={vincularGrupo} className="classificar">
                <span><b>{g.n} × {fmtBRL(g.valor)}</b> <small className="nota">({fmtBRL(g.total)}; {g.movs.slice(-1)[0] ? dm(g.movs[g.movs.length - 1].data) : ''} a {dm(g.movs[0].data)})</small></span>
                {g.movs.map((m) => <input key={m.fitid} type="hidden" name="mov" value={`${m.conta}\u0001${m.fitid}`} />)}
                <select name="produto" aria-label="Produto do grupo" defaultValue=""><option value="">este valor é de…</option>{produtos.filter((p) => p.shopify_id).map((p) => <option key={p.id} value={p.shopify_id!}>{p.nome}</option>)}</select>
                <input name="quantidade" type="number" min="1" step="1" defaultValue="1" aria-label="Unidades em cada pagamento" style={{width: 64}} />
                <small className="nota">un. por pagamento</small>
                <button className="mini" type="submit">Vincular {g.n}</button>
              </form>
            ))}
          </details>
        )}
      </div>

      <div className="cartao">
        <div><h2>Para onde foi o dinheiro</h2><p className="nota">Mês por categoria, conta e cartões. As que têm DRE entram como despesa no resultado.</p></div>
        <div className="tabela"><table>
          <thead><tr><th>Categoria</th><th>No DRE</th><th className="n">Entrou</th><th className="n">Saiu</th><th className="n">Líquido</th></tr></thead>
          <tbody>{fcTudo.porCategoria.map((c) => {
            const cat = CATEGORIAS_BANCO[c.k] ?? CATEGORIAS_BANCO.a_classificar;
            return (
              <tr key={c.k}>
                <td><a href={`/financeiro/banco?mes=${mes}&cat=${c.k}`}>{cat.nome}</a> <small className="nota">({c.n})</small><br /><small className="nota">{cat.ajuda}</small></td>
                <td>{cat.dre ? <span className={`chip ${cat.dre === 'regularizacao' ? 'w' : 'g'}`}>{cat.dre === 'regularizacao' ? 'despesa pontual' : 'despesa'}</span> : <span className="chip">fora do resultado</span>}</td>
                <td className="n sobe">{c.entra ? fmtBRL(c.entra) : ''}</td>
                <td className="n desce">{c.sai ? fmtBRL(-c.sai) : ''}</td>
                <td className={`n ${c.liquido < 0 ? 'desce' : 'sobe'}`}>{fmtBRL(c.liquido)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>

      <div className="cartao">
        <div className="topo"><div><h2>Movimentos {q.cat ? `· ${CATEGORIAS_BANCO[q.cat]?.nome ?? ''}` : ''}</h2><p className="nota">Mude a categoria, vincule a compra a um pedido ou produto e, se quiser, crie uma regra para os próximos extratos.</p></div>
          {q.cat && <a className="nota" href={`/financeiro/banco?mes=${mes}`}>ver todos</a>}</div>
        {lista.length === 0 ? <p className="vazio">Nenhum movimento neste mês. Importe o extrato em OFX.</p> : (
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Descrição</th><th className="n">Valor</th><th>Categoria e vínculo</th></tr></thead>
            <tbody>{[...lista].sort((x, y) => (x.categoria === 'a_classificar' ? -1 : 0) - (y.categoria === 'a_classificar' ? -1 : 0) || y.data.localeCompare(x.data)).map((x) => (
              <tr key={`${x.conta}-${x.fitid}`}>
                <td className="n">{dm(x.data)}</td>
                <td>{x.nome}<br /><small className="nota">{nomeConta(x.conta)}{x.memo ? ` · ${x.memo.replace(/^[^:]*:\s*/, '').replace(/"/g, '').slice(0, 60)}` : ''}</small></td>
                <td className={`n ${x.valor < 0 ? 'desce' : 'sobe'}`}>{fmtBRL(x.valor)}</td>
                <td>
                  <form action={classificarMov} className="classificar">
                    <input type="hidden" name="conta" value={x.conta} /><input type="hidden" name="fitid" value={x.fitid} /><input type="hidden" name="padrao" value={padraoDe(x.nome)} />
                    <select name="categoria" defaultValue={x.categoria} aria-label="Categoria">{Object.entries(CATEGORIAS_BANCO).map(([k, c]) => <option key={k} value={k}>{c.nome}</option>)}</select>
                    {(x.categoria === 'fornecedor' || x.categoria === 'estoque' || x.categoria === 'a_classificar') && <>
                      <input name="pedido" defaultValue={x.pedido_numero ? `#${x.pedido_numero}` : ''} placeholder="pedido #" aria-label="Pedido da Shopify" style={{width: 96}} />
                      <select name="produto" defaultValue={x.produto_ext} aria-label="Produto"><option value="">produto…</option>{produtos.filter((p) => p.shopify_id).map((p) => <option key={p.id} value={p.shopify_id!}>{p.nome}</option>)}</select>
                      <input name="quantidade" type="number" min="1" step="1" defaultValue={x.quantidade || 1} aria-label="Unidades compradas neste pagamento" title="Unidades compradas neste pagamento (vale quando o vínculo é um produto)" style={{width: 56}} />
                    </>}
                    <label className="check"><input type="checkbox" name="regra" defaultChecked={x.categoria === 'a_classificar'} /> regra para “{padraoDe(x.nome)}”</label>
                    <button className="mini" type="submit">Salvar</button>
                    {x.regra === 'manual' && <span className="tag">manual</span>}
                    {x.pedido_numero && <span className="tag">pedido #{x.pedido_numero}</span>}
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
