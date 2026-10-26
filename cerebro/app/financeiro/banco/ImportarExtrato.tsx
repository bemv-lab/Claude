'use client';
import {useActionState} from 'react';
import {importarExtrato} from '@/app/acoes';

export default function ImportarExtrato() {
  const [estado, acao, enviando] = useActionState(importarExtrato, null);
  return (
    <form action={acao}>
      <div className="acoes">
        <input name="arquivo" type="file" accept=".ofx,.OFX" aria-label="Arquivo OFX do extrato" style={{maxWidth: 360}} />
        <button type="submit" disabled={enviando}>{enviando ? 'Lendo…' : 'Importar extrato'}</button>
      </div>
      {estado?.erro && <p className="erro">{estado.erro}</p>}
      {estado?.ok && <p className="ok">{estado.ok}</p>}
    </form>
  );
}
