// Cronometragem a partir da voz: as cenas começam quando a primeira palavra delas é dita.
// Funciona igual com a voz de teste (eSpeak) e com a do ElevenLabs (alinhamento por caractere).
import {dimBoca, lerp, RostoEstado, Visema} from '../turminha/kit/rig';
import {CENAS} from './roteiro';

export type Fala = {
  fps: number;
  source: string;
  audioSeconds: number;
  frames: {v: Visema; o: number}[];
  words: {text: string; start: number; end: number}[];
};

export const ATRASO_AUDIO = 6; // frames de imagem antes da primeira palavra
const ANTECIPA_CORTE = 3; // a cena corta um pouco antes da palavra
const CAUDA = 36; // segundos finais parados no cartão

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export type Linha = {
  cenas: {id: string; inicio: number; fim: number}[];
  palavras: {norm: string; inicio: number; fim: number}[]; // uma por palavra do roteiro, em frames globais
  duracao: number;
};

export const montarLinha = (fala: Fala): Linha => {
  const roteiro = CENAS.flatMap((c, ci) => c.fala.split(/\s+/).map((p) => ({cena: ci, norm: norm(p)})));
  const ditas = fala.words.map((w) => ({...w, norm: norm(w.text)}));
  // alinhamento guloso: procura a mesma palavra logo adiante; se não achar, segue a ordem
  const palavras: Linha['palavras'] = [];
  let j = 0;
  for (const r of roteiro) {
    let achou = -1;
    for (let k = j; k < Math.min(ditas.length, j + 4); k++) {
      if (ditas[k].norm === r.norm) {
        achou = k;
        break;
      }
    }
    const idx = achou >= 0 ? achou : Math.min(j, ditas.length - 1);
    const d = ditas[idx];
    palavras.push({norm: r.norm, inicio: d.start + ATRASO_AUDIO, fim: d.end + ATRASO_AUDIO});
    j = idx + 1;
  }
  const fimAudio = Math.round(fala.audioSeconds * fala.fps) + ATRASO_AUDIO;
  const duracao = fimAudio + CAUDA;
  let w = 0;
  const inicios = CENAS.map((c, ci) => {
    const primeiro = w;
    w += c.fala.split(/\s+/).length;
    return ci === 0 ? 0 : Math.max(0, palavras[primeiro].inicio - ANTECIPA_CORTE);
  });
  const cenas = CENAS.map((c, ci) => ({id: c.id, inicio: inicios[ci], fim: ci + 1 < CENAS.length ? inicios[ci + 1] : duracao}));
  return {cenas, palavras, duracao};
};

// Frame global em que uma palavra (n-ésima ocorrência a partir de um frame) é dita
export const quadroDa = (linha: Linha, palavra: string, aPartirDe = 0, ocorrencia = 0) => {
  const alvo = norm(palavra);
  let n = 0;
  for (const p of linha.palavras) {
    if (p.inicio >= aPartirDe && p.norm === alvo) {
      if (n === ocorrencia) return p.inicio;
      n++;
    }
  }
  return aPartirDe;
};

// Boca no frame global, com suavização leve entre visemas (média com o frame anterior)
export const bocaNoQuadro = (fala: Fala, f: number) => {
  const pega = (q: number) => {
    const i = q - ATRASO_AUDIO;
    return i >= 0 && i < fala.frames.length ? fala.frames[i] : {v: 'X' as Visema, o: 0};
  };
  const atual = pega(f);
  const ant = pega(f - 1);
  const a = dimBoca(atual.v, atual.o);
  const b = dimBoca(ant.v, ant.o);
  return {v: atual.v, o: atual.o, wh: {w: lerp(b.w, a.w, 0.65), h: lerp(b.h, a.h, 0.65)}};
};

export const comBoca = (rosto: RostoEstado, boca: ReturnType<typeof bocaNoQuadro>): RostoEstado => ({...rosto, v: boca.v, o: boca.o});
