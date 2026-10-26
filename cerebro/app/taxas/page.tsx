import Casca from '@/components/Casca';
import {lerConfig, lerFormas, lerPlanos, lerTaxas, mesAtual, resumoMes} from '@/lib/dados';
import {fmtPct, taxaMedia} from '@/lib/calc';
import {apagarPlano, salvarConfig, salvarPlano, salvarTaxas} from '@/app/acoes';

export const dynamic = 'force-dynamic';

export default function Taxas() {
  const cfg = lerConfig(), formas = lerFormas(), planos = lerPlanos(), taxas = lerTaxas();
  const {taxa, somaMix} = taxaMedia(formas);
  const pedidos = resumoMes(mesAtual()).pagos.n;
  return (
    <Casca>
      <div className="topo"><div><div className="olho">Dinheiro</div><h1>Taxas, impostos e <b>planos</b></h1></div>
</div>

      <div className="cartao alerta">
        <p>Esses valores entram em todo cálculo de lucro, margem, CPA máximo e preço. No Único Drop, o imposto sobre o faturamento e o imposto sobre a Meta estão em 0%: por isso o lucro de lá aparece maior.</p>
      </div>
      <form action={salvarConfig}>
        <div className="grade3">
          <div className="cartao">
            <div><h2>Taxas por venda</h2><p className="nota">Percentual cobrado em cada venda paga</p></div>
            <label htmlFor="plataforma_pct">Checkout Cartpanda por venda (%)<input id="plataforma_pct" name="plataforma_pct" type="number" step="0.01" defaultValue={cfg.plataforma_pct} /></label>
            <p className="nota">Gateway (Pix, boleto e cartão por parcela) fica na tabela abaixo.</p>
          </div>
          <div className="cartao">
            <div><h2>Impostos</h2><p className="nota">Simples Nacional e repasse da Meta</p></div>
            <label htmlFor="das_pct">DAS: % sobre o faturamento<input id="das_pct" name="das_pct" type="number" step="0.01" defaultValue={cfg.das_pct} /></label>
            <label htmlFor="meta_imposto_pct">Imposto sobre Meta Ads (%)<input id="meta_imposto_pct" name="meta_imposto_pct" type="number" step="0.01" defaultValue={cfg.meta_imposto_pct} /></label>
            <p className="nota">Meta: 13,83% no pós-pago (PIS/Cofins 9,25% + ISS 2,9% sobre o bruto). A alíquota efetiva do DAS sobe com a receita dos últimos 12 meses: confira com o contador todo mês.</p>
          </div>
          <div className="cartao">
            <div><h2>Metas</h2><p className="nota">Usadas no dashboard e na precificação</p></div>
            <label htmlFor="meta_mes">Meta de faturamento do mês (R$)<input id="meta_mes" name="meta_mes" type="number" step="100" defaultValue={cfg.meta_mes} /></label>
            <label htmlFor="cpa_alvo_padrao">CPA alvo padrão (R$)<input id="cpa_alvo_padrao" name="cpa_alvo_padrao" type="number" step="0.01" defaultValue={cfg.cpa_alvo_padrao} /></label>
          </div>
        </div>
        <div className="acoes"><button type="submit">Salvar alterações</button></div>
      </form>

      <div className="meio">
        <div className="cartao">
          <div className="topo"><div><h2>Gateway Cartpanda Pay</h2><p className="nota">Taxa por forma de pagamento e por número de parcelas</p></div>{cfg.gateway_exemplo ? <span className="selo">conferir parcelas</span> : null}</div>
          <form action={salvarTaxas}>
            <div className="tabela"><table>
              <thead><tr><th>Forma</th><th className="n">% do pedido</th><th className="n">R$ fixo</th></tr></thead>
              <tbody>{taxas.map((t) => {
                const k = `${t.forma}_${t.parcelas}`;
                return (
                  <tr key={k}>
                    <td>{t.forma === 'cartao' ? `Cartão ${t.parcelas}x` : t.forma === 'pix' ? 'Pix' : 'Boleto'}</td>
                    <td><input name={`pct_${k}`} type="number" step="0.01" defaultValue={t.pct} aria-label={`Percentual ${k}`} /></td>
                    <td><input name={`fixo_${k}`} type="number" step="0.01" defaultValue={t.fixo} aria-label={`Valor fixo ${k}`} /></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="acoes"><button type="submit">Salvar taxas</button></div>
          </form>
          <p className="nota">Copiadas do Único Drop (26/10): Pix 0,99%, boleto R$ 3,50 e a tabela de parcelas como taxa total de cada parcela. Duas coisas a confirmar com a Cartpanda: (1) o Único Drop soma 5,99% + a tabela (6x = 20,10%); aqui 6x = 14,11%; (2) 7x a 12x estão em 5,99% lá, o que parece não configurado, e vocês vendem em até 10x.</p>
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
