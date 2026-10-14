import React from 'react';
import {Composition, Still} from 'remotion';
import fala from './data/fala-teste.json';
import {FotoProvisoria} from './produto/FotoProvisoria';
import planoExemplo from './ugc/planos/exemplo.json';
import {RoccoUGC, duracaoUGC} from './ugc/RoccoUGC';
import {PlanoUGC} from './ugc/tipos';
import {FolhaTilia} from './video/FolhaTilia';
import {Fala} from './video/tempo';
import {TiliaPasta, TiliaPastaProps, duracaoDe} from './video/TiliaPasta';

const falaTeste = fala as Fala;
const plano = planoExemplo as PlanoUGC;

export const RemotionRoot: React.FC = () => (
  <>
    {/* Vídeo gravado pela apresentadora (rosto real ou feltro) + edição Rocco */}
    <Composition
      id="Rocco-UGC"
      component={RoccoUGC}
      durationInFrames={duracaoUGC(plano)}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{plano}}
      calculateMetadata={({props}) => ({durationInFrames: duracaoUGC(props.plano)})}
    />
    <Composition
      id="Tilia-Pasta"
      component={TiliaPasta}
      durationInFrames={duracaoDe(falaTeste)}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{fala: falaTeste, audio: 'voz/teste-espeak.wav', prototipo: true, limpo: false} satisfies TiliaPastaProps}
      calculateMetadata={({props}) => ({durationInFrames: duracaoDe(props.fala)})}
    />
    <Still id="Tilia-Folha" component={FolhaTilia} width={2400} height={1500} />
    <Still id="Produto-Aberta" component={FotoProvisoria} width={1080} height={1080} defaultProps={{estado: 'aberta' as const}} />
    <Still id="Produto-Fechada" component={FotoProvisoria} width={1080} height={1080} defaultProps={{estado: 'fechada' as const}} />
  </>
);
