import Casca from '@/components/Casca';
import {CabecalhoFin, Linha} from '@/components/Fin';
import {caixaPrevisto, lerConfig} from '@/lib/dados';
import {fmtBRL} from '@/lib/calc';
import {salvarAncorasCaixa} from '@/app/acoes';

export const dynamic = 'force-dynamic';

const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dia = (d: string) => `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${dm(d)}`;

export default function Caixa() {
  const {x, prev, portoes} = caixaPrevisto();
  const cfg = lerConfig();
  const rec = prev.recomendacao;
  const cob = prev.cob;
  const cor = rec.tipo === 'usar' ? 'g' : rec.tipo === 'sacar' ? 'w' : 'b';

  return (
    <Casca>
      <CabecalhoFin aba="caixa" titulo={<>Caixa dos <b>próximos dias</b></>} sub="O que entra, o que precisa ser pago (fornecedor e Meta) e se dá para usar o saldo da conta ou se é hora de sacar da Cartpanda sem comprometer o dinheiro dos anúncios." />

      <div className={`cartao alerta`}>
        <div className="topo"><h2>Hoje, {dia(x.hoje)}</h2><span className={`chip ${cor}`}>{rec.tipo === 'usar' ? 'usar o saldo' : rec.tipo === 'sacar' ? 'pedir saque' : 'caixa curto'}</span></div>
        <p><b>{rec.titulo}</b></p>
        <p>{rec.detalhe}</p>
        {cob.dia && <p className="nota">Meta: gasto de {fmtBRL(cob.acumulado ?? 0)} desde {x.meta.ultimaCobranca ? dm(x.meta.ultimaCobranca) : 'a última cobrança'} de {fmtBRL(x.meta.limite)} que disparam a cobrança; no ritmo de {fmtBRL(x.meta.gastoDiario)} por dia, ela vem em {cob.dias === 0 ? 'qualquer momento' : `${cob.dias} dia(s), ${dia(cob.dia)}`}, de cerca de <b>{fmtBRL(cob.valor)}</b> (com {cfg.meta_imposto_pct}% de imposto{x.meta.saldoDevedor ? ` e ${fmtBRL(x.meta.saldoDevedor)} de saldo devedor` : ''}).</p>}
      </div>

      <div className="kpis kpis-cor">
        <div className="kpi k-receita"><span className="rot">Saldo na conta PJ</span><span className="val">{fmtBRL(x.saldoConta)}</span><span className="var">{x.saldoContaEm ? `extrato de ${dm(x.saldoContaEm)}` : 'importe o extrato OFX'}</span></div>
        <div className="kpi k-lucro"><span className="rot">Liberado na Cartpanda</span><span className="val">{fmtBRL(x.cartpanda.disponivel)}</span><span className="var">{x.origemCartpanda === 'informado' ? 'saldo informado por você + vendas liberadas' : x.origemCartpanda === 'estimado' ? 'estimado pelas vendas e repasses; informe o saldo real abaixo' : 'sem repasses para estimar; informe o saldo real abaixo'}</span></div>
        <div className="kpi k-custo"><span className="rot">Fornecedor nos próximos 3 dias</span><span className="val">{fmtBRL(x.fornecedor.pendentes + x.fornecedor.porDia * 3)}</span><span className="var">{fmtBRL(x.fornecedor.pendentes)} de pedidos recentes sem compra + {fmtBRL(x.fornecedor.porDia)} por dia{x.fornecedorPelosPagamentos ? ' (pelo que foi pago nos últimos 14 dias)' : ' (pelo custo dos produtos)'}</span></div>
        <div className="kpi k-mkt"><span className="rot">Meta a cobrar</span><span className="val">{fmtBRL(cob.valor)}</span><span className="var">{cob.dia ? `previsto para ${dia(cob.dia)}` : 'sem gasto recente para prever'}</span></div>
      </div>

      <div className="cartao">
        <div><h2>Dia a dia (10 dias)</h2><p className="nota">Saldo = conta + liberado na Cartpanda. Estimativa com o ritmo dos últimos 14 dias de vendas e de compras.</p></div>
        <div className="tabela"><table>
          <thead><tr><th>Dia</th><th className="n">Liberações</th><th className="n">Vendas novas (est.)</th><th className="n">Fornecedor (est.)</th><th className="n">Meta</th><th className="n">Fatura cartão PJ</th><th className="n">Saldo previsto</th></tr></thead>
          <tbody>{prev.dias.map((d) => (
            <tr key={d.dia}>
              <td>{dia(d.dia)}</td>
              <td className="n sobe">{d.entra ? fmtBRL(d.entra) : ''}</td>
              <td className="n sobe">{fmtBRL(d.vendas)}</td>
              <td className="n desce">{fmtBRL(-d.fornecedor)}</td>
              <td className="n desce">{d.meta ? fmtBRL(-d.meta) : ''}</td>
              <td className="n desce">{d.fatura ? fmtBRL(-d.fatura) : ''}</td>
              <td className={`n ${d.saldo < 0 ? 'desce' : ''}`}>{fmtBRL(d.saldo)}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="nota">Menor saldo previsto no período: <b>{fmtBRL(prev.minimo)}</b>{prev.diaMinimo !== x.hoje ? ` em ${dia(prev.diaMinimo)}` : ''}. Cada saque custa {fmtBRL(cfg.taxa_repasse)}: foram {x.saques} nos últimos 30 dias ({fmtBRL(x.saques * cfg.taxa_repasse)}).</p>
      </div>

      <div className="cartao">
        <div><h2>Aguardando caixa</h2><p className="nota">Otimizações que o Cérebro mantém no radar e só libera quando a folga (depois do fornecedor e da Meta dos próximos 10 dias) chega a 1,5× o dinheiro que elas deixam parado. Folga agora: <b>{fmtBRL(prev.folgaTotal10)}</b> = conta {fmtBRL(x.saldoConta)} + Cartpanda {fmtBRL(x.cartpanda.disponivel)} − fornecedor {fmtBRL(prev.comprometido10.fornecedor)} − Meta {fmtBRL(prev.comprometido10.meta)} − fatura do cartão PJ {fmtBRL(prev.comprometido10.fatura)} − devido à Bárbara {fmtBRL(prev.comprometido10.socio)} − colchão {fmtBRL(prev.comprometido10.colchao)}.</p></div>
        <div className="tabela"><table>
          <thead><tr><th>Otimização</th><th className="n">Dinheiro parado</th><th className="n">Folga necessária</th><th>Situação</th></tr></thead>
          <tbody>{portoes.map((p) => (
            <tr key={p.chave}>
              <td>{p.nome}<br /><small className="nota">{p.ganho}. {p.observacao}</small></td>
              <td className="n">{p.capital ? fmtBRL(p.capital) : '–'}</td>
              <td className="n">{p.capital ? fmtBRL(p.capital * 1.5) : '–'}</td>
              <td>{p.aberto ? <span className="chip g">já dá para fazer</span> : <span className="chip w">{p.capital ? `faltam ${fmtBRL(p.falta)} de folga` : 'sem valor informado'}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="meio">
        <div className="cartao">
          <div><h2>Âncoras</h2><p className="nota">Números que o Cérebro não lê sozinho. Atualize quando quiser; o saldo da Cartpanda vale a partir de hoje.</p></div>
          <form action={salvarAncorasCaixa}>
            <div className="campos">
              <label htmlFor="cp">Saldo disponível na Cartpanda hoje (R$)<input id="cp" name="cartpanda_saldo" className="num" inputMode="decimal" placeholder={x.cartpanda.disponivel.toFixed(2).replace('.', ',')} /></label>
              <label htmlFor="co">Colchão: sempre manter na conta (R$)<input id="co" name="colchao_caixa" className="num" inputMode="decimal" defaultValue={cfg.colchao_caixa} /></label>
              <label htmlFor="sd">Saldo devedor da Meta (R$)<input id="sd" name="meta_saldo_devedor" className="num" inputMode="decimal" defaultValue={cfg.meta_saldo_devedor} /></label>
              <label htmlFor="lm">Gasto que dispara a cobrança da Meta (R$)<input id="lm" name="meta_limite_cobranca" className="num" inputMode="decimal" defaultValue={cfg.meta_limite_cobranca} /></label>
              <label htmlFor="sa">Shopify anual hoje, em reais (R$)<input id="sa" name="shopify_anual_brl" className="num" inputMode="decimal" defaultValue={cfg.shopify_anual_brl || ''} placeholder="US$ 185,71 em reais" /></label>
            </div>
            <div className="acoes"><button type="submit">Salvar</button></div>
          </form>
        </div>
        <div className="cartao">
          <div><h2>Como o Cérebro decide</h2></div>
          <div className="res">
            <Linha r="Pode usar o saldo se" v="conta − fornecedor 3 dias − Meta ≥ colchão" />
            <Linha r="Pede saque se" v="só o saque cobre" />
            <Linha r="Meta" v="gasto desde a última cobrança + 13,83% de imposto" />
            <Linha r="Fornecedor" v="custo médio dos pedidos pagos (14 dias)" />
          </div>
          <p className="nota">Os pedidos pagos há até 2 dias sem compra vinculada contam como ainda a pagar: vincule as compras em Conta PJ para essa conta ficar exata.</p>
        </div>
      </div>
    </Casca>
  );
}
