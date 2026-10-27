import Casca from '@/components/Casca';
import Sincronizar from '@/components/Sincronizar';
import {CabecalhoFin, Linha, rotuloPeriodo} from '@/components/Fin';
import {GraficoDiario, Rosca, BarrasHora} from '@/components/graficos';
import {desloca, entrada, lerConfig, mesAtual, periodo, resumoMes} from '@/lib/dados';
import {resumo, serieDiaria, distribuicoes, NOME_FORMA} from '@/lib/financeiro';
import {fmtBRL, fmtNum, fmtPct} from '@/lib/calc';

export const dynamic = 'force-dynamic';

const COR: Record<string, string> = {cartao: 'var(--c-cartao)', pix: 'var(--c-pix)', boleto: 'var(--c-boleto)'};
const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const STATUS: Record<string, [string, string]> = {pago: ['Pago', 'g'], pendente: ['Pendente', 'w'], cancelado: ['Cancelado', 'b'], reembolsado: ['Reembolsado', 'b']};

function Lista({itens, vazio, valor = true}: {itens: {k: string; n: number; v: number}[]; vazio: string; valor?: boolean}) {
  const max = Math.max(1, ...itens.map((i) => (valor ? i.v : i.n)));
  if (!itens.length) return <p className="nota">{vazio}</p>;
  return (
    <div className="lista-barras">
      {itens.slice(0, 8).map((i, x) => (
        <div key={i.k}><span className="pos">{x + 1}</span><span className="nome">{i.k}</span><span className="n">{valor ? `${fmtBRL(i.v)} · ${i.n}` : `${i.n} pedido${i.n === 1 ? '' : 's'}`}</span>
          <span className="barrinha"><span style={{width: `${((valor ? i.v : i.n) / max) * 100}%`}} /></span></div>
      ))}
    </div>
  );
}

export default async function Detalhado({searchParams}: {searchParams: Promise<{p?: string; de?: string; ate?: string}>}) {
  const per = periodo(await searchParams);
  const iniGraf = per.ini < desloca(per.fim, -14) ? per.ini : desloca(per.fim, -14);
  const e = entrada(iniGraf, per.fim);
  const r = resumo(e, per.ini, per.fim);
  const d = distribuicoes(r, e);
  const serie = serieDiaria(e, iniGraf, per.fim);
  const cfg = lerConfig(), mes = resumoMes(mesAtual());
  const f = (k: string) => r.porForma[k] ?? {pago: {n: 0, v: 0}, pendente: {n: 0, v: 0}, cancelado: {n: 0, v: 0}};
  const gerados = (['cartao', 'pix', 'boleto'] as const).map((k) => ({nome: NOME_FORMA[k], v: f(k).pago.n + f(k).pendente.n + f(k).cancelado.n, cor: COR[k]}));
  const pagosF = (['cartao', 'pix', 'boleto'] as const).map((k) => ({nome: NOME_FORMA[k], v: f(k).pago.n, cor: COR[k]}));
  const metaPct = cfg.meta_mes ? (mes.pagos.v / cfg.meta_mes) * 100 : 0;
  const madrugada = d.porHora.slice(0, 6).reduce((s, h) => s + h.cartao + h.pix + h.boleto, 0);
  const totalHora = d.porHora.reduce((s, h) => s + h.cartao + h.pix + h.boleto, 0);
  const melhorSemana = d.semana.reduce((m, x) => (x.v > m.v ? x : m), d.semana[0]);

  return (
    <Casca>
      <CabecalhoFin aba="detalhado" base="/financeiro/detalhado" per={per} titulo={<>Financeiro <b>detalhado</b></>} sub={`Vendas, lucro, custos e conversão de ${rotuloPeriodo(per.ini, per.fim)}.`} extra={<Sincronizar />} />

      <div className="grade3">
        <div className="cartao">
          <div className="topo"><h2>Pedidos pagos</h2><span className="tag">{r.pagos.n}</span></div>
          <div className="grande">{fmtBRL(r.pagos.v)}</div>
          <div className="res">
            <Linha r="Pedidos gerados" v={`${r.gerados.n} | ${fmtBRL(r.gerados.v)}`} cls="sobe" />
            <Linha r="Pendentes" v={`${r.pendentes.n} | ${fmtBRL(r.pendentes.v)}`} cls="desce" />
            <Linha r="Cancelados" v={`${r.cancelados.n} | ${fmtBRL(r.cancelados.v)}`} cls="desce" />
            {(['cartao', 'boleto', 'pix'] as const).flatMap((k) => [
              <Linha key={`${k}p`} r={`${NOME_FORMA[k]} pago`} v={`${f(k).pago.n} | ${fmtBRL(f(k).pago.v)}`} cls="sobe" />,
              <Linha key={`${k}n`} r={`${NOME_FORMA[k]} pendente`} v={`${f(k).pendente.n} | ${fmtBRL(f(k).pendente.v)}`} cls="desce" />,
            ])}
          </div>
        </div>
        <div className="cartao">
          <h2>Lucro</h2>
          <div className={`grande ${r.lucro < 0 ? 'desce' : 'sobe'}`}>{fmtBRL(r.lucro)}</div>
          <div className="res">
            <Linha r="ROI (com imposto Meta)" v={r.roi === null ? '–' : fmtPct(r.roi)} cls="sobe" />
            <Linha r="Margem de lucro" v={fmtPct(r.margem)} cls="sobe" />
            <Linha r="CPA real (com imposto Meta)" v={r.cpaReal === null ? '–' : fmtBRL(r.cpaReal)} cls="desce" />
            <Linha sub r="CPA no Gerenciador (sem imposto)" v={r.cpa === null ? '–' : fmtBRL(r.cpa)} />
            <Linha r="ROAS real (com imposto Meta)" v={r.roasReal === null ? '–' : `${fmtNum(r.roasReal)}x`} />
            <Linha r="Anúncios" v={fmtBRL(r.ads.total)} cls="desce" />
            <Linha sub r="Imposto da Meta sobre os anúncios" v={fmtBRL(r.impostoMeta)} />
            <Linha sub r="Meta" v={fmtBRL(r.ads.facebook)} />
            <Linha sub r="Google" v={fmtBRL(r.ads.google)} />
            <Linha sub r="Manual" v={fmtBRL(r.ads.manual)} />
            <Linha r="Custo dos produtos" v={fmtBRL(r.custo)} cls="desce" />
            <Linha r="Gateway" v={fmtBRL(r.gateway)} cls="desce" />
            <Linha r={`Checkout (${fmtPct(e.cfg.checkout_pct)})`} v={fmtBRL(r.checkout)} cls="desce" />
            <Linha r={`DAS ${r.impostoEstimado ? `(${fmtPct(e.cfg.das_pct)} estimado)` : '(lançado)'}`} v={fmtBRL(r.imposto)} cls="desce" />
            <Linha r={`Imposto Meta (${fmtPct(e.cfg.meta_imposto_pct)})`} v={fmtBRL(r.impostoMeta)} cls="desce" />
          </div>
        </div>
        <div className="cartao">
          <h2>Ticket médio</h2>
          <div className="grande">{fmtBRL(r.ticket)}</div>
          <div className="res">
            <Linha r="Frete cobrado" v={fmtBRL(r.frete)} />
            <Linha r="Descontos (cupons)" v={fmtBRL(r.descontos)} cls="desce" />
            <Linha r="Reembolsado" v={fmtBRL(r.reembolsado)} cls="desce" />
            <Linha r="Despesas lançadas" v={fmtBRL(r.adicionais)} cls="desce" />
            <Linha r="Pedidos sem produto cadastrado com custo" v={String(r.semCusto)} />
          </div>
          <p className="nota">Carrinhos abandonados, rastreios e mensagens entram quando a Cartpanda e o WhatsApp forem conectados.</p>
        </div>
      </div>

      <div className="cartao">
        <div><h2>Vendas diárias</h2><p className="nota">{rotuloPeriodo(iniGraf, per.fim)}</p></div>
        <GraficoDiario serie={serie} />
      </div>

      <div className="grade3">
        <div className="cartao"><div><h2>Forma de pagamento</h2><p className="nota">Todos os pedidos gerados</p></div><Rosca partes={gerados} centro={String(gerados.reduce((s, x) => s + x.v, 0))} rotulo="pedidos" /></div>
        <div className="cartao"><div><h2>Pedidos pagos</h2><p className="nota">Só os pagos, por forma</p></div><Rosca partes={pagosF} centro={String(r.pagos.n)} rotulo="pagos" /></div>
        <div className="cartao">
          <div><h2>Conversão</h2><p className="nota">Pedidos gerados que viraram pagos</p></div>
          <div className="res">
            {(['boleto', 'cartao', 'pix'] as const).map((k) => {
              const t = f(k).pago.n + f(k).pendente.n + f(k).cancelado.n;
              return <Linha key={k} r={<span className="lg-cor" style={{['--c' as string]: COR[k]}}>{NOME_FORMA[k]}</span>} v={`${t ? fmtPct((f(k).pago.n / t) * 100) : '0%'} · ${f(k).pago.n} de ${t}`} />;
            })}
            <Linha r={<b>Conversão geral</b>} v={<b>{fmtPct(r.conversao)} · {r.pagos.n} de {r.gerados.n + r.cancelados.n}</b>} />
          </div>
        </div>
      </div>

      <div className="cartao">
        <div><h2>Vendas por hora do dia</h2><p className="nota">Quando os clientes compram (pedidos pagos)</p></div>
        <div className="destaques4">
          <div><small>Horário de pico</small><b>{String(d.pico.h).padStart(2, '0')}h às {String(d.pico.h + 1).padStart(2, '0')}h</b><small>{d.pico.n} pedidos</small></div>
          <div><small>Melhor dia da semana</small><b>{melhorSemana.v ? SEMANA[melhorSemana.d] : '–'}</b><small>{fmtBRL(melhorSemana.v)}</small></div>
          <div><small>Madrugada (0h às 6h)</small><b>{totalHora ? fmtPct((madrugada / totalHora) * 100) : '0%'}</b><small>{fmtBRL(madrugada)}</small></div>
          <div><small>Pedidos pagos</small><b>{r.pagos.n}</b><small>no período</small></div>
        </div>
        <BarrasHora horas={d.porHora} />
        <div className="legenda"><span className="lg-cor" style={{['--c' as string]: COR.cartao}}>Cartão</span><span className="lg-cor" style={{['--c' as string]: COR.pix}}>Pix</span><span className="lg-cor" style={{['--c' as string]: COR.boleto}}>Boleto</span></div>
      </div>

      <div className="grade3">
        <div className="cartao">
          <div><h2>Meta do mês</h2><p className="nota">Pedidos pagos no mês atual</p></div>
          <div className="grande">{fmtPct(metaPct)}</div>
          <div className="progresso"><span style={{width: `${Math.min(100, metaPct)}%`}} /></div>
          <div className="res"><Linha r="Pagos" v={fmtBRL(mes.pagos.v)} /><Linha r="Meta" v={fmtBRL(cfg.meta_mes)} /><Linha r="Falta" v={fmtBRL(Math.max(0, cfg.meta_mes - mes.pagos.v))} /></div>
        </div>
        <div className="cartao">
          <div><h2>Cartões</h2><p className="nota">Parcelamento e bandeiras dos pagos</p></div>
          <h3 className="olho">Parcelamento</h3>
          <Lista itens={d.parcelas} vazio="Sem cartão no período." valor={false} />
          <h3 className="olho">Bandeiras</h3>
          <Lista itens={d.bandeiras} vazio="Sem cartão no período." valor={false} />
        </div>
        <div className="cartao">
          <div><h2>Últimas vendas</h2><p className="nota">Os pedidos mais recentes do período</p></div>
          <div className="res">
            {d.ultimas.length === 0 ? <p className="nota">Sem pedidos.</p> : d.ultimas.map((p) => (
              <div className="linha" key={p.id}><span>{p.produtos || p.numero}<br /><small className="nota">{p.numero} · {p.uf} · {p.dia.slice(8)}/{p.dia.slice(5, 7)} {String(p.hora).padStart(2, '0')}h</small></span>
                <span>{fmtBRL(p.total)}<br /><span className={`chip ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span></span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grade3">
        <div className="cartao"><div><h2>Estados</h2><p className="nota">Pedidos pagos por estado</p></div><Lista itens={d.estados} vazio="Sem pedidos pagos." /></div>
        <div className="cartao"><div><h2>Dias da semana</h2><p className="nota">Pedidos pagos por dia</p></div>
          <Lista itens={d.semana.filter((s) => s.n).map((s) => ({k: SEMANA[s.d], n: s.n, v: s.v})).sort((a, b) => b.v - a.v)} vazio="Sem pedidos pagos." /></div>
        <div className="cartao"><div><h2>Cupons</h2><p className="nota">Desconto concedido por cupom</p></div><Lista itens={d.cupons} vazio="Nenhum cupom usado." /></div>
      </div>
    </Casca>
  );
}
