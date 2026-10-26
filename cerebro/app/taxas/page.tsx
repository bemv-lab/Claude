import Link from 'next/link';
import Casca from '@/components/Casca';
import {lerConfig, lerFormas, lerJuros, lerPlanos, lerPrazos, lerTaxas, mesAtual, planoCartpanda, radar30, resumoMes} from '@/lib/dados';
import {fmtBRL, fmtPct, taxaMedia} from '@/lib/calc';
import {apagarPlano, salvarConfig, salvarPlano, salvarTabelasTaxas} from '@/app/acoes';

export const dynamic = 'force-dynamic';

export default function Taxas() {
  const cfg = lerConfig(), formas = lerFormas(), planos = lerPlanos(), taxas = lerTaxas(), pc = planoCartpanda();
  const prazos = lerPrazos(), juros = lerJuros(), rad = radar30();
  const {taxa} = taxaMedia(formas);
  const pedidos = resumoMes(mesAtual()).pagos.n;
  const cartao = taxas.filter((t) => t.forma === 'cartao');
  const parcelas = Object.keys(juros).map(Number).sort((a, b) => a - b);

  return (
    <Casca>
      <div className="topo"><div><div className="olho">Dinheiro</div><h1>Taxas, impostos e <b>planos</b></h1></div>
        <Link className="botao leve" href="/financeiro/custos">Ver onde dá para pagar menos</Link></div>

      <div className="cartao alerta">
        <p>Esses valores entram em todo cálculo de lucro, margem, CPA máximo e preço. No Único Drop, o imposto sobre o faturamento e o imposto sobre a Meta estão em 0%: por isso o lucro de lá aparece maior.</p>
      </div>

      <form action={salvarConfig}>
        <div className="grade3">
          <div className="cartao">
            <div><h2>Impostos e custo do dinheiro</h2><p className="nota">Simples Nacional, Meta e dólar</p></div>
            <label htmlFor="das_pct">DAS: % sobre o faturamento<input id="das_pct" name="das_pct" type="number" step="0.01" defaultValue={cfg.das_pct} /></label>
            <label htmlFor="rbt12">Faturamento dos últimos 12 meses (R$, do contador)<input id="rbt12" name="rbt12" type="number" step="1" defaultValue={cfg.rbt12} /></label>
            <label htmlFor="meta_imposto_pct">Imposto sobre Meta Ads (%)<input id="meta_imposto_pct" name="meta_imposto_pct" type="number" step="0.01" defaultValue={cfg.meta_imposto_pct} /></label>
            <label htmlFor="cotacao_dolar">Cotação do dólar (R$) para custos em US$<input id="cotacao_dolar" name="cotacao_dolar" type="number" step="0.01" defaultValue={cfg.cotacao_dolar} /></label>
            <label htmlFor="custo_capital_mensal">Custo do dinheiro (% ao mês)<input id="custo_capital_mensal" name="custo_capital_mensal" type="number" step="0.1" defaultValue={cfg.custo_capital_mensal} /></label>
            <p className="nota">Meta: 13,83% no pós-pago, confirmado na fatura (R$ 3.000 viraram R$ 3.415,30). DAS: com {fmtBRL(rad.das.rbt)} de faturamento {rad.das.anualizado ? '(últimos 30 dias × 12, estimado)' : 'em 12 meses'}, o Simples (Anexo I) cai na {rad.das.faixa}ª faixa, alíquota efetiva de cerca de {fmtPct(rad.das.efetiva)}. Confirme com o contador e use aqui.</p>
          </div>
          <div className="cartao">
            <div><h2>Cartpanda Pay</h2><p className="nota">Como vocês recebem e quem paga os juros</p></div>
            <div className="campos">
              <label htmlFor="prazo_cartao">Cartão cai em
                <select id="prazo_cartao" name="prazo_cartao" defaultValue={String(cfg.prazo_cartao)}>{prazos.map((p) => <option key={p.dias} value={p.dias}>D+{p.dias} ({fmtPct(p.pct)})</option>)}</select></label>
              <label htmlFor="parcelas_sem_juros">Loja assume os juros até
                <select id="parcelas_sem_juros" name="parcelas_sem_juros" defaultValue={String(cfg.parcelas_sem_juros)}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => <option key={n} value={n}>{n}x</option>)}</select></label>
              <label htmlFor="pix_pct">Pix (%)<input id="pix_pct" name="pix_pct" type="number" step="0.01" defaultValue={cfg.pix_pct} /></label>
              <label htmlFor="boleto_fixo">Boleto (R$ por boleto)<input id="boleto_fixo" name="boleto_fixo" type="number" step="0.01" defaultValue={cfg.boleto_fixo} /></label>
              <label htmlFor="plataforma_pct">Checkout (% da venda)<input id="plataforma_pct" name="plataforma_pct" type="number" step="0.01" defaultValue={cfg.plataforma_pct} /></label>
              <label htmlFor="taxa_repasse">Taxa por repasse (R$)<input id="taxa_repasse" name="taxa_repasse" type="number" step="0.01" defaultValue={cfg.taxa_repasse} /></label>
              <label htmlFor="reserva_pct">Reserva retida (%)<input id="reserva_pct" name="reserva_pct" type="number" step="0.1" defaultValue={cfg.reserva_pct} /></label>
              <label htmlFor="reserva_dias">Reserva volta em (dias)<input id="reserva_dias" name="reserva_dias" type="number" step="1" defaultValue={cfg.reserva_dias} /></label>
            </div>
            <p className="nota">Não existe taxa fixa por pedido: as taxas dos 13 pedidos do pagamento de 26/10 somam exatamente R$ 215,37 só com os percentuais. Os R$ 4,90 de “taxa de processamento” são cobrados por repasse (a confirmar). A reserva não é custo: volta depois.</p>
          </div>
          <div className="cartao">
            <div><h2>Metas e cartão PJ</h2><p className="nota">Dashboard, precificação e fatura</p></div>
            <label htmlFor="meta_mes">Meta de faturamento do mês (R$)<input id="meta_mes" name="meta_mes" type="number" step="100" defaultValue={cfg.meta_mes} /></label>
            <label htmlFor="cpa_alvo_padrao">CPA alvo padrão (R$)<input id="cpa_alvo_padrao" name="cpa_alvo_padrao" type="number" step="0.01" defaultValue={cfg.cpa_alvo_padrao} /></label>
            <div className="campos">
              <label htmlFor="cartao_pj_limite">Limite do cartão PJ (R$)<input id="cartao_pj_limite" name="cartao_pj_limite" type="number" step="1" defaultValue={cfg.cartao_pj_limite} /></label>
              <label htmlFor="cartao_pj_fechamento">Fecha no dia<input id="cartao_pj_fechamento" name="cartao_pj_fechamento" type="number" min="1" max="28" step="1" defaultValue={cfg.cartao_pj_fechamento} /></label>
              <label htmlFor="cartao_pj_vencimento">Vence no dia<input id="cartao_pj_vencimento" name="cartao_pj_vencimento" type="number" min="1" max="28" step="1" defaultValue={cfg.cartao_pj_vencimento} /></label>
            </div>
          </div>
        </div>
        <div className="acoes"><button type="submit">Salvar alterações</button></div>
      </form>

      <div className="meio">
        <div className="cartao">
          <div><h2>Tabelas da Cartpanda Pay</h2><p className="nota">Central de ajuda, atualizada em 30/09/2026. Edite se a Cartpanda mudar.</p></div>
          <form action={salvarTabelasTaxas}>
            <div className="tabela"><table>
              <thead><tr><th>Cartão cai em</th><th className="n">Taxa (%)</th></tr></thead>
              <tbody>{prazos.map((p) => <tr key={p.dias}><td>D+{p.dias}</td><td><input name={`prazo_${p.dias}`} type="number" step="0.01" defaultValue={p.pct} aria-label={`Taxa D+${p.dias}`} style={{minWidth: 96}} /></td></tr>)}</tbody>
            </table></div>
            <div className="tabela"><table>
              <thead><tr><th>Parcelas</th><th className="n">Juros (%)</th><th className="n">Taxa total para a loja</th><th>Quem paga os juros</th></tr></thead>
              <tbody>{parcelas.map((n) => {
                const t = cartao.find((x) => x.parcelas === n);
                const loja = n <= cfg.parcelas_sem_juros;
                return (
                  <tr key={n}><td>{n}x</td><td><input name={`juros_${n}`} type="number" step="0.01" defaultValue={juros[n]} aria-label={`Juros de ${n}x`} style={{minWidth: 96}} /></td>
                    <td className="n">{fmtPct(t?.pct ?? 0)}</td><td>{loja ? <span className="chip w">a loja</span> : <span className="chip g">o cliente</span>}</td></tr>
                );
              })}</tbody>
            </table></div>
            <div className="acoes"><button type="submit">Salvar tabelas</button></div>
          </form>
        </div>
        <div className="cartao">
          <div><h2>Como os clientes pagam de verdade</h2><p className="nota">Pedidos pagos dos últimos 90 dias. É esse mix que a precificação usa.</p></div>
          {formas.length === 0 ? <p className="vazio">Sem pedidos sincronizados ainda.</p> : (
            <div className="tabela"><table>
              <thead><tr><th>Forma</th><th className="n">% dos pedidos</th><th className="n">Taxa efetiva</th></tr></thead>
              <tbody>{formas.map((f) => <tr key={f.id}><td>{f.nome}</td><td className="n">{fmtPct(f.mix_pct)}</td><td className="n">{fmtPct(f.taxa_pct)}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="nota">Taxa média ponderada: <b>{fmtPct(taxa)}</b> por pedido.</p>
        </div>
      </div>

      <div className="cartao">
        <div className="topo"><div><h2>Plano da Cartpanda</h2><p className="nota">Custo de cada plano com as vendas pagas dos últimos 30 dias ({fmtBRL(pc.fat30)})</p></div><span className="tag">atual: {pc.atual}</span></div>
        <div className="tabela"><table>
          <thead><tr><th>Plano</th><th className="n">Mensalidade</th><th className="n">Checkout</th><th className="n">Custo no mês</th><th /></tr></thead>
          <tbody>{pc.cmp.custos.map((p) => (
            <tr key={p.nome}><td><b>{p.nome}</b></td><td className="n">{fmtBRL(p.mensal)}</td><td className="n">{fmtPct(p.pct)}</td><td className="n">{fmtBRL(p.custo)}</td>
              <td>{p.nome === pc.cmp.melhor.nome ? <span className="chip g">mais barato</span> : p.nome === pc.atual ? <span className="chip">atual</span> : null}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="nota">Vale trocar a partir de: {pc.cmp.viradas.map((v) => `${v.para} ${fmtBRL(v.faturamento)}/mês`).join(' · ')}. O Início avisa quando a troca compensar ou estiver a 15% de compensar.</p>
      </div>

      <div className="cartao">
        <div className="topo"><h2>Planos e gatilhos</h2><span className="nota">{pedidos} pedidos pagos neste mês</span></div>
        <p className="nota">Para cada serviço: quanto custa hoje e a partir de quantos pedidos por mês vale reavaliar o plano. O início avisa quando faltar 20% para o gatilho.</p>
        <div className="tabela"><table>
          <thead><tr><th>Serviço</th><th>Plano atual</th><th className="n">R$/mês</th><th className="n">Taxa %</th><th className="n">Gatilho (pedidos/mês)</th><th>Avaliar</th><th>Observação</th><th /></tr></thead>
          <tbody>
            {[...planos, null].map((p) => (
              <tr key={p?.id ?? 'novo'}>
                <td><form action={salvarPlano} id={`pl${p?.id ?? 0}`}><input type="hidden" name="id" value={p?.id ?? 0} /></form>
                  <input form={`pl${p?.id ?? 0}`} name="servico" defaultValue={p?.servico} placeholder="Novo serviço" aria-label="Serviço" /></td>
                <td><input form={`pl${p?.id ?? 0}`} name="plano" defaultValue={p?.plano} aria-label="Plano atual" /></td>
                <td><input form={`pl${p?.id ?? 0}`} name="custo_mensal" type="number" step="0.01" defaultValue={p?.custo_mensal} aria-label="Custo mensal" /></td>
                <td><input form={`pl${p?.id ?? 0}`} name="taxa_pct" type="number" step="0.01" defaultValue={p?.taxa_pct} aria-label="Taxa" /></td>
                <td><input form={`pl${p?.id ?? 0}`} name="gatilho_pedidos" type="number" step="1" defaultValue={p?.gatilho_pedidos} aria-label="Gatilho de pedidos" /></td>
                <td><input form={`pl${p?.id ?? 0}`} name="proximo" defaultValue={p?.proximo} aria-label="Plano a avaliar" /></td>
                <td><input form={`pl${p?.id ?? 0}`} name="obs" defaultValue={p?.obs} aria-label="Observação" /></td>
                <td><div className="acoes">
                  <button className="mini" type="submit" form={`pl${p?.id ?? 0}`}>{p ? 'Salvar' : 'Adicionar'}</button>
                  {p && <form action={apagarPlano}><input type="hidden" name="id" value={p.id} /><button className="mini" type="submit" aria-label={`Apagar ${p.servico}`}>×</button></form>}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </Casca>
  );
}
