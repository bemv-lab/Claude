import Link from 'next/link';
import Casca from '@/components/Casca';
import {CabecalhoFin} from '@/components/Fin';
import {planoDeAcao, radar30} from '@/lib/dados';
import {LIMITES, type Metricas} from '@/lib/plano';
import {fmtBRL, fmtNum, fmtPct} from '@/lib/calc';
import {apagarExperimento, concluirExperimento, criarExperimento, iniciarExperimento, reverterExperimento} from '@/app/acoes';

export const dynamic = 'force-dynamic';

const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const STATUS: Record<string, [string, string]> = {planejado: ['planejado', ''], em_andamento: ['em andamento', 'w'], concluido: ['concluído', 'g'], revertido: ['revertido', 'b']};
const VEREDITO: Record<string, string> = {
  poucos_dados: `Poucos dados ainda: precisa de ${LIMITES.minPagos} pedidos pagos antes e depois para dizer algo.`,
  reverter: `Reverter: os pedidos pagos por checkout iniciado caíram mais de ${LIMITES.quedaCheckoutPp} pontos, ou os pedidos por dia caíram mais de ${LIMITES.quedaPedidosPct}% sem o gasto em anúncios ter caído.`,
  manter: `Pode manter: os pedidos por dia não caíram mais de ${LIMITES.aceitaPedidosPct}% e o lucro por pedido subiu.`,
  observar: 'Observar mais alguns dias: nem queda grave nem ganho claro.',
};

const pct = (v: number | null) => (v === null ? '–' : fmtPct(v));
const linhas = (a: Metricas, d: Metricas): [string, string, string][] => [
  ['Pedidos pagos por dia', fmtNum(a.pedidosDia, 1), fmtNum(d.pedidosDia, 1)],
  ['Pedidos de cartão por dia', fmtNum(a.cartaoDia, 1), fmtNum(d.cartaoDia, 1)],
  ['Parcelas em média (cartão)', a.parcelasMedia === null ? '–' : `${fmtNum(a.parcelasMedia, 1)}x`, d.parcelasMedia === null ? '–' : `${fmtNum(d.parcelasMedia, 1)}x`],
  ['Pedidos pagos por checkout iniciado (Meta)', pct(a.convCheckout), pct(d.convCheckout)],
  ['Gasto em anúncios por dia', fmtBRL(a.gastoDia), fmtBRL(d.gastoDia)],
  ['Conversão do Pix (pago ÷ gerado)', `${pct(a.pix.pct)} (${a.pix.n} pagos)`, `${pct(d.pix.pct)} (${d.pix.n} pagos)`],
  ['Ticket médio', fmtBRL(a.ticket), fmtBRL(d.ticket)],
  ['Taxa de pagamento (gateway + checkout)', fmtPct(a.taxaPct), fmtPct(d.taxaPct)],
  ['Lucro por pedido (com anúncios e impostos)', a.lucroPedido === null ? '–' : fmtBRL(a.lucroPedido), d.lucroPedido === null ? '–' : fmtBRL(d.lucroPedido)],
];

export default function Plano() {
  const {experimentos, queda, acoes, politicas} = planoDeAcao();
  const rad = radar30();
  const a3 = rad.simulacao.find((s) => s.ate === 3), atual = rad.simulacao.find((s) => s.atual);

  return (
    <Casca>
      <CabecalhoFin aba="plano" titulo={<>Plano de <b>ação</b></>} sub="Toda mudança de política (parcelas sem juros, prazo, desconto no Pix) vira um experimento documentado: hipótese, o que muda, critério de sucesso, quando reverter e o antes e depois com números." />

      {queda && (
        <div className="cartao alerta">
          <div className="topo"><h2>A conversão caiu {fmtNum(queda.queda, 1)} pontos</h2><span className="chip b">testar</span></div>
          <p>Últimos 14 dias: {pct(queda.recente.conversao)} (cartão {pct(queda.recente.cartao.pct)}, Pix {pct(queda.recente.pix.pct)}). 14 dias antes: {pct(queda.anterior.conversao)} (cartão {pct(queda.anterior.cartao.pct)}, Pix {pct(queda.anterior.pix.pct)}).</p>
          <ol>{acoes.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <p className="nota">Cartão recusado ou abandonado não vira pedido na Shopify, então a conversão do cartão não aparece aqui: a queda está no total e no Pix.</p>
          <p className="nota">Documente a ação escolhida como experimento abaixo antes de mudar.</p>
        </div>
      )}

      <div className="cartao">
        <div><h2>Números de referência</h2><p className="nota">Últimos 30 dias, para decidir os testes de parcelamento.</p></div>
        <div className="res">
          <div className="linha"><span>Juros que a loja assume hoje (sem juros até {rad.cfg.parcelas_sem_juros}x)</span><span>{fmtBRL(atual?.custo ?? 0)}</span></div>
          <div className="linha"><span>Custo se assumir só até 3x</span><span>{fmtBRL(a3?.custo ?? 0)}</span></div>
          <div className="linha"><span>Economia por mês passando para 3x</span><span className="sobe">{fmtBRL((atual?.custo ?? 0) - (a3?.custo ?? 0))}</span></div>
          <div className="linha"><span>Cada pedido de cartão parcelado rende</span><span>{fmtBRL(rad.margemExtra)}</span></div>
          <div className="linha"><span><b>Ponto de equilíbrio</b>: perder essa quantidade de pedidos por mês anula a economia</span><span><b>{a3 && rad.margemExtra > 0 ? `${fmtNum(((atual?.custo ?? 0) - (a3.custo)) / rad.margemExtra, 1)} pedidos` : '–'}</b></span></div>
        </div>
        <p className="nota">Esse é o limite do que o teste pode custar em vendas. Política de parcelas em vigor desde: {politicas.map((p) => `${p.desde === '2000-01-01' ? 'sempre' : dm(p.desde)} → até ${p.sem_juros}x, D+${p.prazo_cartao}`).join(' · ')}. Mudar em <Link href="/taxas">Taxas e planos</Link> vale a partir do dia da mudança; os pedidos antigos ficam na regra da época.</p>
      </div>

      {experimentos.map((x) => {
        const [rotulo, cor] = STATUS[x.status];
        const c = x.comparacao;
        return (
          <div className="cartao" key={x.id}>
            <div className="topo"><div><h2>{x.titulo}</h2><p className="nota">{x.inicio ? `Início ${dm(x.inicio)}${x.fim ? `, fim ${dm(x.fim)}` : ' (em andamento)'}` : 'Ainda não começou'} · criado por {x.criado_por || '–'}</p></div><span className={`chip ${cor}`}>{rotulo}</span></div>
            <div className="res">
              <div className="linha"><span><b>Hipótese</b></span><span>{x.hipotese || '–'}</span></div>
              <div className="linha"><span><b>O que muda</b></span><span>{x.mudanca || '–'}</span></div>
              <div className="linha"><span><b>Sucesso</b></span><span>{x.sucesso || '–'}</span></div>
              <div className="linha"><span><b>Quando reverter</b></span><span>{x.reversao || '–'}</span></div>
              {x.decisao && <div className="linha"><span><b>Decisão</b></span><span>{x.decisao}</span></div>}
            </div>
            {c && (
              <>
                <div className="tabela"><table>
                  <thead><tr><th>Métrica</th><th className="n">Antes ({dm(c.antes.ini)} a {dm(c.antes.fim)})</th><th className="n">Depois ({dm(c.depois.ini)} a {dm(c.depois.fim)})</th></tr></thead>
                  <tbody>{linhas(c.antes, c.depois).map(([n, a, d]) => <tr key={n}><td>{n}</td><td className="n">{a}</td><td className="n">{d}</td></tr>)}</tbody>
                </table></div>
                <p className={c.veredito === 'reverter' ? 'erro' : 'nota'}><b>{VEREDITO[c.veredito]}</b></p>
              </>
            )}
            {x.status === 'planejado' && (
              <div className="acoes">
                <form action={iniciarExperimento}><input type="hidden" name="id" value={x.id} /><button type="submit">Começar hoje</button></form>
                <form action={apagarExperimento}><input type="hidden" name="id" value={x.id} /><button className="mini leve" type="submit">Apagar</button></form>
              </div>
            )}
            {x.status === 'planejado' && <p className="nota">Antes de começar, faça a mudança em Taxas e planos. “Começar hoje” fixa o dia que separa o antes do depois.</p>}
            {x.status === 'em_andamento' && (
              <form action={concluirExperimento}>
                <input type="hidden" name="id" value={x.id} />
                <label htmlFor={`dec-${x.id}`}>Decisão e o que aprendemos<input id={`dec-${x.id}`} name="decisao" placeholder="manter 3x; voltar para 6x; testar Pix com 5%…" /></label>
                <div className="acoes">
                  <button type="submit">Concluir e manter</button>
                  <button type="submit" formAction={reverterExperimento} className="leve">Reverter e registrar</button>
                </div>
              </form>
            )}
          </div>
        );
      })}

      <div className="cartao">
        <details>
          <summary><b>Novo experimento</b></summary>
          <form action={criarExperimento}>
            <div className="campos">
              <label htmlFor="e-t">Título<input id="e-t" name="titulo" required placeholder="Desconto de 5% no Pix" /></label>
              <label htmlFor="e-h">Hipótese<input id="e-h" name="hipotese" placeholder="Quem hesita no cartão migra para o Pix…" /></label>
              <label htmlFor="e-m">O que muda<input id="e-m" name="mudanca" /></label>
              <label htmlFor="e-s">Critério de sucesso<input id="e-s" name="sucesso" placeholder="em 14 dias…" /></label>
              <label htmlFor="e-r">Quando reverter<input id="e-r" name="reversao" /></label>
            </div>
            <div className="acoes"><button type="submit">Registrar</button></div>
          </form>
        </details>
      </div>
    </Casca>
  );
}
