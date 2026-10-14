import React from 'react';
import {AbsoluteFill} from 'remotion';
import {COR, FONTE, carregarFonte} from '../marca';
import {PastaAberta, PastaFechada} from './PastaIlustrada';

carregarFonte();

// "Foto" provisória do produto para testar inserções (B-roll) enquanto não chegam as fotos reais
export const FotoProvisoria: React.FC<{estado: 'aberta' | 'fechada'}> = ({estado}) => (
  <AbsoluteFill style={{background: COR.creme}}>
    <svg viewBox="0 0 1080 1080" width={1080} height={1080}>
      {estado === 'aberta' ? (
        <g transform="translate(60 250) scale(1.0667)">
          <PastaAberta />
        </g>
      ) : (
        <g transform="translate(300 170) scale(1.07)">
          <PastaFechada />
        </g>
      )}
    </svg>
    <div style={{position: 'absolute', bottom: 40, width: '100%', textAlign: 'center', fontFamily: FONTE, fontSize: 26, color: COR.texto}}>
      ilustração provisória · no anúncio entra a foto real
    </div>
  </AbsoluteFill>
);
