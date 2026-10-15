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
  aviso?: string; // ex.: "versão animada com IA da gravação da Bárbara"
  cta?: {texto: string; site: string};
  prototipo?: boolean;
  cortes?: number[]; // instantes dos cortes de pausa (linha do tempo já sem pausas): o zoom alterna em cada um
  legendaTopo?: number; // px do topo da legenda (padrão: altura do peito)
};

export const FIM_CARTAO = 2.6; // segundos do cartão final
export const LEGENDA_TOPO = 1250; // altura do peito em gravação do meio do peito para cima (abaixo do queixo)

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
