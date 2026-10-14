import React from 'react';
import {COR, FONTE} from '../marca';

// ILUSTRAÇÃO PROVISÓRIA da Pasta de Descobertas, só para o protótipo.
// No anúncio entra a foto real recortada (regra: produto nunca redesenhado).
// Sem ids internos (clipPath/gradiente) para poder ser desenhada duas vezes (normal e dentro da lente).

export const PASTA_ABERTA = {w: 900, h: 600};
export const PASTA_FECHADA = {w: 450, h: 600};

// Pontos de cada atividade na pasta aberta (coordenadas locais)
export const ANCORA = {
  ziper: {x: 290, y: 115},
  botao: {x: 92, y: 268},
  fivela: {x: 330, y: 267},
  cadarco: {x: 252, y: 448},
  relogio: {x: 575, y: 165},
  abaco: {x: 787, y: 165},
  encaixe: {x: 640, y: 352},
  numeros: {x: 655, y: 497},
};

const FELTRO = '#e9dcc6';
const COSTURA = '#c4ad8a';
const SALVIA_F = '#a7b096';
const AZUL_F = '#9fb2bf';
const MOSTARDA = '#d8b25a';
const CORAL_F = '#d9a38b';

const Painel: React.FC<{x: number}> = ({x}) => (
  <g>
    <rect x={x} y={20} width={435} height={560} rx={28} fill={FELTRO} />
    <rect x={x + 14} y={34} width={407} height={532} rx={20} fill="none" stroke={COSTURA} strokeWidth={3} strokeDasharray="10 8" />
  </g>
);

const Ziper: React.FC = () => {
  const dentes = [];
  for (let x = 62; x < 392; x += 9) {
    dentes.push(<rect key={x} x={x} y={(x / 9) % 2 < 1 ? 106 : 116} width={6} height={8} rx={1} fill={FELTRO} />);
  }
  return (
    <g>
      <rect x={40} y={55} width={375} height={120} rx={18} fill={SALVIA_F} />
      <rect x={58} y={106} width={340} height={18} rx={5} fill="#8d8a7a" />
      {dentes}
      <rect x={277} y={98} width={26} height={34} rx={7} fill={COR.terracota} />
      <rect x={283} y={130} width={14} height={30} rx={7} fill="none" stroke={COR.terracotaEscuro} strokeWidth={5} />
    </g>
  );
};

const Botao: React.FC<{cx: number; cy: number}> = ({cx, cy}) => (
  <g>
    <circle cx={cx} cy={cy} r={25} fill={MOSTARDA} stroke="#b8923d" strokeWidth={3} />
    {[
      [-6, -6],
      [6, -6],
      [-6, 6],
      [6, 6],
    ].map(([dx, dy]) => (
      <circle key={`${dx}${dy}`} cx={cx + dx} cy={cy + dy} r={3.5} fill="#8f6b2a" />
    ))}
  </g>
);

const Fivela: React.FC = () => (
  <g>
    <rect x={235} y={238} width={185} height={58} rx={14} fill={COR.terracotaClaro} />
    <rect x={300} y={226} width={34} height={82} rx={10} fill={COR.musgo} />
    <path d="M334 236 L362 244 L362 290 L334 298 Z" fill={COR.salvia} />
    <rect x={312} y={240} width={10} height={54} rx={4} fill={FELTRO} opacity={0.5} />
  </g>
);

const Sapato: React.FC = () => {
  const ilhoses = [
    [222, 420],
    [262, 405],
    [232, 452],
    [272, 437],
    [242, 484],
    [282, 469],
  ];
  return (
    <g>
      <path d="M80 520 C70 470 110 432 170 430 L252 398 C292 383 332 395 352 432 C382 482 402 500 397 530 Q395 552 372 552 L102 552 Q78 552 80 520 Z" fill={CORAL_F} />
      <path d="M86 532 L392 532" stroke={COSTURA} strokeWidth={4} strokeDasharray="9 7" />
      <path d="M222 420 L272 437 M262 405 L232 452 M232 452 L282 469 M272 437 L242 484" stroke={COR.branco} strokeWidth={6} strokeLinecap="round" />
      {ilhoses.map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={6.5} fill={FELTRO} stroke="#a7745f" strokeWidth={2} />
      ))}
      <ellipse cx={244} cy={386} rx={22} ry={12} fill="none" stroke={COR.branco} strokeWidth={6} transform="rotate(-25 244 386)" />
      <ellipse cx={284} cy={378} rx={22} ry={12} fill="none" stroke={COR.branco} strokeWidth={6} transform="rotate(20 284 378)" />
    </g>
  );
};

const Relogio: React.FC = () => {
  const cx = 575;
  const cy = 165;
  const marcas = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const r1 = i % 3 === 0 ? 70 : 76;
    marcas.push(
      <line key={i} x1={cx + r1 * Math.sin(a)} y1={cy - r1 * Math.cos(a)} x2={cx + 84 * Math.sin(a)} y2={cy - 84 * Math.cos(a)} stroke={COR.terracotaEscuro} strokeWidth={i % 3 === 0 ? 6 : 3} strokeLinecap="round" />,
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={98} fill={COR.creme} stroke={COR.terracotaEscuro} strokeWidth={8} />
      {marcas}
      <text x={cx} y={cy - 44} textAnchor="middle" fontFamily={FONTE} fontWeight={700} fontSize={22} fill={COR.musgo}>
        12
      </text>
      <line x1={cx} y1={cy} x2={cx} y2={cy - 52} stroke={COR.tinta} strokeWidth={7} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + 46} y2={cy + 28} stroke={COR.tinta} strokeWidth={5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={7} fill={COR.terracota} />
    </g>
  );
};

const Abaco: React.FC = () => {
  const cores = [COR.terracota, COR.salvia, MOSTARDA, '#7f9bb0', COR.terracotaClaro];
  return (
    <g>
      <rect x={705} y={62} width={165} height={210} rx={16} fill="#efe5d3" stroke="#bf9f74" strokeWidth={10} />
      {[115, 167, 219].map((y, r) => (
        <g key={y}>
          <line x1={712} y1={y} x2={863} y2={y} stroke="#a8875f" strokeWidth={4} />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={728 + i * 25 + (r === 1 && i > 2 ? 34 : 0) + (r === 2 && i > 1 ? 52 : 0)} cy={y} r={12.5} fill={cores[(i + r) % cores.length]} />
          ))}
        </g>
      ))}
    </g>
  );
};

const Encaixes: React.FC = () => (
  <g>
    <rect x={482} y={300} width={388} height={30} rx={10} fill="#cfd6c4" />
    {[
      [515, COR.terracota],
      [610, COR.musgo],
      [705, MOSTARDA],
      [800, AZUL_F],
    ].map(([x, cor]) => (
      <g key={x as number}>
        <rect x={x as number} y={306} width={56} height={96} rx={14} fill={cor as string} />
        <circle cx={(x as number) + 28} cy={380} r={9} fill={FELTRO} />
      </g>
    ))}
  </g>
);

const Fichas: React.FC = () => (
  <g>
    {[
      [500, '1', COR.terracotaEscuro],
      [610, 'A', COR.musgo],
    ].map(([x, t, c]) => (
      <g key={x as number}>
        <rect x={x as number} y={445} width={92} height={100} rx={16} fill="#efe5d3" stroke={COSTURA} strokeWidth={3} />
        <text x={(x as number) + 46} y={517} textAnchor="middle" fontFamily={FONTE} fontWeight={700} fontSize={60} fill={c as string}>
          {t}
        </text>
      </g>
    ))}
    {/* peixinho de feltro */}
    <g>
      <rect x={720} y={445} width={140} height={100} rx={16} fill="#efe5d3" stroke={COSTURA} strokeWidth={3} />
      <ellipse cx={782} cy={495} rx={34} ry={22} fill="#7f9bb0" />
      <path d="M814 495 L846 474 L846 516 Z" fill="#7f9bb0" />
      <circle cx={765} cy={490} r={4} fill={COR.tinta} />
    </g>
  </g>
);

export const PastaAberta: React.FC = () => (
  <g>
    <rect x={8} y={26} width={884} height={560} rx={30} fill={COR.tinta} opacity={0.08} transform="translate(6 12)" />
    <Painel x={10} />
    <Painel x={455} />
    <rect x={438} y={30} width={24} height={540} rx={8} fill="#d8c6a8" />
    <Ziper />
    <rect x={40} y={198} width={176} height={138} rx={18} fill={AZUL_F} />
    <rect x={62} y={220} width={132} height={96} rx={12} fill="none" stroke="#8698a6" strokeWidth={3} strokeDasharray="8 6" />
    <Botao cx={92} cy={268} />
    <Botao cx={164} cy={268} />
    <Fivela />
    <Sapato />
    <Relogio />
    <Abaco />
    <Encaixes />
    <Fichas />
  </g>
);

export const PastaFechada: React.FC = () => (
  <g>
    {/* alças */}
    <path d="M120 70 C120 -40 330 -40 330 70" stroke="#a8875f" strokeWidth={18} fill="none" strokeLinecap="round" />
    <rect x={14} y={42} width={430} height={556} rx={30} fill={COR.tinta} opacity={0.08} transform="translate(6 10)" />
    <rect x={10} y={40} width={430} height={550} rx={28} fill={SALVIA_F} />
    <rect x={24} y={54} width={402} height={522} rx={20} fill="none" stroke="#8b957b" strokeWidth={3} strokeDasharray="10 8" />
    <circle cx={225} cy={270} r={70} fill={MOSTARDA} />
    <path d="M150 400 Q225 350 300 400 L300 430 L150 430 Z" fill={FELTRO} />
    <rect x={190} y={470} width={70} height={18} rx={9} fill={COR.musgo} />
  </g>
);

export const Pasta: React.FC<{estado: 'aberta' | 'fechada'; x: number; y: number; escala: number; opacidade?: number; filtro?: string}> = ({
  estado,
  x,
  y,
  escala,
  opacidade = 1,
  filtro,
}) => (
  <g transform={`translate(${x} ${y}) scale(${escala})`} opacity={opacidade} filter={filtro}>
    {estado === 'aberta' ? <PastaAberta /> : <PastaFechada />}
  </g>
);

export const ancoraNoPalco = (a: {x: number; y: number}, x: number, y: number, escala: number) => ({x: x + a.x * escala, y: y + a.y * escala});
