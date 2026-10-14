import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {COR, FONTE, carregarFonte} from '../marca';
import {rampa} from '../turminha/kit/rig';
import {FIM_CARTAO, Insercao, PlanoUGC, blocosDeLegenda, iniciosDeFrase} from './tipos';

carregarFonte();

const FPS = 30;
const q = (s: number) => Math.round(s * FPS);
const pilula = 'rgba(247,244,238,0.92)';

// Gravação (rosto real ou feltro), em trechos, com o corte de zoom de UGC a cada frase
const Aroll: React.FC<{plano: PlanoUGC}> = ({plano}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const inicios = iniciosDeFrase(plano.palavras);
  const n = inicios.filter((s) => s <= t).length;
  const desde = n ? t - inicios[n - 1] : t;
  const escala = (n % 2 === 0 ? 1.0 : 1.08) * (1 + 0.012 * Math.min(1, desde / 4));
  return (
    <AbsoluteFill style={{transform: `scale(${escala})`, transformOrigin: '50% 38%'}}>
      {plano.arolls.map((a, i) => (
        <Sequence key={`${a.src}-${i}`} from={q(a.de)} durationInFrames={Math.max(1, q(a.ate) - q(a.de))}>
          <OffthreadVideo src={staticFile(a.src)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const InsercaoCamada: React.FC<{ins: Insercao}> = ({ins}) => {
  const f = useCurrentFrame(); // relativo ao início da inserção
  const {fps} = useVideoConfig();
  const dur = q(ins.ate - ins.de);
  const op = rampa(f, 0, 5) * (1 - rampa(f, dur - 5, 5));
  const entrada = spring({frame: f, fps, config: {damping: 200}});
  const ken = 1 + 0.08 * (f / Math.max(1, dur));
  if (ins.tipo === 'cartao') {
    return (
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-start', paddingTop: 430, opacity: op}}>
        <div
          style={{
            transform: `translateY(${(1 - entrada) * 40}px)`,
            maxWidth: 860,
            padding: '28px 44px',
            background: COR.cremeClaro,
            border: `1.5px solid ${COR.borda}`,
            borderRadius: 32,
            fontFamily: FONTE,
            fontWeight: 500,
            fontSize: 54,
            lineHeight: 1.2,
            color: COR.tinta,
            textAlign: 'center',
            textWrap: 'balance',
            whiteSpace: 'pre-line',
            boxShadow: '0 12px 40px rgba(48,46,41,0.12)',
          }}
        >
          {ins.texto}
        </div>
      </AbsoluteFill>
    );
  }
  // foto fora do 9:16: fundo com a mesma foto desfocada e a foto inteira por cima (nada cortado do produto)
  const midia =
    ins.tipo === 'video' ? (
      <OffthreadVideo src={staticFile(ins.src!)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    ) : ins.modo === 'janela' ? (
      <Img src={staticFile(ins.src!)} style={{width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${ken})`}} />
    ) : (
      <>
        <Img src={staticFile(ins.src!)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px)', opacity: 0.55, transform: 'scale(1.15)'}} />
        <Img src={staticFile(ins.src!)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${ken})`}} />
      </>
    );
  if (ins.modo === 'janela') {
    return (
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 330, opacity: op}}>
        <div
          style={{
            width: 800,
            height: 680,
            borderRadius: 40,
            overflow: 'hidden',
            background: COR.creme,
            border: `2px solid ${COR.borda}`,
            boxShadow: '0 18px 50px rgba(48,46,41,0.18)',
            transform: `translateY(${(1 - entrada) * 60}px) scale(${0.96 + 0.04 * entrada})`,
          }}
        >
          {midia}
        </div>
        {ins.texto && (
          <div style={{marginTop: 18, padding: '8px 22px', borderRadius: 22, background: pilula, fontFamily: FONTE, fontWeight: 500, fontSize: 34, color: COR.tinta}}>{ins.texto}</div>
        )}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{background: COR.creme, opacity: op, overflow: 'hidden'}}>
      {midia}
      {ins.texto && (
        <div style={{position: 'absolute', top: 300, width: '100%', display: 'flex', justifyContent: 'center'}}>
          <div style={{padding: '10px 26px', borderRadius: 24, background: pilula, fontFamily: FONTE, fontWeight: 500, fontSize: 40, color: COR.tinta}}>{ins.texto}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// Legenda em frases curtas, palavra falada em terracota
const Legendas: React.FC<{plano: PlanoUGC}> = ({plano}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const blocos = blocosDeLegenda(plano.palavras);
  const b = blocos.find((x) => t >= x.inicio && t < x.fim);
  if (!b) return null;
  return (
    <div style={{position: 'absolute', top: 1088, width: '100%', display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          maxWidth: 900,
          padding: '12px 30px',
          borderRadius: 30,
          background: pilula,
          border: `1.5px solid ${COR.borda}`,
          fontFamily: FONTE,
          fontWeight: 700,
          fontSize: 54,
          lineHeight: 1.15,
          textAlign: 'center',
          textWrap: 'balance',
        }}
      >
        {b.palavras.map((p, i) => (
          <span key={i} style={{color: t >= p.start ? (t < p.end + 0.05 ? COR.terracota : COR.tinta) : COR.texto}}>
            {p.text}
            {i < b.palavras.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

const CartaoFinal: React.FC<{plano: PlanoUGC}> = ({plano}) => {
  const f = useCurrentFrame();
  const op = rampa(f, 0, 8);
  return (
    <AbsoluteFill style={{background: COR.creme, opacity: op, fontFamily: FONTE, textAlign: 'center'}}>
      <div style={{position: 'absolute', top: 640, width: '100%', fontWeight: 700, fontSize: 80, letterSpacing: -1.5, color: COR.tinta}}>Rocco Kids</div>
      {plano.cta && (
        <>
          <div style={{position: 'absolute', top: 780, width: '100%', fontWeight: 500, fontSize: 50, color: COR.tinta}}>{plano.cta.texto}</div>
          <div style={{position: 'absolute', top: 850, width: '100%', fontSize: 34, color: COR.terracota}}>{plano.cta.site}</div>
        </>
      )}
      {plano.aviso && <div style={{position: 'absolute', top: 1180, width: '100%', fontSize: 26, color: COR.texto}}>{plano.aviso}</div>}
    </AbsoluteFill>
  );
};

export const RoccoUGC: React.FC<{plano: PlanoUGC}> = ({plano}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const assinaturaOp = rampa(f, 6, 8) * (1 - rampa(f, q(4), 8));
  return (
    <AbsoluteFill style={{background: COR.creme}}>
      <Aroll plano={plano} />
      {plano.insercoes.map((ins, i) => (
        <Sequence key={i} from={q(ins.de)} durationInFrames={Math.max(1, q(ins.ate) - q(ins.de))}>
          <InsercaoCamada ins={ins} />
        </Sequence>
      ))}
      {plano.titulo && t < plano.titulo.ate && (
        <div style={{position: 'absolute', top: 300, width: '100%', display: 'flex', justifyContent: 'center', opacity: 1 - rampa(f, q(plano.titulo.ate) - 6, 6)}}>
          <div style={{maxWidth: 900, padding: '14px 34px', borderRadius: 30, background: pilula, fontFamily: FONTE, fontWeight: 700, fontSize: 62, lineHeight: 1.12, color: COR.tinta, textAlign: 'center', textWrap: 'balance'}}>
            {plano.titulo.texto}
          </div>
        </div>
      )}
      {plano.assinatura && (
        <div style={{position: 'absolute', top: 1000, left: 48, opacity: assinaturaOp}}>
          <div style={{padding: '8px 20px', borderRadius: 20, background: pilula, fontFamily: FONTE, fontSize: 30, color: COR.tinta}}>
            <b style={{fontWeight: 700}}>{plano.assinatura}</b>
            {plano.aviso && <div style={{fontSize: 22, color: COR.texto}}>{plano.aviso}</div>}
          </div>
        </div>
      )}
      <Legendas plano={plano} />
      {plano.aviso && (
        <div style={{position: 'absolute', top: 286, right: 40, padding: '4px 14px', borderRadius: 14, background: 'rgba(48,46,41,0.55)', color: COR.creme, fontFamily: FONTE, fontSize: 22}}>
          animação com IA
        </div>
      )}
      <Sequence from={q(plano.duracao)} durationInFrames={q(FIM_CARTAO)}>
        <CartaoFinal plano={plano} />
      </Sequence>
      {plano.prototipo && (
        <div style={{position: 'absolute', top: 70, left: 40, padding: '8px 18px', borderRadius: 18, background: 'rgba(48,46,41,0.78)', color: COR.creme, fontFamily: FONTE, fontSize: 24}}>
          PROTÓTIPO · gravação de exemplo
        </div>
      )}
      <Audio src={staticFile(plano.audio)} />
    </AbsoluteFill>
  );
};

export const duracaoUGC = (plano: PlanoUGC) => q(plano.duracao + FIM_CARTAO);
