import {continueRender, delayRender, staticFile} from 'remotion';

// Cores e fonte em uso no site da Rocco Kids (tema Shopify "Rocco 2.0").
export const COR = {
  creme: '#f7f4ee',
  cremeClaro: '#f2ebdd',
  borda: '#e4ded3',
  tinta: '#302e29',
  texto: '#625f58',
  terracota: '#b85f42',
  terracotaEscuro: '#8f4937',
  terracotaClaro: '#c98268',
  musgo: '#3f493d',
  salvia: '#66735e',
  branco: '#fffdf9',
} as const;

export const FONTE = 'DM Sans';

// Carrega a DM Sans local (pacote @fontsource copiado para public/fontes), sem depender de rede.
const pesos = [400, 500, 700] as const;
let carregado = false;
export const carregarFonte = () => {
  if (carregado || typeof document === 'undefined') return;
  carregado = true;
  const handle = delayRender('fonte DM Sans');
  Promise.all(
    pesos.map((p) => {
      const face = new FontFace(FONTE, `url(${staticFile(`fontes/dm-sans-latin-${p}-normal.woff2`)}) format('woff2')`, {weight: String(p)});
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
};
