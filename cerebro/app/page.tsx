import Link from 'next/link';
import Casca from '@/components/Casca';
import {alertas, lerConfig, lerMemoria, mesAtual, resumoMes} from '@/lib/dados';
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
  const avisos = alertas(mes);
  const memorias = lerMemoria('', 4);
  const vFat = variacao(r.receita, ant.receita);
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
          <span className={`var ${vFat === null ? '' : vFat >= 0 ? 'sobe' : 'desce'}`}>{vFat === null ? 'sem mês anterior' : `${vFat >= 0 ? '+' : ''}${fmtNum(vFat, 1)}% vs mês anterior`}</span></div>
        <div className="kpi"><span className="rot">Pedidos pagos · ticket médio</span><span className="val">{r.pagos.n} · {fmtBRL(r.ticket)}</span><span className="var">{r.pendentes.n} pendentes · {fmtPct(r.conversao)} de conversão</span></div>
        <div className="kpi"><span className="rot">Lucro líquido</span><span className={`val ${r.lucro < 0 ? 'desce' : ''}`}>{fmtBRL(r.lucro)}</span>
          <span className="var">{r.receita ? `${fmtPct(r.margem)} da receita, já com DAS e imposto Meta` : 'sem receita no mês'}</span></div>
        <div className="kpi"><span className="rot">ROAS real (com imposto Meta)</span><span className="val">{r.ads.total ? fmtNum(r.receita / (r.ads.total + r.impostoMeta)) : '–'}</span>
          <span className={`var ${r.impostoMeta ? 'desce' : ''}`}>{r.impostoMeta ? `${fmtBRL(r.impostoMeta)} de imposto Meta` : 'sem anúncios sincronizados'}</span></div>
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
