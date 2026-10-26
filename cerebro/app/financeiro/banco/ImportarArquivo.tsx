'use client';
import {useActionState} from 'react';

type Estado = {erro?: string; ok?: string} | null;

/** Envia um arquivo para uma ação do servidor e mostra o resultado. */
export default function ImportarArquivo({acao, accept, rotulo, botao}: {acao: (anterior: Estado, fd: FormData) => Promise<Estado>; accept: string; rotulo: string; botao: string}) {
  const [estado, enviar, enviando] = useActionState(acao, null);
  return (
    <form action={enviar}>
      <div className="acoes">
        <input name="arquivo" type="file" accept={accept} aria-label={rotulo} style={{maxWidth: 360}} />
        <button type="submit" disabled={enviando}>{enviando ? 'Lendo…' : botao}</button>
      </div>
      {estado?.erro && <p className="erro">{estado.erro}</p>}
      {estado?.ok && <p className="ok">{estado.ok}</p>}
    </form>
  );
}
