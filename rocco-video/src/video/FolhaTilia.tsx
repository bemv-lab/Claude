import React from 'react';
import {AbsoluteFill} from 'remotion';
import {COR, FONTE, carregarFonte} from '../marca';
import {POSE, TILIA, Tilia} from '../turminha/Tilia';
import {ROSTO_NEUTRO, RostoEstado, Visema} from '../turminha/kit/rig';

carregarFonte();

// Folha de modelo da Tília (still 2400 x 1500): figura, expressões, bocas, poses e paleta.
const Rotulo: React.FC<{x: number; y: number; children: React.ReactNode; tam?: number; cor?: string}> = ({x, y, children, tam = 26, cor = COR.texto}) => (
  <text x={x} y={y} textAnchor="middle" fontFamily={FONTE} fontSize={tam} fill={cor}>
    {children}
  </text>
);

const so = (e: Partial<RostoEstado>): RostoEstado => ({...ROSTO_NEUTRO, ...e});

const EXPRESSOES: {nome: string; e: RostoEstado}[] = [
  {nome: 'repouso', e: so({})},
  {nome: 'curiosidade', e: so({sobrancelha: {esq: 8, dir: 8, interna: 0}, v: 'O', o: 0.5})},
  {nome: 'empatia', e: so({sobrancelha: {esq: 0, dir: 0, interna: 6}})},
  {nome: 'humor leve', e: so({sobrancelha: {esq: 6, dir: 0, interna: 0}, sorriso: 0.8})},
  {nome: 'escuta', e: so({olhar: {x: -0.6, y: 0.2}})},
  {nome: 'olhos fechados + sorriso', e: so({piscar: 1, sorriso: 1, sobrancelha: {esq: 0, dir: 0, interna: 4}})},
];

const BOCAS: Visema[] = ['X', 'MBP', 'FV', 'S', 'L', 'U', 'I', 'E', 'O', 'A'];

const POSES = [
  {nome: 'repouso', esq: POSE.repousoEsq, dir: POSE.repousoDir, pe: 0, pd: 0},
  {nome: 'apresentar', esq: POSE.repousoEsq, dir: POSE.apresentarDir, pe: 0, pd: 1},
  {nome: 'apontar', esq: POSE.apontarBaixoEsq, dir: POSE.repousoDir, pe: 1, pd: 0},
  {nome: 'mãos juntas', esq: POSE.juntasEsq, dir: POSE.juntasDir, pe: 0, pd: 0},
  {nome: 'aceno', esq: POSE.repousoEsq, dir: POSE.acenoDir, pe: 0, pd: 1},
];

// rosto isolado: só a lente da Tília (recorte em volta do aro)
const Close: React.FC<{cx: number; cy: number; e: RostoEstado; id: string; s?: number}> = ({cx, cy, e, id, s = 0.62}) => {
  const ponta = {x: cx, y: cy + (TILIA.ponta.y - TILIA.lente.y) * s};
  return (
    <g>
      <defs>
        <clipPath id={`${id}-recorte`}>
          <circle cx={cx} cy={cy} r={252 * s} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-recorte)`}>
        <Tilia id={id} x={ponta.x} y={ponta.y} s={s} rosto={e} sombra={false} />
      </g>
    </g>
  );
};

export const FolhaTilia: React.FC = () => {
  const paleta = [
    ['fundo', COR.creme],
    ['vidro', COR.cremeClaro],
    ['traço', COR.tinta],
    ['aro e braços', COR.musgo],
    ['virola', COR.salvia],
    ['bisel', COR.terracota],
    ['boca', COR.terracotaEscuro],
    ['cabo', TILIA.madeira],
  ];
  return (
    <AbsoluteFill style={{background: COR.creme}}>
      <svg viewBox="0 0 2400 1500" width={2400} height={1500}>
        <text x={80} y={110} fontFamily={FONTE} fontWeight={700} fontSize={64} fill={COR.tinta}>
          Tília
        </text>
        <text x={80} y={160} fontFamily={FONTE} fontSize={30} fill={COR.texto}>
          anfitriã da Rocco Kids · personagem animada · folha de modelo v1 (protótipo)
        </text>

        {/* figura inteira */}
        <line x1={60} y1={1330} x2={620} y2={1330} stroke={COR.borda} strokeWidth={3} />
        <Tilia id="f-corpo" x={340} y={1330} s={0.78} rosto={so({sorriso: 0.3})} />
        <Rotulo x={340} y={1390}>
          frente · repouso
        </Rotulo>

        {/* expressões */}
        <Rotulo x={1180} y={230} tam={30} cor={COR.tinta}>
          expressões
        </Rotulo>
        {EXPRESSOES.map((x, i) => {
          const cx = 760 + (i % 3) * 300;
          const cy = 360 + Math.floor(i / 3) * 370;
          return (
            <g key={x.nome}>
              <Close cx={cx} cy={cy} e={x.e} id={`f-exp-${i}`} s={0.56} />
              <Rotulo x={cx} y={cy + 180}>
                {x.nome}
              </Rotulo>
            </g>
          );
        })}

        {/* bocas */}
        <Rotulo x={1180} y={1040} tam={30} cor={COR.tinta}>
          10 bocas (visemas)
        </Rotulo>
        {BOCAS.map((v, i) => {
          const cx = 700 + i * 106;
          const cy = 1150;
          return (
            <g key={v}>
              <Close cx={cx} cy={cy} e={so({v, o: 0.85})} id={`f-boca-${i}`} s={0.2} />
              <Rotulo x={cx} y={cy + 92} tam={22}>
                {v}
              </Rotulo>
            </g>
          );
        })}

        {/* poses */}
        <Rotulo x={2000} y={230} tam={30} cor={COR.tinta}>
          poses
        </Rotulo>
        {POSES.map((p, i) => {
          const x = 1790 + (i % 2) * 300;
          const y = 640 + Math.floor(i / 2) * 400;
          return (
            <g key={p.nome}>
              <Tilia id={`f-pose-${i}`} x={x} y={y - 40} s={0.25} rosto={so({})} maoEsq={p.esq} maoDir={p.dir} palmaEsq={p.pe} palmaDir={p.pd} />
              <Rotulo x={x} y={y + 10} tam={22}>
                {p.nome}
              </Rotulo>
            </g>
          );
        })}

        {/* paleta */}
        {paleta.map(([nome, cor], i) => (
          <g key={nome}>
            <rect x={80 + i * 175} y={1420} width={44} height={44} rx={10} fill={cor} stroke={COR.borda} strokeWidth={2} />
            <text x={134 + i * 175} y={1440} fontFamily={FONTE} fontSize={18} fill={COR.tinta}>
              {nome}
            </text>
            <text x={134 + i * 175} y={1462} fontFamily={FONTE} fontSize={16} fill={COR.texto}>
              {cor}
            </text>
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};
