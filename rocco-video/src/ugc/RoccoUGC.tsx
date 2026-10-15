import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {COR, FONTE, carregarFonte} from '../marca';
import {rampa} from '../turminha/kit/rig';
import {Insercao, PlanoUGC, REELS, ZOOM, blocosDeLegenda, iniciosDeFrase, posicaoLegenda} from './tipos';

carregarFonte();

const FPS = 30;
const q = (s: number) => Math.round(s * FPS);
const pilula = 'rgba(247,244,238,0.92)';

// Quadros em que o zoom troca: todo corte seco (o zoom esconde o salto) e os inícios de frase que não ficam
// a menos de 0,6 s de outra troca (três saltos seguidos parecem tranco). Em quadros, não em segundos: o corte
// cai num quadro exato e a troca de zoom tem de cair nele.
const trocasDeZoom = (plano: PlanoUGC) => {
  const trocas = (plano.cortes ?? []).map(q);
  for (const s of iniciosDeFrase(plano.palavras).map(q).sort((a, b) => a - b)) {
    if (trocas.every((c) => Math.abs(s - c) >= 0.6 * FPS)) trocas.push(s);
  }
  return Array.from(new Set(trocas)).sort((a, b) => a - b);
};

// Gravação (rosto real ou feltro), em trechos, com o corte de zoom de UGC a cada frase e a cada corte de pausa.
// Quando a legenda abaixo do pescoço invadiria a faixa de baixo do Reels, a gravação sobe: escala a partir da
// borda de baixo (sem faixa vazia) até o pescoço ficar `subir` px mais alto.
const Aroll: React.FC<{plano: PlanoUGC}> = ({plano}) => {
  const {subir, pescocoZoom} = posicaoLegenda(plano);
  const sobe = subir > 0 ? (1920 - pescocoZoom + subir) / (1920 - pescocoZoom) : 1;
  const f = useCurrentFrame();
  const inicios = trocasDeZoom(plano);
  const n = inicios.filter((s) => s <= f).length;
  const desde = (n ? f - inicios[n - 1] : f) / FPS;
  const escala = (n % 2 === 0 ? 1.0 : 1.08) * (1 + 0.012 * Math.min(1, desde / 4));
  return (
    <AbsoluteFill style={{transform: `scale(${sobe})`, transformOrigin: '50% 100%'}}>
      <AbsoluteFill style={{transform: `scale(${escala})`, transformOrigin: `50% ${ZOOM.origem}px`}}>
        {plano.arolls.map((a, i) => (
          <Sequence key={`${a.src}-${i}`} from={q(a.de)} durationInFrames={Math.max(1, q(a.ate) - q(a.de))}>
            <OffthreadVideo src={staticFile(a.src)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const InsercaoCamada: React.FC<{ins: Insercao; entra?: boolean; sai?: boolean}> = ({ins, entra = true, sai = true}) => {
  const f = useCurrentFrame(); // relativo ao início da inserção
  const {fps} = useVideoConfig();
  const dur = q(ins.ate - ins.de);
  const op = (entra ? rampa(f, 0, 5) : 1) * (sai ? 1 - rampa(f, dur - 5, 5) : 1);
  const entrada = spring({frame: f, fps, config: {damping: 200}});
  const ken = 1 + 0.08 * (f / Math.max(1, dur));
  if (ins.tipo === 'cartao') {
    return (
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-start', paddingTop: 320, opacity: op}}>
        <div
          style={{
            transform: `translateY(${(1 - entrada) * 40}px)`,
            maxWidth: 900,
            padding: '20px 40px',
            background: COR.cremeClaro,
            border: `1.5px solid ${COR.borda}`,
            borderRadius: 32,
            fontFamily: FONTE,
            fontWeight: 500,
            fontSize: 50,
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
  // foto do produto inteira sobre o creme da marca (nada cortado do produto). PNG = recorte sem fundo, com sombra suave.
  const recorte = ins.tipo === 'imagem' && ins.src!.toLowerCase().endsWith('.png');
  const midia =
    ins.tipo === 'video' ? (
      <OffthreadVideo src={staticFile(ins.src!)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    ) : ins.modo === 'janela' ? (
      <Img src={staticFile(ins.src!)} style={{width: '100%', height: '100%', objectFit: 'contain', padding: recorte ? 36 : 0, transform: `scale(${ken})`}} />
    ) : (
      <div style={{position: 'absolute', left: 60, top: 320, width: 960, height: 620, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <Img
          src={staticFile(ins.src!)}
          style={{
            maxWidth: 960,
            maxHeight: 620,
            borderRadius: recorte ? 0 : 32,
            boxShadow: recorte ? undefined : '0 18px 50px rgba(48,46,41,0.16)',
            filter: recorte ? 'drop-shadow(0 26px 34px rgba(48,46,41,0.22))' : undefined,
            transform: `translateY(${(1 - entrada) * 50}px) scale(${(0.94 + 0.06 * entrada) * ken})`,
          }}
        />
      </div>
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
        <div style={{position: 'absolute', top: 975, width: '100%', display: 'flex', justifyContent: 'center'}}>
          <div style={{padding: '10px 26px', borderRadius: 24, background: pilula, fontFamily: FONTE, fontWeight: 500, fontSize: 40, color: COR.tinta}}>{ins.texto}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// Legenda dinâmica logo abaixo do pescoço, fora da coluna de ícones e da faixa de baixo do Reels:
// 1 ou 2 palavras por vez, entrando com um "pop"; palavra falada em terracota
const Legendas: React.FC<{plano: PlanoUGC}> = ({plano}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = f / FPS;
  const blocos = blocosDeLegenda(plano.palavras);
  const b = blocos.find((x) => t >= x.inicio && t < x.fim);
  if (!b) return null;
  const desde = f - Math.round(b.inicio * FPS);
  const pop = spring({frame: desde, fps, config: {damping: 13, stiffness: 240, mass: 0.6}});
  return (
    <div style={{position: 'absolute', top: posicaoLegenda(plano).topo, width: '100%', display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          transform: `translateY(${(1 - pop) * 16}px) scale(${0.8 + 0.2 * pop})`,
          opacity: Math.min(1, 0.35 + desde / 3),
          maxWidth: 2 * (REELS.direita - 540), // centrada, sem chegar na coluna de ícones da direita
          padding: '12px 34px',
          borderRadius: 34,
          background: pilula,
          border: `1.5px solid ${COR.borda}`,
          boxShadow: '0 8px 24px rgba(48,46,41,0.10)',
          fontFamily: FONTE,
          fontWeight: 700,
          fontSize: 65,
          lineHeight: 1.1,
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

export const RoccoUGC: React.FC<{plano: PlanoUGC}> = ({plano}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const assinaturaDe = plano.titulo ? q(plano.titulo.ate) : 6;
  const assinaturaOp = rampa(f, assinaturaDe, 8) * (1 - rampa(f, assinaturaDe + q(3.5), 8));
  // fotos em tela cheia coladas (uma termina quando a outra começa): sem fade entre elas
  const cheia = (i: number) => {
    const x = plano.insercoes[i];
    return x !== undefined && x.tipo !== 'cartao' && x.modo !== 'janela';
  };
  const colada = (i: number, j: number) => cheia(i) && cheia(j) && Math.abs(q(plano.insercoes[j].de) - q(plano.insercoes[i].ate)) <= 1;
  return (
    <AbsoluteFill style={{background: COR.creme}}>
      <Aroll plano={plano} />
      {plano.insercoes.map((ins, i) => (
        <Sequence key={i} from={q(ins.de)} durationInFrames={Math.max(1, q(ins.ate) - q(ins.de))}>
          <InsercaoCamada ins={ins} entra={!colada(i - 1, i)} sai={!colada(i, i + 1)} />
        </Sequence>
      ))}
      {plano.titulo && t < plano.titulo.ate && (
        <div style={{position: 'absolute', top: 320, width: '100%', display: 'flex', justifyContent: 'center', opacity: 1 - rampa(f, q(plano.titulo.ate) - 6, 6)}}>
          <div style={{maxWidth: 900, padding: '14px 34px', borderRadius: 30, background: pilula, fontFamily: FONTE, fontWeight: 700, fontSize: 62, lineHeight: 1.12, color: COR.tinta, textAlign: 'center', textWrap: 'balance'}}>
            {plano.titulo.texto}
          </div>
        </div>
      )}
      {plano.assinatura && (
        // no alto, logo abaixo da faixa do Reels, depois do título: nunca sobre o rosto ou a boca (real ou feltro)
        <div style={{position: 'absolute', top: REELS.topo, left: 48, opacity: assinaturaOp}}>
          <div style={{padding: '8px 20px', borderRadius: 20, background: pilula, fontFamily: FONTE, fontSize: 30, color: COR.tinta}}>
            <b style={{fontWeight: 700}}>{plano.assinatura}</b>
            {plano.aviso && <div style={{fontSize: 22, color: COR.texto}}>{plano.aviso}</div>}
          </div>
        </div>
      )}
      <Legendas plano={plano} />
      {plano.aviso && (
        <div style={{position: 'absolute', top: REELS.topo, right: 40, padding: '4px 14px', borderRadius: 14, background: 'rgba(48,46,41,0.55)', color: COR.creme, fontFamily: FONTE, fontSize: 22}}>
          animação com IA
        </div>
      )}
      {plano.prototipo && (
        <div style={{position: 'absolute', top: 70, left: 40, padding: '8px 18px', borderRadius: 18, background: 'rgba(48,46,41,0.78)', color: COR.creme, fontFamily: FONTE, fontSize: 24}}>
          PROTÓTIPO · gravação de exemplo
        </div>
      )}
      <Audio src={staticFile(plano.audio)} />
    </AbsoluteFill>
  );
};

// Sem cartão final: o vídeo termina na apresentadora, falando a última frase
export const duracaoUGC = (plano: PlanoUGC) => q(plano.duracao);
