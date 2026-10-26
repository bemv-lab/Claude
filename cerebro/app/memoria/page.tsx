import Casca from '@/components/Casca';
import {lerMemoria} from '@/lib/dados';
import {apagarMemoria, novaMemoria} from '@/app/acoes';

export const dynamic = 'force-dynamic';

const AREAS = ['financeiro', 'campanhas', 'criativos', 'produto', 'operação', 'contabilidade', 'regra fixa', 'geral'];

export default async function Memoria({searchParams}: {searchParams: Promise<{q?: string}>}) {
  const q = ((await searchParams).q ?? '').trim();
  const itens = lerMemoria(q, 300);
  return (
    <Casca>
      <div className="topo"><div><div className="olho">Inteligência</div><h1>A memória que <b>os chats soltos não têm</b></h1></div></div>
      <div className="cartao">
        <h2>Registrar decisão ou aprendizado</h2>
        <form action={novaMemoria}>
          <div className="campos">
            <label htmlFor="area">Área<select id="area" name="area" defaultValue="geral">{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
          </div>
          <label htmlFor="texto">O que foi decidido e por quê<textarea id="texto" name="texto" required placeholder="Ex.: pausamos o estático de preço: R$ 70 sem venda, CTR 0,6%. Hipótese: preço na primeira tela afasta." /></label>
          <div className="acoes"><button type="submit">Guardar</button></div>
        </form>
        <p className="nota">Qualquer conversa com o Claude conectada ao Cérebro lê e grava aqui (conector rocco-cerebro).</p>
      </div>
      <div className="cartao">
        <form action="/memoria"><div className="acoes"><input name="q" defaultValue={q} placeholder="Buscar na memória" aria-label="Buscar na memória" style={{flex: 1}} /><button className="leve" type="submit">Buscar</button></div></form>
        {itens.length === 0 ? <p className="vazio">Nada encontrado.</p> : (
          <div className="mem">
            {itens.map((m) => (
              <article key={m.id}>
                <time>{m.criado_em.slice(0, 10).split('-').reverse().join('/')}</time>
                <p>{m.texto}<br /><span className="nota">{m.autor}</span></p>
                <span className="lado"><span className="tag">{m.area}</span>
                  <form action={apagarMemoria}><input type="hidden" name="id" value={m.id} /><button className="mini" type="submit" aria-label="Apagar registro">×</button></form></span>
              </article>
            ))}
          </div>
        )}
      </div>
    </Casca>
  );
}
