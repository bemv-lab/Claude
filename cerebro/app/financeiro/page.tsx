import Link from 'next/link';
import Casca from '@/components/Casca';
import Sincronizar from '@/components/Sincronizar';
import {CabecalhoFin, Linha, rotuloPeriodo} from '@/components/Fin';
import {GraficoDiario, Faisca, Anel, BarraPartes} from '@/components/graficos';
import {desloca, entrada, lerConfig, mesAtual, periodo, resumoMes} from '@/lib/dados';
import {resumo, serieDiaria, destaques, ranking, NOME_FORMA} from '@/lib/financeiro';
import {fmtBRL, fmtNum, fmtPct} from '@/lib/calc';

export const dynamic = 'force-dynamic';

const COR_FORMA: Record<string, string> = {cartao: 'var(--c-cartao)', pix: 'var(--c-pix)', boleto: 'var(--c-boleto)'};

export default async function DashboardFin({searchParams}: {searchParams: Promise<{p?: string; de?: string; ate?: string; add?: string}>}) {
  const q = await searchParams;
  const per = periodo(q);
  const add = q.add === '1';
  // O gráfico mostra pelo menos 15 dias, terminando no fim do período.
  const iniGraf = per.ini < desloca(per.fim, -14) ? per.ini : desloca(per.fim, -14);
  const e = entrada(desloca(iniGraf, -14), per.fim);
  const r = resumo(e, per.ini, per.fim, add);
  const serie = serieDiaria(e, iniGraf, per.fim);
  const dest = destaques(serie, e, per.fim);
  const top = ranking(r, e).slice(0, 3);
  const cfg = lerConfig();
  const mes = resumoMes(mesAtual());
  const metaPct = cfg.meta_mes ? (mes.pagos.v / cfg.meta_mes) * 100 : 0;
  const semImpostos = r.lucro + r.imposto + r.impostoMeta;
  const qs = per.chave === 'outra' ? `de=${per.ini}&ate=${per.fim}` : `p=${per.chave}`;
  const formas = (['cartao', 'pix', 'boleto'] as const).map((f) => ({f, ...(r.porForma[f] ?? {pago: {n: 0, v: 0}, pendente: {n: 0, v: 0}, cancelado: {n: 0, v: 0}})}));

  return (
    <Casca>
      <CabecalhoFin aba="" per={per} titulo={<>Dashboard <b>financeiro</b></>} sub={`Receita, custos, marketing, impostos e lucro de ${rotuloPeriodo(per.ini, per.fim)}, calculados pedido a pedido.`} extra={<Sincronizar />} />

      <div className="kpis kpis-cor">
        <div className="kpi k-receita"><span className="rot">Receita líquida</span><span className="val">{fmtBRL(r.receita)}</span>
          <div className="mini-linhas"><span>Conversão<b>{fmtPct(r.conversao)}</b></span><span>Pedidos pagos<b>{r.pagos.n}</b></span></div></div>
        <div className="kpi k-custo"><span className="rot">Custo dos produtos</span><span className="val">{fmtBRL(r.custo)}</span>
          <div className="mini-linhas">{r.semCusto ? <Link href="/precificacao" className="desce">{r.semCusto} produto(s) sem custo cadastrado</Link> : <span>todos os produtos com custo</span>}</div></div>
        <div className="kpi k-mkt"><span className="rot">Marketing</span><span className="val">{fmtBRL(r.ads.total)}</span>
          <div className="mini-linhas"><span>Meta<b>{fmtBRL(r.ads.facebook)}</b></span><span>Google<b>{fmtBRL(r.ads.google)}</b></span>{r.ads.manual > 0 && <span>Manual<b>{fmtBRL(r.ads.manual)}</b></span>}</div></div>
        <div className="kpi k-taxas"><span className="rot">Taxas e impostos</span><span className="val">{fmtBRL(r.taxas)}</span>
          <div className="mini-linhas"><span>Checkout<b>{fmtBRL(r.checkout)}</b></span><span>Gateway<b>{fmtBRL(r.gateway)}</b></span><span>DAS<b>{fmtBRL(r.imposto)}</b></span><span>Imp. Meta<b>{fmtBRL(r.impostoMeta)}</b></span></div></div>
      </div>

      <div className="duas">
        <div className="cartao">
          <div className="topo"><div><h2>Resumo financeiro</h2><p className="nota">{rotuloPeriodo(iniGraf, per.fim)} · {serie.length} dias</p></div></div>
          <div className="destaques4">
            <div><small>Melhor dia</small><b>{fmtBRL(dest.melhor?.pago ?? 0)}</b><small>{dest.melhor ? new Date(`${dest.melhor.dia}T12:00:00Z`).toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'}) : '–'}</small></div>
            <div><small>Média por dia</small><b>{fmtBRL(dest.media)}</b><small>pago</small></div>
            <div><small>Margem de lucro</small><b className={dest.margem < 0 ? 'desce' : 'sobe'}>{fmtPct(dest.margem)}</b><small>lucro {fmtBRL(dest.lucro)}</small></div>
            <div><small>Últimos 7 dias</small><b className={(dest.variacao7 ?? 0) < 0 ? 'desce' : 'sobe'}>{dest.variacao7 === null ? '–' : `${dest.variacao7 >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(dest.variacao7))}`}</b><small>pago vs. 7 dias anteriores</small></div>
          </div>
          <GraficoDiario serie={serie} />
        </div>

        <div className="coluna">
          <div className="cartao lucro-card">
            <div className="topo"><div><small className="rot">Lucro líquido</small><div className={`grande ${r.lucro < 0 ? 'desce' : 'sobe'}`}>{fmtBRL(r.lucro)}</div></div><Faisca valores={serie.slice(-14).map((d) => d.lucro)} /></div>
            <p className="nota">Depois de custo, marketing, checkout, gateway, DAS e imposto da Meta.</p>
            <Link className="check" href={`/financeiro?${qs}${add ? '' : '&add=1'}`}><span className={`caixa ${add ? 'on' : ''}`} aria-hidden="true" />Incluir despesas lançadas ({fmtBRL(r.adicionais)})</Link>
            <div className="comparar">
              <span>Sem DAS e sem imposto Meta (no Único Drop os dois estão em 0%)</span><b>{fmtBRL(semImpostos)}</b>
            </div>
          </div>
          <div className="cartao">
            <div className="topo"><h2>Produtos que mais lucraram</h2><Link className="nota" href={`/financeiro/ranking?${qs}`}>ver ranking</Link></div>
            {top.length === 0 ? <p className="nota">Sem vendas pagas no período.</p> : top.map((p, i) => (
              <div className="rank" key={p.produto}><span className="pos">{i + 1}</span><span><b>{p.nome}</b><small>{fmtBRL(p.receita)} · {p.quantidade} un.</small></span><span className={p.lucro < 0 ? 'desce' : 'sobe'}>{fmtBRL(p.lucro)}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="faixa6">
        <div><b>{fmtBRL(r.pagos.v)}</b><small>{r.pagos.n} pedidos aprovados</small></div>
        <div><b>{fmtPct(r.margem)}</b><small>Margem de lucro</small></div>
        <div><b>{fmtBRL(r.pendentes.v)}</b><small>{r.pendentes.n} pedidos pendentes</small></div>
        <div><b>{r.cpa === null ? '–' : fmtBRL(r.cpa)}</b><small>Custo por aquisição</small></div>
        <div><b>{fmtBRL(r.ticket)}</b><small>Ticket médio</small></div>
        <div><b>{r.roi === null ? '–' : fmtPct(r.roi)}</b><small>ROI (lucro ÷ anúncios)</small></div>
      </div>

      <div className="meio">
        <div className="cartao">
          <div className="topo"><div><h2>Meta do mês</h2><p className="nota">Pedidos pagos em {new Date().toLocaleDateString('pt-BR', {month: 'long'})}</p></div><Link className="nota" href="/taxas">editar meta</Link></div>
          <div className="topo"><div className="grande">{fmtBRL(cfg.meta_mes)}</div><span className="nota">{fmtBRL(Math.max(0, cfg.meta_mes - mes.pagos.v))} para bater</span></div>
          <div className="progresso"><span style={{width: `${Math.min(100, metaPct)}%`}} /></div>
          <p className="nota">{fmtBRL(mes.pagos.v)} · {fmtPct(metaPct)}</p>
        </div>
        <div className="cartao">
          <div><h2>Forma de pagamento</h2><p className="nota">Pedidos pagos no período</p></div>
          <BarraPartes partes={formas.map((x) => ({nome: NOME_FORMA[x.f], v: x.pago.v, cor: COR_FORMA[x.f]}))} />
          <div className="tres">{formas.map((x) => <div key={x.f}><b>{r.pagos.n ? fmtPct((x.pago.n / r.pagos.n) * 100) : '0%'}</b><small className="lg-cor" style={{['--c' as string]: COR_FORMA[x.f]}}>{NOME_FORMA[x.f]}</small></div>)}</div>
        </div>
      </div>

      <div className="grade3">
        {formas.map((x) => {
          const total = x.pago.n + x.pendente.n + x.cancelado.n;
          return (
            <div className="cartao conv" key={x.f}>
              <div><h2>{NOME_FORMA[x.f]}</h2><p className="nota">Conversão dos pedidos via {NOME_FORMA[x.f].toLowerCase()}</p></div>
              <div className="conv-corpo">
                <Anel pct={total ? (x.pago.n / total) * 100 : 0} cor={COR_FORMA[x.f]} />
                <div className="res">
                  <Linha r="Aprovados" v={`${fmtBRL(x.pago.v)} (${x.pago.n})`} />
                  <Linha r="Pendentes" v={`${fmtBRL(x.pendente.v)} (${x.pendente.n})`} />
                  <Linha r="Cancelados" v={`${fmtBRL(x.cancelado.v)} (${x.cancelado.n})`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="duas">
        <div className="cartao">
          <div><h2>Funil da Meta</h2><p className="nota">Do anúncio à compra, no período</p></div>
          {r.ads.facebook === 0 ? <p className="vazio">Sem dados da Meta no período. Configure META_TOKEN e META_CONTA e clique em Sincronizar.</p> : (
            <div className="funil">
              {([['Visualizações da página', r.funil.views], ['Adicionou ao carrinho', r.funil.carrinho], ['Iniciou o checkout', r.funil.checkout], ['Compras (Meta)', r.funil.compras]] as [string, number][]).map(([n, v]) => (
                <div key={n}><small>{n} · {r.funil.views ? fmtPct((v / r.funil.views) * 100) : '–'}</small><span className="pista"><span className="barra" style={{width: `${r.funil.views ? Math.max(1, (v / r.funil.views) * 100) : 0}%`}} /></span><b>{fmtNum(v, 0)}</b></div>
              ))}
            </div>
          )}
          <div className="faixa5">
            <div><small>CPM</small><b>{r.funil.cpm === null ? '–' : fmtBRL(r.funil.cpm)}</b></div>
            <div><small>CTR</small><b>{r.funil.ctr === null ? '–' : fmtPct(r.funil.ctr)}</b></div>
            <div><small>CPC</small><b>{r.funil.cpc === null ? '–' : fmtBRL(r.funil.cpc)}</b></div>
            <div><small>CPA</small><b>{r.cpa === null ? '–' : fmtBRL(r.cpa)}</b></div>
            <div><small>ROAS</small><b>{r.roas === null ? '–' : `${fmtNum(r.roas)}x`}</b></div>
          </div>
        </div>
        <div className="cartao">
          <div className="topo"><div><h2>Despesas lançadas</h2><p className="nota">Fixas, financeiras e outras do período</p></div><Link className="nota" href="/financeiro/despesas">lançar</Link></div>
          <div className="grande">{fmtBRL(r.adicionais)}</div>
          <p className="nota">{r.adicionais ? 'Entram no lucro quando a opção "Incluir despesas lançadas" está marcada, e sempre no DRE.' : 'Nenhuma despesa no período.'}</p>
        </div>
      </div>
    </Casca>
  );
}
