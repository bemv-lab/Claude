import {usuarioAtual} from '@/lib/usuario';
import {sair} from '@/app/acoes';
import Trilho from './Trilho';

// Moldura das telas internas: trilho de navegação + palco.
export default async function Casca({children}: {children: React.ReactNode}) {
  const u = await usuarioAtual();
  return (
    <div className="app">
      <Trilho>
        <div className="rodape">
          <span>{u?.nome ?? ''}</span>
          <form action={sair}><button className="mini" type="submit">Sair</button></form>
        </div>
      </Trilho>
      <main><div className="palco">{children}</div></main>
    </div>
  );
}
