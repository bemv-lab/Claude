'use client';
import {useActionState} from 'react';
import {entrar} from '@/app/acoes';

export default function Entrar() {
  const [estado, acao, enviando] = useActionState(entrar, null);
  return (
    <form action={acao}>
      <label htmlFor="email">E-mail<input id="email" name="email" type="email" autoComplete="username" defaultValue={estado?.email} key={estado?.email} required /></label>
      <label htmlFor="senha">Senha<input id="senha" name="senha" type="password" autoComplete="current-password" required /></label>
      {estado?.erro && <p className="erro">{estado.erro}</p>}
      <button type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
