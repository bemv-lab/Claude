// Cookie de sessão assinado com HMAC (Web Crypto: funciona no middleware e no servidor).
export const COOKIE = 'cerebro_sessao';
const DIAS = 30;

function segredo() {
  const s = process.env.CEREBRO_SEGREDO;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('Defina CEREBRO_SEGREDO (16+ caracteres) para rodar em produção.');
  return 'segredo-de-desenvolvimento-local';
}

async function chave() {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(segredo()), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

async function assinar(dados: string) {
  return hex(await crypto.subtle.sign('HMAC', await chave(), new TextEncoder().encode(dados)));
}

export async function criarToken(email: string) {
  const exp = Date.now() + DIAS * 864e5;
  const dados = `${encodeURIComponent(email)}.${exp}`;
  return {token: `${dados}.${await assinar(dados)}`, maxAge: DIAS * 86400};
}

export async function lerToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const dados = token.slice(0, i), ass = token.slice(i + 1);
  const esperado = await assinar(dados);
  if (ass.length !== esperado.length) return null;
  let dif = 0;
  for (let k = 0; k < ass.length; k++) dif |= ass.charCodeAt(k) ^ esperado.charCodeAt(k);
  if (dif) return null;
  const j = dados.lastIndexOf('.');
  const email = dados.slice(0, j), exp = dados.slice(j + 1);
  if (!(Number(exp) > Date.now())) return null;
  return decodeURIComponent(email);
}
