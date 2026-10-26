import Entrar from './Entrar';
import {db} from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function Login() {
  const semUsuario = (db().prepare('SELECT count(*) n FROM usuarios').get() as {n: number}).n === 0;
  return (
    <div className="entrada">
      <div className="cartao">
        <div className="marca" style={{padding: 0}}><i /><div>Cérebro Rocco<small>Rocco Kids</small></div></div>
        {semUsuario ? (
          <p className="nota">Nenhum usuário ainda. No servidor, rode <code>npm run usuario -- email@exemplo.com Nome senha-forte</code> e volte aqui.</p>
        ) : <Entrar />}
      </div>
    </div>
  );
}
