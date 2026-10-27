import Link from 'next/link';
import Casca from '@/components/Casca';
import {alertas, caixaPrevisto, entrada, lerConfig, lerMemoria, mesAtual, resumoMes} from '@/lib/dados';
import {dreMes} from '@/lib/financeiro';
import {usuarioAtual} from '@/lib/usuario';
import {fmtBRL, fmtNum, fmtPct} from '@/lib/calc';

export const dynamic = 'force-dynamic';

const nomeMes = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
const mesAnterior = (m: string) => {
  const [a, mm] = m.split('-').map(Number);
  return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, '0')}`;
};
const variacao = (atual: number, antes: number) => (antes ? ((atual - antes) / Math.abs(antes)) * 100 : null);

export default async function Inicio() {
  const u = await usuarioAtual();
  const mes = mesAtual();
  const r = resumoMes(mes), ant = resumoMes(mesAnterior(mes));
  const cfg = lerConfig();
  // O lucro do início é o do DRE do mês (com despesas fixas e pontuais), para os dois números serem o mesmo.
  const dre = dreMes(entrada(`${mes}-01`, `${mes}-31`.slice(0, 10)), mes);
  const ordem: Record<string, number> = {b: 0, a: 1, w: 2, g: 3};
  const todos = alertas(mes).sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
  const avisos = todos.slice(0, 7), outros = todos.slice(7);
  const memorias = lerMemoria('', 4);
  const cx = caixaPrevisto();
  // Só compara com o mês anterior quando ele tem pedidos suficientes (o primeiro mês sincronizado costuma ser parcial).
  const vFat = ant.pagos.n >= 20 ? variacao(r.receita, ant.receita) : null;
  const hora = Number(new Date().toLocaleString('en-US', {timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false}));
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <Casca>
      <div className="topo">
        <div>
          <div className="olho">{nomeMes(mes)}</div>
          <h1>{saudacao}, {u?.nome?.split(' ')[0]}. <b>Lucro real</b> do mês.</h1>
        </div>
        <Link className="botao leve" href="/financeiro?p=mes">Abrir financeiro</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="rot">Receita paga no mês</span><span className="val">{fmtBRL(r.receita)}</span>
          <span className={`var ${vFat === null ? '' : vFat >= 0 ? 'sobe' : 'desce'}`}>{vFat === null ? 'sem mês anterior completo' : `${vFat >= 0 ? '+' : ''}${fmtNum(vFat, 1)}% vs mês anterior`}</span></div>
        <div className="kpi"><span className="rot">Pedidos pagos · ticket médio</span><span className="val">{r.pagos.n} · {fmtBRL(r.ticket)}</span><span className="var">{r.pendentes.n} pendentes · {fmtPct(r.conversao)} de conversão</span></div>
        <div className="kpi"><span className="rot">Lucro líquido (DRE)</span><span className={`val ${dre.lucro < 0 ? 'desce' : ''}`}>{fmtBRL(dre.lucro)}</span>
          <span className="var">{dre.pontual > 0 ? `${fmtBRL(dre.lucroRecorrente)} sem a regularização do MEI (${fmtBRL(dre.pontual)})` : dre.totalReceitas ? `${fmtPct(dre.margem)} da receita, com DAS, imposto Meta e despesas` : 'sem receita no mês'}</span></div>
        <div className="kpi"><span className="rot">ROAS real (com imposto Meta)</span><span className="val">{r.roasReal === null ? '–' : fmtNum(r.roasReal)}</span>
          <span className={`var ${r.impostoMeta ? 'desce' : ''}`}>{r.impostoMeta ? `Gerenciador ${fmtNum(r.roas ?? 0)} · CPA real ${r.cpaReal === null ? '–' : fmtBRL(r.cpaReal)} · imposto ${fmtBRL(r.impostoMeta)}` : 'sem anúncios sincronizados'}</span></div>
      </div>

      <div className="cartao">
        <div className="topo"><h2>Caixa hoje</h2><Link href="/financeiro/caixa" className="nota">ver os próximos 10 dias</Link></div>
        <div className="destaque">
          <div><small>Conta PJ</small><b>{fmtBRL(cx.x.saldoConta)}</b><small>liberado na Cartpanda: {fmtBRL(cx.x.cartpanda.disponivel)}</small></div>
          <div><small>Fornecedor, 3 dias</small><b>{fmtBRL(cx.x.fornecedor.pendentes + cx.x.fornecedor.porDia * 3)}</b><small>pedidos a comprar</small></div>
          <div><small>Meta a cobrar</small><b>{fmtBRL(cx.prev.cob.valor)}</b><small>{cx.prev.cob.dia ? `previsto ${cx.prev.cob.dia.slice(8)}/${cx.prev.cob.dia.slice(5, 7)}` : 'sem previsão'}</small></div>
        </div>
        <p><b>{cx.prev.recomendacao.titulo}</b> <span className="nota">{cx.prev.recomendacao.detalhe}</span></p>
      </div>

      <div className="duas">
        <div className="cartao alerta">
          <div className="olho">O que o Único Drop pode não mostrar</div>
          <div className="num">+{fmtNum(cfg.meta_imposto_pct)}%</div>
          <p>Desde janeiro de 2026 a Meta soma PIS/Cofins e ISS ao gasto. O Gerenciador mostra o valor <b>sem</b> imposto. No Simples Nacional isso não vira crédito: é custo. Aqui, todo gasto copiado do Gerenciador ganha o imposto lançado junto, e o CPA máximo e o ROAS de break-even já descontam essa diferença.</p>
        </div>
        <div className="cartao">
          <h2>Atenção agora</h2>
          {avisos.length === 0 ? <p className="nota">Nada pedindo ação.</p> : (
            <div className="feed">
              {avisos.map((a, i) => <div key={i}><span className={`ponto ${a.nivel}`} /><span>{a.texto}<small>{a.onde}</small></span></div>)}
            </div>
          )}
          {outros.length > 0 && (
            <details>
              <summary className="nota">Mais {outros.length} aviso(s)</summary>
              <div className="feed">{outros.map((a, i) => <div key={i}><span className={`ponto ${a.nivel}`} /><span>{a.texto}<small>{a.onde}</small></span></div>)}</div>
            </details>
          )}
        </div>
      </div>

      <div className="cartao">
        <div className="topo"><h2>Últimas decisões na memória</h2><Link href="/memoria" className="nota">ver todas</Link></div>
        <div className="mem">
          {memorias.map((m) => (
            <article key={m.id}><time>{m.criado_em.slice(0, 10).split('-').reverse().join('/')}</time><p>{m.texto}</p><span className="tag">{m.area}</span></article>
          ))}
        </div>
      </div>
    </Casca>
  );
}
