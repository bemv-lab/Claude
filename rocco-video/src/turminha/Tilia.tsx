import React from 'react';
import {COR} from '../marca';
import {Braco} from './kit/Braco';
import {Rosto, RostoLayout} from './kit/Rosto';
import {Pt, RostoEstado} from './kit/rig';

// Tília: a anfitriã da Rocco. Lupa de leitura de mesa, em pé sobre a ponta do cabo.
// Desenho no viewBox de 1000 x 1700, chão em y = 1592. O rosto mora no vidro.
export const TILIA = {
  ponta: {x: 500, y: 1592},
  lente: {x: 500, y: 470},
  vidroR: 200,
  virola: {x: 500, y: 738},
  ombroEsq: {x: 292, y: 590},
  ombroDir: {x: 708, y: 590},
  madeira: '#d6bc98',
  madeiraSombra: '#c9a982',
  madeiraVeio: '#a8875f',
};

export const TILIA_ROSTO: RostoLayout = {
  olhoEsq: {x: 448, y: 452},
  olhoDir: {x: 552, y: 452},
  sobrancelhaY: 402,
  nariz: {x: 500, y: 490},
  boca: {x: 500, y: 532},
  fundo: COR.cremeClaro,
};

// Poses dos braços: alvo da mão em coordenadas da personagem
export const POSE = {
  repousoEsq: {x: 256, y: 822},
  repousoDir: {x: 744, y: 822},
  apresentarDir: {x: 935, y: 625},
  apresentarEsq: {x: 65, y: 625},
  juntasEsq: {x: 476, y: 748},
  juntasDir: {x: 524, y: 748},
  apontarBaixoEsq: {x: 150, y: 800},
  acenoDir: {x: 835, y: 395},
};

const POLO_ESQ = {x: 110, y: 920};
const POLO_DIR = {x: 890, y: 920};

const CABO = 'M452 776 C446 980 452 1300 460 1552 A40 40 0 0 0 540 1552 C548 1300 554 980 548 776 Z';

// Centro e raio do vidro no palco (para a lupa mostrar o que está embaixo dela)
export const centroLente = (x: number, y: number, s: number, balancoGraus = 0) => {
  const h = (TILIA.ponta.y - TILIA.lente.y) * s;
  const t = (balancoGraus * Math.PI) / 180;
  return {cx: x + h * Math.sin(t), cy: y - h * Math.cos(t), r: TILIA.vidroR * s};
};

export const ReflexoVidro: React.FC<{cx: number; cy: number; k: number}> = ({cx, cy, k}) => (
  <g opacity={0.6}>
    <path
      d={`M ${cx - 145.5 * k} ${cy - 84 * k} A ${168 * k} ${168 * k} 0 0 1 ${cx - 84 * k} ${cy - 145.5 * k}`}
      stroke={COR.branco}
      strokeWidth={14 * k}
      fill="none"
      strokeLinecap="round"
    />
    <circle cx={cx - 54 * k} cy={cy - 162 * k} r={7 * k} fill={COR.branco} />
  </g>
);

export type TiliaProps = {
  id: string;
  x: number; // ponta do cabo no palco
  y: number;
  s: number;
  balanco?: number; // graus, pivô na ponta
  inclinacao?: number; // graus, pivô na virola
  respiracao?: number; // 0..0.008
  rosto: RostoEstado;
  bocaWH?: {w: number; h: number};
  maoEsq?: Pt;
  maoDir?: Pt;
  palmaEsq?: number;
  palmaDir?: number;
  rostoOpacidade?: number;
  sombra?: boolean;
};

export const Tilia: React.FC<TiliaProps> = ({
  id,
  x,
  y,
  s,
  balanco = 0,
  inclinacao = 0,
  respiracao = 0,
  rosto,
  bocaWH,
  maoEsq = POSE.repousoEsq,
  maoDir = POSE.repousoDir,
  palmaEsq = 0,
  palmaDir = 0,
  rostoOpacidade = 1,
  sombra = true,
}) => {
  const {lente, virola} = TILIA;
  const esc = 1 + respiracao;
  return (
    <g>
      {sombra && <ellipse cx={x} cy={y + 8 * s} rx={150 * s} ry={18 * s} fill={COR.tinta} opacity={0.1} />}
      <g transform={`translate(${x} ${y}) scale(${s}) translate(${-TILIA.ponta.x} ${-TILIA.ponta.y})`}>
        <g transform={`rotate(${balanco} ${TILIA.ponta.x} ${TILIA.ponta.y})`}>
          {/* cabo de madeira de tília */}
          <defs>
            <clipPath id={`${id}-cabo`}>
              <path d={CABO} />
            </clipPath>
          </defs>
          <path d={CABO} fill={TILIA.madeira} />
          <g clipPath={`url(#${id}-cabo)`}>
            <rect x={526} y={760} width={40} height={860} fill={TILIA.madeiraSombra} />
            <path d="M486 820 C478 980 494 1140 484 1300 C478 1400 488 1480 486 1540" stroke={TILIA.madeiraVeio} strokeWidth={3} fill="none" opacity={0.45} />
            <path d="M510 860 C518 1000 504 1160 514 1320 C520 1420 510 1490 512 1530" stroke={TILIA.madeiraVeio} strokeWidth={3} fill="none" opacity={0.45} />
          </g>
          <path d={CABO} fill="none" stroke={TILIA.madeiraVeio} strokeWidth={3} />

          <g transform={`rotate(${inclinacao} ${virola.x} ${virola.y})`}>
            {/* virola */}
            <rect x={456} y={700} width={88} height={76} rx={12} fill={COR.salvia} />
            <line x1={456} y1={724} x2={544} y2={724} stroke={COR.musgo} strokeWidth={4} />
            <line x1={456} y1={750} x2={544} y2={750} stroke={COR.musgo} strokeWidth={4} />

            {/* braços saem de trás do aro */}
            <Braco ombro={TILIA.ombroEsq} alvo={maoEsq} polo={POLO_ESQ} cor={COR.musgo} palmaAberta={palmaEsq} />
            <Braco ombro={TILIA.ombroDir} alvo={maoDir} polo={POLO_DIR} cor={COR.musgo} palmaAberta={palmaDir} />

            <g transform={`translate(${lente.x} ${lente.y}) scale(${esc}) translate(${-lente.x} ${-lente.y})`}>
              {/* aro musgo, bisel terracota e vidro */}
              <circle cx={lente.x} cy={lente.y} r={224} fill="none" stroke={COR.musgo} strokeWidth={32} />
              <circle cx={lente.x} cy={lente.y} r={204} fill="none" stroke={COR.terracota} strokeWidth={8} />
              <circle cx={lente.x} cy={lente.y} r={200} fill={COR.cremeClaro} />
              <g opacity={rostoOpacidade}>
                <Rosto layout={TILIA_ROSTO} estado={rosto} id={id} bocaWH={bocaWH} />
              </g>
              <ReflexoVidro cx={lente.x} cy={lente.y} k={1} />
            </g>
          </g>
        </g>
      </g>
    </g>
  );
};

// Lupa: mostra, ampliado por escala uniforme, exatamente o que está embaixo dela (sem distorção)
export const Lupa: React.FC<{id: string; cx: number; cy: number; r: number; zoom: number; opacidade?: number; children: React.ReactNode}> = ({
  id,
  cx,
  cy,
  r,
  zoom,
  opacidade = 1,
  children,
}) => (
  <g opacity={opacidade}>
    <defs>
      <clipPath id={id}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id})`}>
      <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} fill={COR.cremeClaro} />
      <g transform={`translate(${cx} ${cy}) scale(${zoom}) translate(${-cx} ${-cy})`}>{children}</g>
    </g>
    <ReflexoVidro cx={cx} cy={cy} k={r / 200} />
  </g>
);

// Lente-assinatura: a mesma moldura da Tília, sem cabo e sem rosto, passeando sobre o produto
export const LenteAssinatura: React.FC<{id: string; cx: number; cy: number; R: number; zoom: number; opacidade?: number; children: React.ReactNode}> = ({
  id,
  cx,
  cy,
  R,
  zoom,
  opacidade = 1,
  children,
}) => {
  const k = R / 240;
  return (
    <g opacity={opacidade}>
      <circle cx={cx + 6 * k} cy={cy + 16 * k} r={R} fill={COR.tinta} opacity={0.08} />
      <Lupa id={id} cx={cx} cy={cy} r={200 * k} zoom={zoom}>
        {children}
      </Lupa>
      <circle cx={cx} cy={cy} r={204 * k} fill="none" stroke={COR.terracota} strokeWidth={8 * k} />
      <circle cx={cx} cy={cy} r={224 * k} fill="none" stroke={COR.musgo} strokeWidth={32 * k} />
    </g>
  );
};
