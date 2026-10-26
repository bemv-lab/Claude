import {randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';

export function hashSenha(senha: string) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(senha, sal, 64).toString('hex')}`;
}

export function confereSenha(senha: string, guardado: string) {
  const [sal, h] = guardado.split(':');
  if (!sal || !h) return false;
  const a = Buffer.from(h, 'hex'), b = scryptSync(senha, sal, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
