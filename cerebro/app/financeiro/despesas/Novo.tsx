'use client';
import {useRef, useState} from 'react';

const NOMES_GRUPO: Record<string, string> = {receita: 'Receita', outras: 'Outras receitas', deducoes: 'Deduções', cmv: 'Custo dos produtos', variaveis: 'Variáveis de venda', marketing: 'Marketing', fixas: 'Fixas', financeiras: 'Financeiras'};

export default function Novo({acao, hoje, categorias}: {acao: (fd: FormData) => Promise<void>; hoje: string; categorias: (readonly [string, string, string])[]}) {
  const [cat, setCat] = useState('assinaturas');
  const ref = useRef<HTMLFormElement>(null);
  const grupos = [...new Set(categorias.map((c) => c[2]))];
  return (
    <form ref={ref} action={async (fd) => { await acao(fd); ref.current?.reset(); setCat('assinaturas'); }}>
      <div className="campos">
        <label htmlFor="data">Data<input id="data" name="data" type="date" defaultValue={hoje} required /></label>
        <label htmlFor="categoria">Conta
          <select id="categoria" name="categoria" value={cat} onChange={(e) => setCat(e.target.value)}>
            {grupos.map((g) => <optgroup key={g} label={NOMES_GRUPO[g] ?? g}>{categorias.filter((c) => c[2] === g).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</optgroup>)}
          </select>
        </label>
        <label htmlFor="valor">Valor (R$)<input id="valor" name="valor" className="num" inputMode="decimal" placeholder="0,00" required /></label>
        <label htmlFor="descricao">Descrição<input id="descricao" name="descricao" placeholder={cat === 'midia' ? 'Meta Ads · semana 43' : ''} /></label>
      </div>
      <div className="acoes">
        <label className="check"><input type="checkbox" name="recorrente" /> Repetir todo mês</label>
        <label className="check"><input type="checkbox" name="a_pagar" /> Ainda não foi pago</label>
        {cat === 'midia' && <label className="check"><input type="checkbox" name="sem_imposto" defaultChecked /> Valor do Gerenciador (sem imposto): lançar o imposto da Meta junto</label>}
      </div>
      {cat === 'midia' && <p className="nota">Use só para anúncios fora da Meta sincronizada (ex.: influenciador, impulsionamento pago à parte). O gasto da Meta vem sozinho.</p>}
      {cat === 'das' && <p className="nota">Lançada a guia do mês, ela substitui o DAS estimado.</p>}
      <div className="acoes"><button type="submit">Lançar</button></div>
    </form>
  );
}
