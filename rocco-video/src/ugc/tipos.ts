// Plano de edição de um vídeo gravado pela apresentadora (rosto real ou versão em feltro).
// O Claude escreve este JSON a partir da transcrição; o Remotion monta o vídeo.

export type Palavra = {text: string; start: number; end: number}; // segundos, na linha do tempo da gravação

export type TrechoAroll = {src: string; de: number; ate: number}; // vídeo (feltro ou real) que cobre [de, ate)

export type Insercao = {
  tipo: 'imagem' | 'video' | 'cartao';
  de: number;
  ate: number;
  src?: string; // imagem/vídeo em public/
  texto?: string; // cartão ou legenda da inserção
  modo?: 'tela-cheia' | 'janela'; // janela: produto em cartão sobre a apresentadora
};

export type PlanoUGC = {
  arolls: TrechoAroll[];
  audio: string; // voz original da gravação (sempre a voz real, nunca a do vídeo estilizado)
  duracao: number; // segundos da gravação
  palavras: Palavra[];
  insercoes: Insercao[];
  titulo?: {texto: string; ate: number};
  assinatura?: string; // ex.: "Bárbara · Rocco Kids"
  aviso?: string; // versões com IA: "versão em feltro feita com IA · voz real da Bárbara" (assinatura + selo o vídeo todo)
  prototipo?: boolean;
  cortes?: number[]; // instantes dos cortes de pausa (linha do tempo já sem pausas): o zoom alterna em cada um
  pescoco?: number; // px (em 1080x1920, sem zoom) da base do pescoço, medido no rosto detectado pela fábrica
  legendaTopo?: number; // px do topo da legenda: força a posição (sem isso, vem do pescoço)
};

// Área que a interface do Reels cobre (1080x1920): à direita, a coluna de curtir/comentar/enviar (da metade
// para baixo); embaixo, nome, legenda do post e áudio. A legenda do vídeo fica fora das duas.
export const REELS = {topo: 270, base: 1500, direita: 930}; // topo: faixa do título "Reels" e da câmera
export const LEGENDA_ALTURA = 100; // pílula de 1 linha (fonte 65 + respiro)
export const LEGENDA_TOPO = 1380; // sem rosto detectado: abaixo do pescoço em gravação do meio do peito para cima

// Zoom do corte de UGC (Aroll): alterna 1,00 e 1,08 e cresce até 1,2% em cada trecho, a partir de 38% da altura
export const ZOOM = {origem: 0.38 * 1920, max: 1.08 * 1.012};
const comZoom = (y: number) => ZOOM.origem + (y - ZOOM.origem) * ZOOM.max;

// Legenda logo abaixo do pescoço, mesmo no zoom maior. Se ela invadiria a faixa de baixo do Reels,
// a gravação sobe (`subir` px na altura do pescoço, com no máximo +20% de escala) e a legenda sobe junto.
// Se nem assim couber, a legenda fica no limite da faixa do Reels (a interface nunca a cobre).
export const posicaoLegenda = (plano: PlanoUGC) => {
  const padrao = {topo: LEGENDA_TOPO, subir: 0, pescocoZoom: 0};
  if (plano.legendaTopo !== undefined) return {...padrao, topo: plano.legendaTopo};
  if (plano.pescoco === undefined || plano.pescoco < 700 || plano.pescoco > 1600) return padrao; // medida implausível
  const pescocoZoom = comZoom(plano.pescoco);
  const topo = Math.round(pescocoZoom + 24);
  const subir = Math.round(Math.min(Math.max(0, topo + LEGENDA_ALTURA - REELS.base), 0.2 * (1920 - pescocoZoom)));
  return {topo: Math.min(topo - subir, REELS.base - LEGENDA_ALTURA), subir, pescocoZoom};
};

const letras = (p: Palavra) => p.text.replace(/[^\p{L}\p{N}]/gu, '').length;

// Legenda dinâmica: 1 ou 2 palavras por vez (até ~14 letras), quebrando na pontuação e nas pausas
export const blocosDeLegenda = (palavras: Palavra[], max = 2) => {
  const blocos: {palavras: Palavra[]; inicio: number; fim: number}[] = [];
  let atual: Palavra[] = [];
  const fecha = () => {
    if (atual.length) blocos.push({palavras: atual, inicio: atual[0].start, fim: atual[atual.length - 1].end});
    atual = [];
  };
  palavras.forEach((p, i) => {
    if (atual.length && atual.reduce((n, a) => n + letras(a), 0) + letras(p) > 14) fecha();
    atual.push(p);
    const prox = palavras[i + 1];
    if (atual.length >= max || /[.!?,;:]$/.test(p.text) || (prox && prox.start - p.end > 0.35)) fecha();
  });
  fecha();
  // cada bloco fica na tela até o próximo começar (se a pausa for curta)
  return blocos.map((b, i) => {
    const prox = blocos[i + 1];
    return {...b, fim: prox && prox.inicio - b.fim < 0.6 ? prox.inicio : b.fim + 0.25};
  });
};

// Inícios de frase (para o corte com zoom típico de UGC)
export const iniciosDeFrase = (palavras: Palavra[]) => {
  const inicios: number[] = [];
  palavras.forEach((p, i) => {
    if (i === 0 || /[.!?]$/.test(palavras[i - 1].text)) inicios.push(p.start);
  });
  return inicios;
};
