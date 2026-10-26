import Link from 'next/link';
import Casca from '@/components/Casca';
import {lerConfig, lerFormas, lerProdutos} from '@/lib/dados';
import {novoProduto} from '@/app/acoes';
import Calculadora from './Calculadora';

export const dynamic = 'force-dynamic';

export default async function Precificacao({searchParams}: {searchParams: Promise<{p?: string}>}) {
  const {p} = await searchParams;
  const produtos = lerProdutos();
  const atual = produtos.find((x) => x.id === Number(p)) ?? produtos[0];
  const cfg = lerConfig();
  return (
    <Casca>
      <div className="topo">
        <div><div className="olho">Dinheiro</div><h1>Precificação <b>sem esquecer nada</b></h1></div>
        {cfg.taxas_exemplo ? <Link href="/taxas" className="selo">taxas de pagamento de exemplo · trocar</Link> : null}
      </div>
      <div className="acoes">
        <div className="abas">
          {produtos.map((x) => <Link key={x.id} href={`/precificacao?p=${x.id}`} aria-current={x.id === atual?.id ? 'page' : undefined}>{x.nome}</Link>)}
        </div>
        <form action={novoProduto}><button className="mini" type="submit">+ produto</button></form>
      </div>
      {atual ? <Calculadora key={atual.id} produto={atual} cfg={cfg} formas={lerFormas()} /> : <p className="vazio">Nenhum produto. Crie o primeiro.</p>}
    </Casca>
  );
}
