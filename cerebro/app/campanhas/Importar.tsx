'use client';
import {useActionState} from 'react';
import {importarMeta} from '@/app/acoes';

export default function Importar() {
  const [estado, acao, enviando] = useActionState(importarMeta, null);
  return (
    <form action={acao}>
      <div className="acoes">
        <input name="arquivo" type="file" accept=".csv,text/csv" aria-label="Arquivo CSV do Gerenciador" style={{maxWidth: 360}} />
        <button type="submit" disabled={enviando}>{enviando ? 'Lendo…' : 'Importar'}</button>
      </div>
      {estado?.erro && <p className="erro">{estado.erro}</p>}
      {estado?.ok && <p className="ok">{estado.ok}</p>}
    </form>
  );
}
