import React from 'react';
import {Composition, Still} from 'remotion';
import fala from './data/fala-teste.json';
import {FolhaTilia} from './video/FolhaTilia';
import {Fala} from './video/tempo';
import {TiliaPasta, TiliaPastaProps, duracaoDe} from './video/TiliaPasta';

const falaTeste = fala as Fala;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Tilia-Pasta"
      component={TiliaPasta}
      durationInFrames={duracaoDe(falaTeste)}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{fala: falaTeste, audio: 'voz/teste-espeak.wav', prototipo: true} satisfies TiliaPastaProps}
      calculateMetadata={({props}) => ({durationInFrames: duracaoDe(props.fala)})}
    />
    <Still id="Tilia-Folha" component={FolhaTilia} width={2400} height={1500} />
  </>
);
