import React from 'react';
import {Pt, ik} from './rig';

// Braço fino de 2 segmentos com mão oval e polegar curto (sem dedos de desenho, sem luva branca).
export const Braco: React.FC<{
  ombro: Pt;
  alvo: Pt;
  polo: Pt;
  cor: string;
  seg1?: number;
  seg2?: number;
  espessura?: number;
  palmaAberta?: number; // 0..1: polegar se abre (gesto de apresentar)
}> = ({ombro, alvo, polo, cor, seg1 = 125, seg2 = 115, espessura = 13, palmaAberta = 0}) => {
  const {cotovelo, punho, angAntebraco} = ik(ombro, alvo, seg1, seg2, polo);
  const graus = (angAntebraco * 180) / Math.PI;
  // polegar sempre do lado de cima da mão; abre ~35° quando a palma apresenta algo
  const anguloPolegar = Math.cos(angAntebraco) >= 0 ? 55 - 35 * palmaAberta : 125 + 35 * palmaAberta;
  return (
    <g>
      <path
        d={`M ${ombro.x} ${ombro.y} L ${cotovelo.x} ${cotovelo.y} L ${punho.x} ${punho.y}`}
        stroke={cor}
        strokeWidth={espessura}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform={`translate(${punho.x} ${punho.y}) rotate(${graus})`}>
        <ellipse cx={13} cy={0} rx={17} ry={13} fill={cor} />
        <g transform={`translate(8 0) rotate(${anguloPolegar})`}>
          <rect x={-5} y={-14} width={10} height={16} rx={5} fill={cor} />
        </g>
      </g>
    </g>
  );
};
