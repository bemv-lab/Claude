// Gráficos em SVG puro, desenhados no servidor com as cores do tema.
import {fmtBRL} from '@/lib/calc';

const curto = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', {maximumFractionDigits: 1})} mil` : `R$ ${Math.round(v)}`);
const passo = (max: number) => {
  const bruto = max / 4, mag = 10 ** Math.floor(Math.log10(bruto || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= bruto) ?? bruto;
};

type Dia = {dia: string; faturado: number; pago: number; lucro: number; custo: number; ads: number};

/** Barras do valor pago por dia, com linhas de faturado, lucro e anúncios. */
export function GraficoDiario({serie}: {serie: Dia[]}) {
  const W = 720, H = 260, L = 64, R = 12, T = 12, B = 28;
  const max = Math.max(1, ...serie.flatMap((d) => [d.faturado, d.pago, d.ads, d.lucro]));
  const min = Math.min(0, ...serie.map((d) => d.lucro));
  const s = passo(max - min), topo = Math.ceil(max / s) * s, base = Math.floor(min / s) * s;
  const y = (v: number) => T + ((topo - v) / (topo - base)) * (H - T - B);
  const bw = (W - L - R) / Math.max(1, serie.length);
  const x = (i: number) => L + bw * i + bw / 2;
  const linha = (k: keyof Dia) => serie.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k] as number).toFixed(1)}`).join(' ');
  const ticks: number[] = [];
  for (let v = base; v <= topo + 1e-9; v += s) ticks.push(v);
  const cadaN = Math.ceil(serie.length / 12);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vendas por dia: pago, faturado, lucro e anúncios">
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grade" /><text x={L - 8} y={y(v) + 3} textAnchor="end">{curto(v)}</text></g>)}
        {serie.map((d, i) => <rect key={d.dia} x={x(i) - bw * 0.32} width={bw * 0.64} y={y(Math.max(0, d.pago))} height={Math.max(0, y(0) - y(Math.max(0, d.pago)))} rx="3" className="barra-pago"><title>{`${d.dia.slice(8)}/${d.dia.slice(5, 7)} · pago ${fmtBRL(d.pago)} · lucro ${fmtBRL(d.lucro)} · ads ${fmtBRL(d.ads)}`}</title></rect>)}
        {serie.length > 1 && <>
          <path d={linha('faturado')} className="l-faturado" />
          <path d={linha('ads')} className="l-ads" />
          <path d={linha('lucro')} className="l-lucro" />
        </>}
        {serie.length === 1 && <circle cx={x(0)} cy={y(serie[0].lucro)} r="4" className="p-lucro" />}
        {serie.map((d, i) => (i % cadaN === 0 || (i === serie.length - 1 && i % cadaN > cadaN / 2)) && <text key={d.dia} x={x(i)} y={H - 8} textAnchor="middle">{`${d.dia.slice(8)}/${d.dia.slice(5, 7)}`}</text>)}
      </svg>
      <div className="legenda"><span className="lg-pago">Pago</span><span className="lg-faturado">Faturado</span><span className="lg-lucro">Lucro</span><span className="lg-ads">Anúncios</span></div>
    </div>
  );
}

/** Mini gráfico de barras do lucro por dia. */
export function Faisca({valores}: {valores: number[]}) {
  const W = 120, H = 44, max = Math.max(1, ...valores.map(Math.abs)), bw = W / Math.max(1, valores.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="faisca" aria-hidden="true">
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="grade" />
      {valores.map((v, i) => <rect key={i} x={i * bw + bw * 0.2} width={bw * 0.6} y={v >= 0 ? H / 2 - (v / max) * (H / 2) : H / 2} height={Math.max(1, (Math.abs(v) / max) * (H / 2))} rx="1" className={v >= 0 ? 'f-pos' : 'f-neg'} />)}
    </svg>
  );
}

/** Rosca com fatias por categoria. */
export function Rosca({partes, centro, rotulo}: {partes: {nome: string; v: number; cor: string}[]; centro: string; rotulo: string}) {
  const total = partes.reduce((s, p) => s + p.v, 0);
  const r = 52, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="rosca">
      <svg viewBox="0 0 140 140" role="img" aria-label={partes.map((p) => `${p.nome} ${total ? Math.round((p.v / total) * 100) : 0}%`).join(', ')}>
        <circle cx="70" cy="70" r={r} className="rosca-fundo" />
        {total > 0 && partes.filter((p) => p.v > 0).map((p) => {
          const len = (p.v / total) * c, el = <circle key={p.nome} cx="70" cy="70" r={r} fill="none" stroke={p.cor} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
          acc += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="rosca-num">{centro}</text>
        <text x="70" y="86" textAnchor="middle">{rotulo}</text>
      </svg>
      <div className="legenda">{partes.map((p) => <span key={p.nome} style={{['--c' as string]: p.cor}} className="lg-cor">{p.nome} {total ? Math.round((p.v / total) * 100) : 0}%</span>)}</div>
    </div>
  );
}

/** Anel de porcentagem (conversão). */
export function Anel({pct, cor}: {pct: number; cor: string}) {
  const r = 34, c = 2 * Math.PI * r, len = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg viewBox="0 0 84 84" className="anel" role="img" aria-label={`Conversão ${Math.round(pct)}%`}>
      <circle cx="42" cy="42" r={r} className="rosca-fundo" strokeWidth="7" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={cor} strokeWidth="7" strokeLinecap={len > 0 ? 'round' : 'butt'} strokeDasharray={`${len} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" className="anel-num">{Math.round(pct)}%</text>
    </svg>
  );
}

/** Barra horizontal dividida em partes (soma 100%). */
export function BarraPartes({partes}: {partes: {nome: string; v: number; cor: string}[]}) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.v), 0);
  return (
    <div className="barra-partes" role="img" aria-label={partes.map((p) => `${p.nome} ${total ? Math.round((p.v / total) * 100) : 0}%`).join(', ')}>
      {partes.filter((p) => p.v > 0).map((p) => <span key={p.nome} style={{width: `${(p.v / total) * 100}%`, background: p.cor}} title={`${p.nome}: ${fmtBRL(p.v)}`}>{p.v / total > 0.08 ? `${Math.round((p.v / total) * 100)}%` : ''}</span>)}
    </div>
  );
}

/** Barras empilhadas por hora do dia (cartão, Pix, boleto). */
export function BarrasHora({horas}: {horas: {h: number; cartao: number; pix: number; boleto: number}[]}) {
  const W = 720, H = 200, L = 52, B = 22, T = 8;
  const max = Math.max(1, ...horas.map((h) => h.cartao + h.pix + h.boleto));
  const s = passo(max), topo = Math.ceil(max / s) * s;
  const y = (v: number) => T + ((topo - v) / topo) * (H - T - B);
  const bw = (W - L) / 24;
  const ticks: number[] = [];
  for (let v = 0; v <= topo + 1e-9; v += s) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vendas pagas por hora do dia">
      {ticks.map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className="grade" /><text x={L - 6} y={y(v) + 3} textAnchor="end">{curto(v)}</text></g>)}
      {horas.map((h) => {
        let acc = 0;
        return (
          <g key={h.h}>
            {(['cartao', 'pix', 'boleto'] as const).map((k) => {
              if (!h[k]) return null;
              const y0 = y(acc), y1 = y(acc + h[k]);
              acc += h[k];
              return <rect key={k} x={L + h.h * bw + bw * 0.18} width={bw * 0.64} y={y1} height={y0 - y1} className={`b-${k}`}><title>{`${h.h}h · ${k} ${fmtBRL(h[k])}`}</title></rect>;
            })}
            {h.h % 2 === 0 && <text x={L + h.h * bw + bw / 2} y={H - 6} textAnchor="middle">{`${String(h.h).padStart(2, '0')}h`}</text>}
          </g>
        );
      })}
    </svg>
  );
}
