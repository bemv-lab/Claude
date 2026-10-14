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
};

export const FIM_CARTAO = 2.6; // segundos do cartão final

// Agrupa palavras em frases curtas de legenda (até 4 palavras ou até a pontuação)
export const blocosDeLegenda = (palavras: Palavra[], max = 4) => {
  const blocos: {palavras: Palavra[]; inicio: number; fim: number}[] = [];
  let atual: Palavra[] = [];
  const fecha = () => {
    if (atual.length) blocos.push({palavras: atual, inicio: atual[0].start, fim: atual[atual.length - 1].end});
    atual = [];
  };
  for (const p of palavras) {
    atual.push(p);
    if (atual.length >= max || /[.!?,;:]$/.test(p.text)) fecha();
  }
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
