// Roteiro do vídeo 1 (Pasta de Descobertas). A fala de cada cena, somada, é o texto da locução.
export type Cena = {
  id: string;
  fala: string;
  legenda: string | null; // null: a cena usa título ou cartão no lugar da legenda
};

export const CENAS: Cena[] = [
  {id: 'gancho', fala: 'O primeiro botão fechado sozinho demora. E tudo bem.', legenda: 'O primeiro botão demora. E tudo bem.'},
  {id: 'apresentacao', fala: 'Sou a Tília, personagem da Rocco.', legenda: 'Tília, personagem da Rocco'},
  {id: 'itens', fala: 'A Pasta de Descobertas tem zíperes, botões, fivelas, cadarços, ábaco e relógio.', legenda: 'zíperes, botões, fivelas, cadarços, ábaco, relógio'},
  {id: 'verbos', fala: 'Abrir, fechar, encaixar, tentar de novo. No tempo da criança.', legenda: 'Abrir, fechar, encaixar, tentar de novo.'},
  {id: 'sorriso', fala: 'E quando consegue, aquele pequeno sorriso diz tudo.', legenda: 'Aquele pequeno sorriso diz tudo.'},
  {id: 'escolha', fala: 'Por isso a Rocco escolheu.', legenda: null},
  {id: 'ficha', fala: 'Três a seis anos, sem tela, com alças para levar junto.', legenda: null},
  {id: 'final', fala: 'Vale olhar de perto. O link está aqui embaixo.', legenda: 'Vale olhar de perto.'},
];

export const TEXTO_LOCUCAO = CENAS.map((c) => c.fala).join(' ');
