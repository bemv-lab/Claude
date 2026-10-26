import {cookies} from 'next/headers';
import {COOKIE, lerToken} from './sessao';
import {db} from './db';

export async function usuarioAtual() {
  const email = await lerToken((await cookies()).get(COOKIE)?.value);
  if (!email) return null;
  return db().prepare('SELECT id, email, nome FROM usuarios WHERE email = ?').get(email) as {id: number; email: string; nome: string} | undefined ?? null;
}
