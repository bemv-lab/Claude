import Casca from '@/components/Casca';
import {lerConfig, lerFormas, lerPlanos, mesAtual, resumoMes} from '@/lib/dados';
import {fmtPct, taxaMedia} from '@/lib/calc';
import {apagarForma, apagarPlano, novaForma, salvarConfig, salvarFormas, salvarPlano} from '@/app/acoes';

export const dynamic = 'force-dynamic';

export default function Taxas() {
  const cfg = lerConfig(), formas = lerFormas(), planos = lerPlanos();
  const {taxa, somaMix} = taxaMedia(formas);
  const pedidos = resumoMes(mesAtual()).pedidos;
  return (
    <Casca>
      <div className="topo"><div><div className="olho">Dinheiro</div><h1>Taxas, impostos e <b>planos</b></h1></div>
        {cfg.taxas_exemplo ? <span className="selo">taxas de exemplo</span> : null}</div>

      <div className="meio">
        <div className="cartao">
          <h2>Impostos e taxas por venda</h2>
          <form action={salvarConfig}>
            <div className="campos">
              <label htmlFor="das_pct">DAS, alíquota efetiva (%)<input id="das_pct" name="das_pct" type="number" step="0.01" defaultValue={cfg.das_pct} /></label>
              <label htmlFor="plataforma_pct">Plataforma por venda (%)<input id="plataforma_pct" name="plataforma_pct" type="number" step="0.01" defaultValue={cfg.plataforma_pct} /></label>
              <label htmlFor="meta_imposto_pct">Imposto Meta sobre mídia (%)<input id="meta_imposto_pct" name="meta_imposto_pct" type="number" step="0.01" defaultValue={cfg.meta_imposto_pct} /></label>
              <label htmlFor="cpa_alvo_padrao">CPA alvo padrão (R$)<input id="cpa_alvo_padrao" name="cpa_alvo_padrao" type="number" step="0.01" defaultValue={cfg.cpa_alvo_padrao} /></label>
            </div>
            <div className="acoes"><button type="submit">Salvar</button></div>
          </form>
          <p className="nota">Imposto Meta: 13,83% no pós-pago (cartão), o equivalente a PIS/Cofins 9,25% + ISS 2,9% sobre o valor bruto. No Simples Nacional a alíquota efetiva do DAS sobe com a receita dos últimos 12 meses: confira com o contador a cada mês.</p>
        </div>

        <div className="cartao">
          <h2>Como o cliente paga</h2>
          <form action={salvarFormas}>
            <div className="tabela"><table>
              <thead><tr><th>Forma</th><th className="n">Taxa %</th><th className="n">% pedidos</th><th /></tr></thead>
              <tbody>{formas.map((f) => (
                <tr key={f.id}>
                  <td><input type="hidden" name="id" value={f.id} /><input name={`nome_${f.id}`} defaultValue={f.nome} aria-label="Forma de pagamento" /></td>
                  <td><input name={`taxa_${f.id}`} type="number" step="0.01" defaultValue={f.taxa_pct} aria-label={`Taxa de ${f.nome}`} /></td>
                  <td><input name={`mix_${f.id}`} type="number" step="0.1" defaultValue={f.mix_pct} aria-label={`Mix de ${f.nome}`} /></td>
                  <td><button className="mini" type="submit" formAction={apagarForma} name="apagar" value={f.id} aria-label={`Apagar ${f.nome}`}>×</button></td>
                </tr>))}
              </tbody>
            </table></div>
            <div className="acoes"><button type="submit">Salvar taxas</button><button className="leve" type="submit" formAction={novaForma}>+ forma</button></div>
          </form>
          <p className={`nota ${Math.abs(somaMix - 100) > 0.5 ? 'desce' : ''}`}>Taxa média ponderada: <b>{fmtPct(taxa)}</b> · o mix soma {fmtPct(somaMix)}.</p>
        </div>
      </div>

      <div className="cartao">
        <div className="topo"><h2>Planos e gatilhos</h2><span className="nota">{pedidos} pedidos lançados neste mês</span></div>
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
