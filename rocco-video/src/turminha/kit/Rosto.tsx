import React from 'react';
import {COR} from '../../marca';
import {RostoEstado, dimBoca} from './rig';

// Rosto do kit (coordenadas do viewBox de 1000 da personagem). Cada personagem informa onde fica.
export type RostoLayout = {
  olhoEsq: {x: number; y: number};
  olhoDir: {x: number; y: number};
  sobrancelhaY: number;
  nariz: {x: number; y: number} | null;
  boca: {x: number; y: number};
  fundo: string; // cor que a pálpebra usa (a cor da "pele" ou do vidro)
};

const RX = 14;
const RY = 19;
const TINTA = COR.tinta;

const Olho: React.FC<{cx: number; cy: number; piscar: number; fundo: string; id: string}> = ({cx, cy, piscar, fundo, id}) => {
  const topo = cy - RY;
  // pálpebra cobre 22% em repouso (olhar sereno e atento) e desce até fechar
  const linha = topo + (0.22 + 0.78 * piscar) * 2 * RY;
  const fechado = piscar > 0.92;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <ellipse cx={cx} cy={cy} rx={RX + 1.5} ry={RY + 1.5} />
        </clipPath>
      </defs>
      {!fechado && <ellipse cx={cx} cy={cy} rx={RX} ry={RY} fill={TINTA} />}
      {!fechado && (
        <g clipPath={`url(#${id})`}>
          <rect x={cx - RX - 4} y={topo - 6} width={2 * RX + 8} height={linha - topo + 6} fill={fundo} />
          <path d={`M ${cx - RX - 3} ${linha + 1.5} Q ${cx} ${linha - 3} ${cx + RX + 3} ${linha + 1.5}`} stroke={TINTA} strokeWidth={4} fill="none" strokeLinecap="round" />
        </g>
      )}
      {fechado && (
        // olho fechado: arco sereno para baixo
        <path d={`M ${cx - RX - 2} ${cy + 2} Q ${cx} ${cy + 9} ${cx + RX + 2} ${cy + 2}`} stroke={TINTA} strokeWidth={4.5} fill="none" strokeLinecap="round" />
      )}
    </g>
  );
};

const Sobrancelha: React.FC<{cx: number; y: number; sobe: number; interna: number; espelho: 1 | -1}> = ({cx, y, sobe, interna, espelho}) => {
  // espelho = 1 para a sobrancelha da esquerda do quadro (ponta interna à direita)
  const externa = {x: cx - 25 * espelho, y: y + 4 - sobe};
  const interno = {x: cx + 25 * espelho, y: y + 4 - sobe - interna};
  return (
    <path
      d={`M ${externa.x} ${externa.y} Q ${cx} ${y - 6 - sobe - interna * 0.4} ${interno.x} ${interno.y}`}
      stroke={TINTA}
      strokeWidth={6}
      fill="none"
      strokeLinecap="round"
    />
  );
};

const Boca: React.FC<{x: number; y: number; estado: RostoEstado; w?: number; h?: number}> = ({x, y, estado, w: wForcado, h: hForcado}) => {
  const base = dimBoca(estado.v, estado.o);
  const w = wForcado ?? base.w;
  const h = hForcado ?? base.h;
  if (h < 3) {
    // fechada: linha com sorriso leve; "MBP" é lábio apertado (mais grosso, menos sorriso)
    const apertada = estado.v === 'MBP';
    const canto = estado.sorriso * 5;
    const meio = (apertada ? 3 : 6) + estado.sorriso * 3;
    return (
      <path
        d={`M ${x - w / 2} ${y - canto} Q ${x} ${y + meio} ${x + w / 2} ${y - canto}`}
        stroke={TINTA}
        strokeWidth={apertada ? 6 : 5}
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  const c = estado.sorriso * 3;
  return (
    <path
      d={`M ${x - w / 2} ${y - c} C ${x - w / 2} ${y - h * 0.55}, ${x + w / 2} ${y - h * 0.55}, ${x + w / 2} ${y - c} C ${x + w / 2} ${y + h * 0.9}, ${x - w / 2} ${y + h * 0.9}, ${x - w / 2} ${y - c} Z`}
      fill={COR.terracotaEscuro}
      stroke={TINTA}
      strokeWidth={5}
      strokeLinejoin="round"
    />
  );
};

export const Rosto: React.FC<{layout: RostoLayout; estado: RostoEstado; id: string; bocaWH?: {w: number; h: number}}> = ({layout, estado, id, bocaWH}) => {
  const ox = estado.olhar.x * 8;
  const oy = estado.olhar.y * 5;
  // o bloco do rosto acompanha o olhar (desliza até 10 px)
  const bx = estado.olhar.x * 10;
  const by = estado.olhar.y * 6;
  const {sobrancelha: s} = estado;
  return (
    <g transform={`translate(${bx} ${by})`}>
      <Sobrancelha cx={layout.olhoEsq.x} y={layout.sobrancelhaY} sobe={s.esq} interna={s.interna} espelho={1} />
      <Sobrancelha cx={layout.olhoDir.x} y={layout.sobrancelhaY} sobe={s.dir} interna={s.interna} espelho={-1} />
      <Olho cx={layout.olhoEsq.x + ox} cy={layout.olhoEsq.y + oy} piscar={estado.piscar} fundo={layout.fundo} id={`${id}-oe`} />
      <Olho cx={layout.olhoDir.x + ox} cy={layout.olhoDir.y + oy} piscar={estado.piscar} fundo={layout.fundo} id={`${id}-od`} />
      {layout.nariz && (
        <path
          d={`M ${layout.nariz.x - 6} ${layout.nariz.y - 6} Q ${layout.nariz.x - 1} ${layout.nariz.y + 5} ${layout.nariz.x + 7} ${layout.nariz.y - 1}`}
          stroke={TINTA}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      )}
      <Boca x={layout.boca.x} y={layout.boca.y} estado={estado} w={bocaWH?.w} h={bocaWH?.h} />
    </g>
  );
};
