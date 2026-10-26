'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

const L = ({href, children}: {href: string; children: React.ReactNode}) => {
  const caminho = usePathname();
  const atual = href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(`${href}/`);
  return <Link href={href} aria-current={atual ? 'page' : undefined}>{children}</Link>;
};
const Breve = ({children, fase}: {children: React.ReactNode; fase: string}) => <div className="item">{children} <span>{fase}</span></div>;

export default function Trilho({children}: {children: React.ReactNode}) {
  return (
    <nav className="trilho" aria-label="Módulos">
      <div className="marca"><i /><div>Cérebro Rocco<small>Rocco Kids</small></div></div>
      <L href="/">Início</L>
      <div className="grupo">Dinheiro</div>
      <L href="/precificacao">Precificação</L>
      <L href="/financeiro">Financeiro</L>
      <L href="/taxas">Taxas e planos</L>
      <div className="grupo">Crescimento</div>
      <L href="/campanhas">Campanhas</L>
      <Breve fase="fase 3">Produto e mineração</Breve>
      <Breve fase="fase 3">Criativos e copies</Breve>
      <div className="grupo">Operação</div>
      <Breve fase="fase 4">Pedidos ML e Shopee</Breve>
      <Breve fase="fase 5">Direct</Breve>
      <div className="grupo">Inteligência</div>
      <L href="/memoria">Memória</L>
      {children}
    </nav>
  );
}
