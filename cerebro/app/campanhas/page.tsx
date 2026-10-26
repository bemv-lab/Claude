import Casca from '@/components/Casca';
import {ultimaImportacao} from '@/lib/dados';
import {fmtBRL, fmtNum, type Etapa} from '@/lib/calc';
import Importar from './Importar';

export const dynamic = 'force-dynamic';

const COLUNAS: [Etapa, string, string][] = [['teste', 'Teste', 'w'], ['validacao', 'Validação', 'w'], ['escala', 'Escala', 'g'], ['pausar', 'Pausar', 'b']];

export default function Campanhas() {
  const u = ultimaImportacao();
  const ref = u?.ref;
  return (
    <Casca>
      <div className="topo"><div><div className="olho">Crescimento · Meta Ads</div><h1>Sua <b>esteira de testes</b></h1></div></div>
      <div className="regras">
        <div><b>Teste</b>Até 1× o CPA máximo{ref ? ` (${fmtBRL(ref.cpaMax)})` : ''} sem venda. Passou disso sem vender: pausar.</div>
        <div><b>Validação</b>3 vendas com CPA no alvo{ref ? ` (${fmtBRL(ref.cpaAlvo)})` : ''} e ROAS acima de {ref ? fmtNum(ref.roasBE) : 'break-even'}.</div>
        <div><b>Escala</b>+20% de orçamento a cada 48 h enquanto o CPA segurar.</div>
      </div>
      <div className="cartao">
        <h2>Importar do Gerenciador</h2>
        <p className="nota">No Gerenciador de Anúncios, aba Anúncios, escolha o período e clique em Exportar → CSV. Colunas usadas: nome do anúncio, valor usado, compras e valor de conversão de compras. A conexão direta com a API da Meta entra na fase 2.</p>
        <Importar />
      </div>
      {!u ? <p className="vazio">Nenhuma importação ainda. As regras acima já usam o CPA máximo calculado na precificação{ref ? ` de ${ref.produto.nome}` : ''}.</p> : (
        <>
          <p className="nota">Última importação: {u.imp.arquivo}{u.imp.periodo ? ` · ${u.imp.periodo}` : ''} · regras de {ref?.produto.nome}. ROAS real = ROAS do Gerenciador ÷ (1 + imposto Meta).</p>
          <div className="esteira">
            {COLUNAS.map(([etapa, nome, cor]) => {
              const ads = u.ads.filter((a) => a.etapa === etapa);
              return (
                <div className="col" key={etapa}>
                  <h3>{nome} <span>{ads.length}</span></h3>
                  {ads.map((a) => (
                    <div className="ad" key={a.id}>
                      <b>{a.anuncio}</b>
                      <div className="met"><span>{fmtBRL(a.gasto)}</span><span>{a.compras} vendas</span>{a.cpa !== null && <span>CPA {fmtBRL(a.cpa)}</span>}{a.roasReal !== null && a.compras > 0 && <span>ROAS real {fmtNum(a.roasReal)}</span>}</div>
                      <span className={`chip ${cor}`}>{a.motivo}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="nota">O Cérebro só sugere. Pausar, ativar ou mudar orçamento na Meta continua sendo decisão sua.</p>
        </>
      )}
    </Casca>
  );
}
