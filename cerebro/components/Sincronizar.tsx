'use client';
import {useActionState} from 'react';
import {sincronizar} from '@/app/acoes';

export default function Sincronizar() {
  const [estado, acao, rodando] = useActionState(sincronizar, null);
  return (
    <form action={acao} className="sinc">
      <button type="submit" className="leve" disabled={rodando}>{rodando ? 'Sincronizando…' : 'Sincronizar'}</button>
      {estado?.msgs && <span className="nota">{estado.msgs.join(' · ')}</span>}
    </form>
  );
}
