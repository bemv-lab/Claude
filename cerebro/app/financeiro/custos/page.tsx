import Link from 'next/link';
import Casca from '@/components/Casca';
import {CabecalhoFin} from '@/components/Fin';
import {avisosDeCustos, entrada, radar30} from '@/lib/dados';
import {CATEGORIAS, fmtBRL, fmtNum, fmtPct, ehCategoria} from '@/lib/calc';

export const dynamic = 'force-dynamic';

const NIVEL: Record<string, string> = {b: 'b', w: 'w', g: 'g', a: 'a'};

export default function Custos() {
  const x = radar30();
  const avisos = avisosDeCustos(x);
  const atual = x.simulacao.find((s) => s.atual);
  const prazoAtual = x.prazos.find((p) => p.atual);
  const e = entrada(x.ini, x.fim);
  // Custos fixos e financeiros dos últimos 30 dias, agrupados pelo que foi pago.
  let pontual = 0;
  const fixos = new Map<string, {descricao: string; categoria: string; valor: number; n: number}>();
  for (const l of e.lancamentos) {
    if (!ehCategoria(l.categoria)) continue;
    const g = CATEGORIAS[l.categoria].grupo;
    if (g === 'pontual') { pontual += l.valor_centavos / 100; continue; }
    if (g !== 'fixas' && g !== 'financeiras') continue;
    const chave = `${l.categoria}|${l.descricao.replace(/\s*\(.*\)$/, '')}`;
    const v = fixos.get(chave) ?? {descricao: l.descricao.replace(/\s*\(.*\)$/, ''), categoria: l.categoria, valor: 0, n: 0};
    v.valor += l.valor_centavos / 100; v.n++;
    fixos.set(chave, v);
  }
  const listaFixos = [...fixos.values()].sort((a, b) => b.valor - a.valor);
  const totalFixos = listaFixos.reduce((s, f) => s + f.valor, 0);

  return (
    <Casca>
      <CabecalhoFin aba="custos" titulo={<>Custos e <b>otimização</b></>} sub={`Onde dá para pagar menos: taxas, juros de parcelamento, prazo de recebimento, impostos e custos fixos. Janela dos últimos 30 dias (${x.ini.slice(8)}/${x.ini.slice(5, 7)} a ${x.fim.slice(8)}/${x.fim.slice(5, 7)}).`} />

      <div className="kpis kpis-cor">
        <div className="kpi k-taxas"><span className="rot">Taxa de pagamento (gateway + checkout)</span><span className="val">{fmtPct(x.taxaTotalPct)}</span><span className="var">da receita · {fmtBRL(x.r.gateway + x.r.checkout)}</span></div>
        <div className="kpi k-mkt"><span className="rot">Juros que a loja assume</span><span className="val">{fmtBRL(x.juros.valor)}</span><span className="var">{fmtPct(x.juros.pctReceita)} da receita · sem juros até {x.cfg.parcelas_sem_juros}x</span></div>
        <div className="kpi k-custo"><span className="rot">Custo médio do cartão</span><span className="val">{fmtPct(x.pix.pctCartao)}</span><span className="var">contra {fmtPct(x.pix.pctPix)} do Pix</span></div>
        <div className="kpi k-receita"><span className="rot">Imposto da Meta (30 dias)</span><span className="val">{fmtBRL(x.r.impostoMeta)}</span><span className="var">{fmtPct(x.cfg.meta_imposto_pct)} sobre {fmtBRL(x.r.ads.total)} de anúncios · CPA real {x.r.cpaReal === null ? '–' : fmtBRL(x.r.cpaReal)}</span></div>
      </div>

      <div className="cartao alerta">
        <div className="topo"><h2>O que o sistema questiona</h2><span className="nota">sempre com o número, para você decidir</span></div>
        {avisos.length === 0 ? <p className="nota">Nada a questionar agora.</p> : (
          <div className="feed">{avisos.map((a, i) => <div key={i}><span className={`ponto ${NIVEL[a.nivel]}`} /><span>{a.texto}</span></div>)}</div>
        )}
      </div>

      <div className="cartao">
        <div><h2>Parcelar sem juros: quanto custa e quando se paga</h2>
          <p className="nota">A Cartpanda cobra juros por parcela. O cliente paga quando a loja não assume; a loja paga quando oferece “sem juros”. Aceitar até 12x não custa nada: o que custa é assumir os juros.</p></div>
        <div className="destaque">
          <div><small>Parcelas, em média</small><b>{fmtNum(x.mix.mediaParcelas, 1)}x</b><small>{x.mix.n} pedidos de cartão pagos</small></div>
          <div><small>À vista</small><b>{fmtPct(x.mix.avista)}</b><small>dos pedidos de cartão</small></div>
          <div><small>Até 3x</small><b>{fmtPct(x.mix.ate3)}</b><small>já não pesam com sem juros até 3x</small></div>
          <div><small>De 4x a 6x</small><b>{fmtPct(x.mix.de4a6)}</b><small>quem a loja subsidia hoje</small></div>
        </div>
        {x.mix.faixas.length > 0 && (
          <div className="tabela"><table>
            <thead><tr><th>Parcelas</th><th className="n">Pedidos</th><th className="n">% dos pedidos</th><th className="n">Receita</th><th className="n">Juros que a loja assume</th></tr></thead>
            <tbody>{x.mix.faixas.map((f) => {
              const j = x.juros.porParcela.find((p) => p.parcelas === f.parcelas);
              return <tr key={f.parcelas}><td>{f.parcelas === 1 ? 'À vista' : `${f.parcelas}x`}</td><td className="n">{f.n}</td><td className="n">{fmtPct(f.pctPedidos)}</td><td className="n">{fmtBRL(f.receita)}</td><td className="n">{j ? fmtBRL(j.custo) : f.parcelas > 1 ? 'cliente paga' : '–'}</td></tr>;
            })}</tbody>
          </table></div>
        )}
        <div className="tabela"><table>
          <thead><tr><th>Sem juros até</th><th className="n">Custo no mês</th><th className="n">Diferença para hoje</th><th className="n">Compradores afetados</th><th className="n">Pedidos que anulam a economia</th><th className="n">Tolerância</th></tr></thead>
          <tbody>{x.simulacao.map((s) => (
            <tr key={s.ate} className={s.atual ? 'forte' : ''}>
              <td>{s.ate === 1 ? 'À vista (nenhuma parcela)' : `${s.ate}x`} {s.atual && <span className="chip">hoje</span>}</td>
              <td className="n">{fmtBRL(s.custo)}</td>
              <td className={`n ${s.economiaVsAtual > 0 ? 'sobe' : s.economiaVsAtual < 0 ? 'desce' : ''}`}>{s.atual || Math.abs(s.economiaVsAtual) < 0.005 ? '–' : `${s.economiaVsAtual > 0 ? 'economiza ' : 'gasta mais '}${fmtBRL(Math.abs(s.economiaVsAtual))}`}</td>
              <td className="n">{s.afetados || '–'}</td>
              <td className="n">{s.afetados && s.equilibrioPedidos !== null ? fmtNum(s.equilibrioPedidos, 1) : '–'}</td>
              <td className="n">{s.toleranciaPct === null || !s.afetados ? '–' : fmtPct(s.toleranciaPct)}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="nota"><b>Isto é cenário, não resultado.</b> A tabela supõe que os compradores afetados continuem comprando. “Tolerância” é a fatia deles que pode desistir antes de a economia virar prejuízo: cada pedido perdido tira cerca de {fmtBRL(x.margemExtra)} (depois de produto, checkout, taxa e imposto, antes dos anúncios){x.r.semCusto ? `; há ${x.r.semCusto} produto(s) vendido(s) sem custo médio, então esse valor está acima do real` : ''}. Só o teste mostra o que acontece: registre a mudança como experimento no <Link href="/financeiro/plano">Plano de ação</Link> e compare a conversão do cartão antes e depois.</p>
      </div>

      <div className="meio">
        <div className="cartao">
          <div><h2>Prazo de recebimento do cartão</h2><p className="nota">Receber mais tarde paga menos taxa. O custo é o dinheiro parado a mais.</p></div>
          <div className="tabela"><table>
            <thead><tr><th>Prazo</th><th className="n">Taxa</th><th className="n">Economia</th><th className="n">Parado a mais</th><th className="n">Líquido</th></tr></thead>
            <tbody>{x.prazos.map((p) => (
              <tr key={p.dias} className={p.atual ? 'forte' : ''}>
                <td>D+{p.dias} {p.atual && <span className="chip">hoje</span>}</td><td className="n">{fmtPct(p.pct)}</td>
                <td className="n">{p.atual ? '–' : fmtBRL(p.economia)}</td><td className="n">{p.capital > 0 ? fmtBRL(p.capital) : '–'}</td>
                <td className={`n ${p.liquido > 0 && !p.atual ? 'sobe' : ''}`}>{p.atual ? '–' : fmtBRL(p.liquido)}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="nota">Líquido = economia de taxa menos {fmtPct(x.cfg.custo_capital_mensal)} ao mês sobre o dinheiro parado (ajuste em Taxas). Base: {fmtBRL(prazoAtual ? prazoAtual.custoTaxa / (prazoAtual.pct / 100) : 0)} de cartão por mês. O D+2 precisou de análise da Cartpanda; se vocês saírem dele, voltar pode não ser automático. Cada saque custa {fmtBRL(x.repasse.custoPorSaque)} (dois saques no mesmo dia são duas taxas): {x.repasse.saques} saque(s) nos últimos 30 dias = {fmtBRL(x.repasse.custo)}. Sacar em lote economiza essa taxa, mas deixa o dinheiro parado: fica no radar até haver caixa (veja Caixa).</p>
        </div>
        <div className="cartao">
          <div><h2>Pix contra cartão: teoria e prática</h2><p className="nota">O mesmo pedido custa bem menos no Pix, mas só se o cliente trocar de forma em vez de desistir.</p></div>
          <div className="res">
            <div className="linha"><span>Custo do cartão (com os juros assumidos)</span><span>{fmtPct(x.pix.pctCartao)}</span></div>
            <div className="linha"><span>Custo do Pix</span><span>{fmtPct(x.pix.pctPix)}</span></div>
            <div className="linha"><span><b>Teoria</b>: economia por pedido que migra para o Pix</span><span>{fmtBRL(x.pix.economiaPorPedido)}</span></div>
            <div className="linha"><span>Pedidos pagos no cartão (30 dias)</span><span>{x.pix.nCartao} de {x.r.pagos.n}</span></div>
            <div className="linha"><span><b>Prática</b>: conversão do Pix (pago ÷ gerado)</span><span>{x.pix.conversaoPix === null ? '–' : fmtPct(x.pix.conversaoPix)}</span></div>
            <div className="linha forte"><span>Desconto no Pix que ainda se paga</span><span>até {fmtPct(x.pix.descontoMax)}</span></div>
          </div>
          <p className="nota">A economia é real para quem compraria de qualquer jeito. Quem pagaria no cartão e some se o Pix for a única opção (ou se o Pix parecer difícil) custa a venda inteira. O cartão recusado ou abandonado não vira pedido na Shopify, então a conversão dele não é comparável com a do Pix. O Pix já é a maioria dos pagamentos; o ganho extra depende de quanto do cartão aceita migrar, e isso só aparece testando um desconto pequeno (3% a 5%) pelo <Link href="/financeiro/plano">Plano de ação</Link>.</p>
        </div>
      </div>

      <div className="meio">
        <div className="cartao">
          <div><h2>Taxa de pagamento semana a semana</h2><p className="nota">Gateway mais checkout sobre a receita. O Início avisa se subir 0,5 ponto.</p></div>
          <div className="tabela"><table>
            <thead><tr><th>Semana</th><th className="n">Receita</th><th className="n">Taxa</th><th /></tr></thead>
            <tbody>{x.tendencia.serie.map((s) => (
              <tr key={s.fim}><td>{s.ini.slice(8)}/{s.ini.slice(5, 7)} a {s.fim.slice(8)}/{s.fim.slice(5, 7)}</td><td className="n">{fmtBRL(s.receita)}</td><td className="n">{s.receita ? fmtPct(s.pct) : '–'}</td>
                <td><span className="barrinha"><span style={{width: `${Math.min(100, s.pct * 3)}%`}} /></span></td></tr>
            ))}</tbody>
          </table></div>
          <p className="nota">4 últimas semanas: {fmtPct(x.tendencia.recente)} · 4 anteriores: {fmtPct(x.tendencia.anterior)}{x.tendencia.variacao !== null ? ` · variação de ${x.tendencia.variacao >= 0 ? '+' : ''}${x.tendencia.variacao.toLocaleString('pt-BR', {maximumFractionDigits: 2})} ponto` : ''}.</p>
        </div>
        <div className="cartao">
          <div className="topo"><div><h2>Custos fixos e financeiros</h2><p className="nota">Últimos 30 dias, do extrato, dos cartões e dos lançamentos</p></div><span className="tag">{fmtBRL(totalFixos)}</span></div>
          {listaFixos.length === 0 ? <p className="vazio">Nada lançado. Importe o extrato em <Link href="/financeiro/banco">Conta PJ</Link>.</p> : (
            <div className="tabela"><table>
              <thead><tr><th>Quem recebeu</th><th>Tipo</th><th className="n">Valor</th></tr></thead>
              <tbody>{listaFixos.map((f) => <tr key={`${f.categoria}${f.descricao}`}><td>{f.descricao}{f.n > 1 ? ` (${f.n}×)` : ''}</td><td>{ehCategoria(f.categoria) ? CATEGORIAS[f.categoria].nome : f.categoria}</td><td className="n">{fmtBRL(f.valor)}</td></tr>)}</tbody>
            </table></div>
          )}
          {pontual > 0 && <p className="nota">Fora da lista, por serem pontuais: {fmtBRL(pontual)} de regularização do MEI e enquadramento.</p>}
          <p className="nota">Pergunta para cada linha: ainda uso? Dá para trocar por algo mais barato ou cancelar quando o Cérebro cobrir? Anote a decisão na <Link href="/memoria">Memória</Link>.</p>
        </div>
      </div>
    </Casca>
  );
}
