// Kit compartilhado da turminha: tipos, curvas de movimento, bocas, piscadas e braços (IK de 2 ossos).
import {random} from 'remotion';

export type Pt = {x: number; y: number};
export type Visema = 'X' | 'MBP' | 'FV' | 'S' | 'L' | 'U' | 'I' | 'E' | 'O' | 'A';

export type RostoEstado = {
  v: Visema;
  o: number; // abertura 0..1 (vem do build_lipsync.py)
  piscar: number; // 0 = olho em repouso, 1 = fechado
  sobrancelha: {esq: number; dir: number; interna: number}; // px para cima
  olhar: Pt; // -1..1
  sorriso: number; // 0..1, sorriso de canto na boca em repouso
};

export const ROSTO_NEUTRO: RostoEstado = {
  v: 'X',
  o: 0,
  piscar: 0,
  sobrancelha: {esq: 0, dir: 0, interna: 0},
  olhar: {x: 0, y: 0},
  sorriso: 0,
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

// Rampa suave de 0 a 1 entre dois frames (ease in-out)
export const rampa = (f: number, inicio: number, dur: number) => easeInOut((f - inicio) / Math.max(1, dur));

// Largura e altura da boca por visema (unidades do viewBox de 1000 da personagem)
const LARGURA: Record<Visema, number> = {X: 64, MBP: 54, FV: 56, S: 46, L: 40, I: 58, E: 50, U: 18, O: 26, A: 42};
export const dimBoca = (v: Visema, o: number) => ({w: LARGURA[v], h: v === 'X' || v === 'MBP' ? 0 : Math.max(4, 26 * o)});

// Piscadas determinísticas: intervalo de 3 a 5 s, desce em 4 frames, segura 1, sobe em 5; 1 em 8 é dupla
export const piscadaNoQuadro = (f: number, semente: string, fps = 30) => {
  let s = Math.round(1.2 * fps);
  let i = 0;
  while (s <= f + 12) {
    const inicios = random(`${semente}-dupla-${i}`) < 0.125 ? [s, s + 12] : [s];
    for (const b of inicios) {
      const d = f - b;
      if (d >= 0 && d < 4) return (d + 1) / 4;
      if (d >= 4 && d < 5) return 1;
      if (d >= 5 && d < 10) return 1 - (d - 4) / 5;
    }
    s += Math.round((3 + 2 * random(`${semente}-int-${i}`)) * fps);
    i++;
  }
  return 0;
};

// Braço de 2 segmentos: ombro -> cotovelo -> punho, alcançando o alvo.
// Das duas soluções, fica a de cotovelo mais perto do "polo" (ex.: abaixo e para fora), sem saltos.
export const ik = (ombro: Pt, alvo: Pt, a: number, b: number, polo: Pt) => {
  const dx = alvo.x - ombro.x;
  const dy = alvo.y - ombro.y;
  const d = Math.max(Math.abs(a - b) + 1, Math.min(a + b - 0.5, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const alfa = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const candidatos = [base + alfa, base - alfa].map((ang) => ({x: ombro.x + a * Math.cos(ang), y: ombro.y + a * Math.sin(ang)}));
  const dist = (p: Pt) => Math.hypot(p.x - polo.x, p.y - polo.y);
  const cotovelo = dist(candidatos[0]) <= dist(candidatos[1]) ? candidatos[0] : candidatos[1];
  const ang2 = Math.atan2(alvo.y - cotovelo.y, alvo.x - cotovelo.x);
  const punho = {x: cotovelo.x + b * Math.cos(ang2), y: cotovelo.y + b * Math.sin(ang2)};
  return {cotovelo, punho, angAntebraco: ang2};
};

export const misturaPt = (p: Pt, q: Pt, t: number): Pt => ({x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t)});

// Direção do olhar (-1..1) de um ponto do rosto para um alvo no palco
export const olharPara = (de: Pt, para: Pt, alcance = 420): Pt => {
  const dx = (para.x - de.x) / alcance;
  const dy = (para.y - de.y) / alcance;
  const m = Math.hypot(dx, dy);
  const k = m > 1 ? 1 / m : 1;
  return {x: dx * k, y: dy * k};
};
