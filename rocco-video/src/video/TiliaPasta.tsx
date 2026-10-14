import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {COR, FONTE, carregarFonte} from '../marca';
import {ANCORA, Pasta, PASTA_ABERTA, PASTA_FECHADA, ancoraNoPalco} from '../produto/PastaIlustrada';
import {POSE, Tilia, Lupa, LenteAssinatura, centroLente} from '../turminha/Tilia';
import {Pt, ROSTO_NEUTRO, RostoEstado, easeInOut, lerp, misturaPt, olharPara, piscadaNoQuadro, rampa} from '../turminha/kit/rig';
import {CENAS} from './roteiro';
import {ATRASO_AUDIO, Fala, Linha, bocaNoQuadro, montarLinha, quadroDa} from './tempo';

carregarFonte();

const MESA_Y = 1040;
const W = 1080;

type Ctx = {f: number; ini: number; fim: number; linha: Linha; fala: Fala};
type Saida = {palco: React.ReactNode; sobre?: React.ReactNode};

// ---------------------------------------------------------------------------
// comportamento comum da Tília
// ---------------------------------------------------------------------------
const idle = (f: number, calma = 1) => ({
  balanco: 1.5 * Math.sin((2 * Math.PI * f) / 150) * calma,
  respiracao: (0.004 + 0.004 * Math.sin((2 * Math.PI * f) / 120)) * calma,
});

const rostoFalando = (c: Ctx, extra: Partial<RostoEstado> = {}) => {
  const boca = bocaNoQuadro(c.fala, c.f);
  const rosto: RostoEstado = {...ROSTO_NEUTRO, piscar: piscadaNoQuadro(c.f, 'tilia'), ...extra, v: boca.v, o: boca.o};
  return {rosto, bocaWH: boca.wh};
};

// posição de uma lente que para em cada ponto no frame da palavra, deslizando 11 frames antes
const caminho = (f: number, paradas: {t: number; p: Pt}[]): Pt => {
  if (f <= paradas[0].t) return paradas[0].p;
  for (let i = 0; i < paradas.length - 1; i++) {
    const a = paradas[i];
    const b = paradas[i + 1];
    if (f < b.t) {
      const dur = Math.min(11, b.t - a.t);
      return f < b.t - dur ? a.p : misturaPt(a.p, b.p, easeInOut((f - (b.t - dur)) / dur));
    }
  }
  return paradas[paradas.length - 1].p;
};

const Mesa: React.FC = () => <rect x={0} y={MESA_Y} width={W} height={2} fill={COR.borda} />;

const Titulo: React.FC<{texto: string; opacidade: number; top?: number}> = ({texto, opacidade, top = 318}) => (
  <div
    style={{
      position: 'absolute',
      top,
      width: '100%',
      textAlign: 'center',
      fontFamily: FONTE,
      fontWeight: 500,
      fontSize: 60,
      letterSpacing: -0.5,
      color: COR.tinta,
      opacity: opacidade,
    }}
  >
    {texto}
  </div>
);

// ---------------------------------------------------------------------------
// cenas
// ---------------------------------------------------------------------------
const PASTA1 = {escala: 1.04, x: (W - PASTA_ABERTA.w * 1.04) / 2, y: MESA_Y - PASTA_ABERTA.h * 1.04};

const cenaGancho = (c: Ctx): Saida => {
  const {f} = c;
  const s = 0.62;
  const botao = ancoraNoPalco(ANCORA.botao, PASTA1.x, PASTA1.y, PASTA1.escala);
  const ponta = {x: botao.x, y: botao.y + (1592 - 470) * s};
  const fRosto = Math.min(quadroDa(c.linha, 'e', 0, 0), c.fim - 20);
  const rostoOp = rampa(f, fRosto - 6, 6);
  // câmera: começa fechada na lente (push-in 1,30 -> 1,34) e recua revelando o cabo
  const t = rampa(f, fRosto + 4, 26);
  const z = lerp(1.3 + 0.04 * Math.min(1, f / Math.max(1, fRosto)), 1, t);
  const foco = botao;
  const off = {x: 540 - foco.x, y: 640 - foco.y};
  const cam = `translate(${foco.x + off.x * (1 - t)} ${foco.y + off.y * (1 - t)}) scale(${z}) translate(${-foco.x} ${-foco.y})`;
  const calma = rampa(f, fRosto + 10, 20);
  const mov = idle(f, calma);
  const piscaExtra = f >= fRosto + 6 && f < fRosto + 16 ? piscadaNoQuadro(f - (fRosto + 6) + 36, 'forcada') : 0;
  const {rosto, bocaWH} = rostoFalando(c, {sobrancelha: {esq: 0, dir: 0, interna: 0}});
  rosto.piscar = Math.max(rosto.piscar, piscaExtra);
  const lente = centroLente(ponta.x, ponta.y, s, 0);
  const pasta = <Pasta estado="aberta" x={PASTA1.x} y={PASTA1.y} escala={PASTA1.escala} />;
  return {
    palco: (
      <g transform={cam}>
        <Mesa />
        {pasta}
        <Tilia id="t-gancho" x={ponta.x} y={ponta.y} s={s} balanco={mov.balanco} respiracao={mov.respiracao} rosto={rosto} bocaWH={bocaWH} rostoOpacidade={rostoOp} sombra={false} />
        {rostoOp < 1 && (
          <Lupa id="lupa-gancho" cx={lente.cx} cy={lente.cy} r={lente.r} zoom={1.7} opacidade={1 - rostoOp}>
            {pasta}
          </Lupa>
        )}
      </g>
    ),
  };
};

const cenaApresentacao = (c: Ctx): Saida => {
  const {f, ini} = c;
  const s = 0.833;
  const ponta = {x: 250, y: 615 + (1592 - 470) * s};
  const escala = 0.69;
  const px = W - PASTA_ABERTA.w * escala - 20;
  const py = MESA_Y - PASTA_ABERTA.h * escala;
  const fPers = quadroDa(c.linha, 'personagem', ini);
  const gesto = rampa(f, fPers - 8, 16);
  const mov = idle(f);
  const sobe = 8 * rampa(f, ini + 4, 12);
  const {rosto, bocaWH} = rostoFalando(c, {sobrancelha: {esq: sobe, dir: sobe, interna: 0}, olhar: {x: 0.25 * gesto, y: 0.1 * gesto}});
  return {
    palco: (
      <g>
        <Mesa />
        <Pasta estado="aberta" x={px} y={py} escala={escala} />
        <Tilia
          id="t-apres"
          x={ponta.x}
          y={ponta.y}
          s={s}
          balanco={mov.balanco}
          respiracao={mov.respiracao}
          inclinacao={3 * rampa(f, ini, 14)}
          rosto={rosto}
          bocaWH={bocaWH}
          maoDir={misturaPt(POSE.repousoDir, POSE.apresentarDir, gesto)}
          palmaDir={gesto}
          sombra={false}
        />
      </g>
    ),
  };
};

const PASTA3 = {escala: 0.84, x: W - PASTA_ABERTA.w * 0.84 - 14, y: MESA_Y - PASTA_ABERTA.h * 0.84};
const TILIA_PEQ = {s: 0.423, x: 150, y: MESA_Y};

const cenaLenteNosItens = (c: Ctx, paradas: {palavra: string; ancora: Pt}[], titulo: boolean, brilhoSobrancelha?: string): Saida => {
  const {f, ini, fim} = c;
  const P = PASTA3;
  const pontos = paradas.map((p) => ({t: quadroDa(c.linha, p.palavra, ini), p: ancoraNoPalco(p.ancora, P.x, P.y, P.escala)}));
  const pos = caminho(f, [{t: ini, p: pontos[0].p}, ...pontos]);
  const lenteOp = rampa(f, ini, 8) * (1 - rampa(f, fim - 8, 8));
  const tl = centroLente(TILIA_PEQ.x, TILIA_PEQ.y, TILIA_PEQ.s);
  const mov = idle(f);
  const fSobe = brilhoSobrancelha ? quadroDa(c.linha, brilhoSobrancelha, ini) : Infinity;
  const sobe = 8 * rampa(f, fSobe, 12);
  const {rosto, bocaWH} = rostoFalando(c, {olhar: olharPara({x: tl.cx, y: tl.cy}, pos, 700), sobrancelha: {esq: sobe, dir: sobe, interna: 0}});
  const gesto = rampa(f, ini - 10, 16);
  const pasta = <Pasta estado="aberta" x={P.x} y={P.y} escala={P.escala} />;
  return {
    palco: (
      <g>
        <Mesa />
        {pasta}
        <Tilia
          id={`t-itens-${ini}`}
          x={TILIA_PEQ.x}
          y={TILIA_PEQ.y}
          s={TILIA_PEQ.s}
          balanco={mov.balanco}
          respiracao={mov.respiracao}
          rosto={rosto}
          bocaWH={bocaWH}
          maoDir={misturaPt(POSE.repousoDir, POSE.apresentarDir, gesto)}
          palmaDir={gesto}
        />
        <LenteAssinatura id={`lente-${ini}`} cx={pos.x} cy={pos.y} R={150} zoom={1.7} opacidade={lenteOp}>
          {pasta}
        </LenteAssinatura>
      </g>
    ),
    sobre: titulo ? <Titulo texto="Pasta de Descobertas" opacidade={rampa(f, ini, 8)} /> : undefined,
  };
};

const cenaItens = (c: Ctx) =>
  cenaLenteNosItens(
    c,
    [
      {palavra: 'zíperes', ancora: ANCORA.ziper},
      {palavra: 'botões', ancora: ANCORA.botao},
      {palavra: 'fivelas', ancora: ANCORA.fivela},
      {palavra: 'cadarços', ancora: ANCORA.cadarco},
      {palavra: 'ábaco', ancora: ANCORA.abaco},
      {palavra: 'relógio', ancora: ANCORA.relogio},
    ],
    true,
  );

const cenaVerbos = (c: Ctx) =>
  cenaLenteNosItens(
    c,
    [
      {palavra: 'abrir', ancora: ANCORA.ziper},
      {palavra: 'fechar', ancora: ANCORA.fivela},
      {palavra: 'encaixar', ancora: ANCORA.encaixe},
      {palavra: 'tentar', ancora: ANCORA.fivela},
    ],
    false,
    'tentar',
  );

const cenaSorriso = (c: Ctx): Saida => {
  const {f, ini} = c;
  const s = 1.46;
  const centro = {x: 540, y: 660};
  const ponta = {x: centro.x, y: centro.y + (1592 - 470) * s};
  const calma = 1 - rampa(f, ini, 12); // regra da quietude
  const mov = idle(f, calma);
  const fAquele = quadroDa(c.linha, 'aquele', ini);
  const fSorriso = quadroDa(c.linha, 'sorriso', ini);
  const fecha = rampa(f, fAquele, 9) * (1 - rampa(f, fAquele + 24, 9));
  const sorriso = rampa(f, fSorriso, 12);
  const {rosto, bocaWH} = rostoFalando(c, {sobrancelha: {esq: 0, dir: 0, interna: 5 * fecha}, sorriso});
  rosto.piscar = fecha; // sem piscadas automáticas na quietude
  const z = 1 + 0.02 * rampa(f, ini, 90);
  return {
    palco: (
      <g transform={`translate(540 760) scale(${z}) translate(-540 -760)`}>
        <Pasta estado="aberta" x={90} y={520} escala={1.0} opacidade={0.55} filtro="url(#desfoque)" />
        <Tilia id="t-close" x={ponta.x} y={ponta.y} s={s} balanco={mov.balanco} respiracao={mov.respiracao} rosto={rosto} bocaWH={bocaWH} maoEsq={POSE.juntasEsq} maoDir={POSE.juntasDir} sombra={false} />
      </g>
    ),
  };
};

const cenaEscolha = (c: Ctx): Saida => {
  const {f, ini} = c;
  const s = 0.833;
  const ponta = {x: 250, y: 615 + (1592 - 470) * s};
  const escala = 0.78;
  const px = W - PASTA_FECHADA.w * escala - 60;
  const py = MESA_Y - PASTA_FECHADA.h * escala;
  const juntas = rampa(f, ini, 18);
  const mov = idle(f);
  const fRocco = quadroDa(c.linha, 'rocco', ini);
  const olharProduto = rampa(f, ini, 9) * (1 - rampa(f, fRocco, 9));
  const {rosto, bocaWH} = rostoFalando(c, {olhar: {x: 0.6 * olharProduto, y: 0.15 * olharProduto}});
  return {
    palco: (
      <g>
        <Mesa />
        <Pasta estado="fechada" x={px} y={py} escala={escala} />
        <Tilia
          id="t-escolha"
          x={ponta.x}
          y={ponta.y}
          s={s}
          balanco={mov.balanco}
          respiracao={mov.respiracao}
          rosto={rosto}
          bocaWH={bocaWH}
          maoEsq={misturaPt(POSE.repousoEsq, POSE.juntasEsq, juntas)}
          maoDir={misturaPt(POSE.repousoDir, POSE.juntasDir, juntas)}
          sombra={false}
        />
      </g>
    ),
    sobre: <Titulo texto="Por que a Rocco escolheu" opacidade={rampa(f, ini, 8)} />,
  };
};

const cenaFicha = (c: Ctx): Saida => {
  const {f, ini} = c;
  const escala = 0.95;
  const px = (W - PASTA_FECHADA.w * escala) / 2 + 70;
  const py = MESA_Y - PASTA_FECHADA.h * escala;
  const mov = idle(f);
  const gesto = rampa(f, ini, 16);
  const tl = centroLente(TILIA_PEQ.x, TILIA_PEQ.y, TILIA_PEQ.s);
  const {rosto, bocaWH} = rostoFalando(c, {olhar: olharPara({x: tl.cx, y: tl.cy}, {x: 540, y: 700}, 900)});
  const op = rampa(f, ini + 4, 8);
  return {
    palco: (
      <g>
        <Mesa />
        <Pasta estado="fechada" x={px} y={py} escala={escala} />
        <Tilia
          id="t-ficha"
          x={TILIA_PEQ.x}
          y={TILIA_PEQ.y}
          s={TILIA_PEQ.s}
          balanco={mov.balanco}
          respiracao={mov.respiracao}
          rosto={rosto}
          bocaWH={bocaWH}
          maoDir={misturaPt(POSE.repousoDir, POSE.apresentarDir, gesto)}
          palmaDir={gesto}
        />
      </g>
    ),
    sobre: (
      <div style={{position: 'absolute', top: 1068, width: '100%', display: 'flex', justifyContent: 'center', opacity: op}}>
        <div
          style={{
            background: COR.cremeClaro,
            border: `1.5px solid ${COR.borda}`,
            borderRadius: 24,
            padding: '18px 36px',
            fontFamily: FONTE,
            fontWeight: 500,
            fontSize: 42,
            lineHeight: 1.25,
            color: COR.tinta,
            textAlign: 'center',
          }}
        >
          3 a 6 anos · sem tela · com alças
          <div style={{fontWeight: 400, fontSize: 34, color: COR.texto}}>21,5 × 27,5 cm</div>
        </div>
      </div>
    ),
  };
};

const cenaFinal = (c: Ctx): Saida => {
  const {f, ini, fim} = c;
  const s = 0.4;
  const ponta = {x: 900, y: MESA_Y};
  const calma = 1 - rampa(f, fim - 30, 10); // parada no último segundo
  const mov = idle(f, calma);
  const fVale = quadroDa(c.linha, 'vale', ini);
  const aceno = Math.sin(Math.min(1, Math.max(0, (f - fVale) / 20)) * Math.PI) * -3;
  const aponta = rampa(f, quadroDa(c.linha, 'link', ini) - 6, 16);
  const tl = centroLente(ponta.x, ponta.y, s);
  const {rosto, bocaWH} = rostoFalando(c, {olhar: olharPara({x: tl.cx, y: tl.cy}, {x: 540, y: 1500}, 900), sorriso: 0.6});
  const escala = 0.5;
  const px = (W - PASTA_FECHADA.w * escala) / 2;
  const op = rampa(f, ini, 10);
  return {
    palco: (
      <g>
        <Mesa />
        <g opacity={op}>
          <Pasta estado="fechada" x={px} y={470} escala={escala} />
        </g>
        <Tilia
          id="t-final"
          x={ponta.x}
          y={ponta.y}
          s={s}
          balanco={mov.balanco}
          respiracao={mov.respiracao}
          inclinacao={aceno}
          rosto={rosto}
          bocaWH={bocaWH}
          maoEsq={misturaPt(POSE.repousoEsq, POSE.apontarBaixoEsq, aponta)}
          palmaEsq={aponta}
        />
      </g>
    ),
    sobre: (
      <div style={{position: 'absolute', top: 0, width: '100%', fontFamily: FONTE, textAlign: 'center', opacity: op}}>
        <div style={{position: 'absolute', top: 330, width: '100%', fontWeight: 700, fontSize: 76, letterSpacing: -1.5, color: COR.tinta}}>Rocco Kids</div>
        <div style={{position: 'absolute', top: 790, width: '100%', fontWeight: 500, fontSize: 50, color: COR.tinta}}>Pasta de Descobertas</div>
        <div style={{position: 'absolute', top: 856, width: '100%', fontWeight: 400, fontSize: 36, color: COR.terracota}}>escolhido com calma</div>
        <div style={{position: 'absolute', top: 908, width: '100%', fontWeight: 400, fontSize: 32, color: COR.texto}}>roccokids.com.br</div>
        <div style={{position: 'absolute', top: 1212, width: '100%', fontWeight: 400, fontSize: 26, color: COR.texto}}>personagem animada · voz sintética</div>
      </div>
    ),
  };
};

const CENA_FN: Record<string, (c: Ctx) => Saida> = {
  gancho: cenaGancho,
  apresentacao: cenaApresentacao,
  itens: cenaItens,
  verbos: cenaVerbos,
  sorriso: cenaSorriso,
  escolha: cenaEscolha,
  ficha: cenaFicha,
  final: cenaFinal,
};

// ---------------------------------------------------------------------------
// camadas fixas
// ---------------------------------------------------------------------------
const Fundo: React.FC<{f: number; dur: number}> = ({f, dur}) => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <div
      style={{
        position: 'absolute',
        left: -520 + 22 * (f / dur),
        top: -400,
        width: 820,
        height: 2900,
        background: COR.branco,
        opacity: 0.35,
        transform: 'rotate(24deg)',
        filter: 'blur(70px)',
      }}
    />
  </AbsoluteFill>
);

const Legenda: React.FC<{texto: string; f: number; ini: number; fim: number}> = ({texto, f, ini, fim}) => {
  const op = (ini === 0 ? 1 : rampa(f, ini, 5)) * (1 - rampa(f, fim - 5, 5));
  return (
    <div style={{position: 'absolute', top: 1062, height: 128, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: op}}>
      <div
        style={{
          maxWidth: 920,
          background: 'rgba(247,244,238,0.92)',
          border: `1.5px solid ${COR.borda}`,
          borderRadius: 30,
          padding: '12px 30px',
          fontFamily: FONTE,
          fontWeight: 500,
          fontSize: 50,
          lineHeight: 1.18,
          color: COR.tinta,
          textAlign: 'center',
          textWrap: 'balance',
        }}
      >
        {texto}
      </div>
    </div>
  );
};

export type TiliaPastaProps = {fala: Fala; audio: string; prototipo: boolean; limpo?: boolean};

export const TiliaPasta: React.FC<TiliaPastaProps> = ({fala, audio, prototipo, limpo = false}) => {
  const f = useCurrentFrame();
  const linha = useMemo(() => montarLinha(fala), [fala]);
  const idx = Math.max(0, linha.cenas.findIndex((c) => f >= c.inicio && f < c.fim));
  const cena = linha.cenas[idx];
  const ctx: Ctx = {f, ini: cena.inicio, fim: cena.fim, linha, fala};
  const saida = CENA_FN[cena.id](ctx);
  const legenda = CENAS[idx].legenda;
  const fimApres = linha.cenas[1].fim;
  const seloOp = rampa(f, 15, 8) * (1 - rampa(f, fimApres - 8, 8));
  return (
    <AbsoluteFill style={{background: COR.creme}}>
      <Fundo f={f} dur={linha.duracao} />
      <AbsoluteFill>
        <svg viewBox="0 0 1080 1920" width={1080} height={1920}>
          <defs>
            <filter id="desfoque" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation={14} />
            </filter>
          </defs>
          {saida.palco}
        </svg>
      </AbsoluteFill>
      {!limpo && saida.sobre}
      {!limpo && legenda && <Legenda texto={legenda} f={f} ini={cena.inicio} fim={cena.fim} />}
      <div style={{position: 'absolute', top: 276, width: '100%', display: 'flex', justifyContent: 'center', opacity: limpo ? 0 : seloOp}}>
        <div style={{padding: '4px 16px', borderRadius: 16, background: 'rgba(247,244,238,0.88)', fontFamily: FONTE, fontSize: 30, color: COR.texto}}>Tília · personagem animada da Rocco Kids</div>
      </div>
      {prototipo && !limpo && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            left: 40,
            padding: '8px 18px',
            borderRadius: 18,
            background: 'rgba(48,46,41,0.78)',
            color: COR.creme,
            fontFamily: FONTE,
            fontSize: 24,
          }}
        >
          PROTÓTIPO · voz de teste · produto ilustrado
        </div>
      )}
      <AbsoluteFill style={{backgroundImage: `url(${staticFile('grao.png')})`, backgroundRepeat: 'repeat', mixBlendMode: 'multiply', opacity: 0.6}} />
      <Sequence from={ATRASO_AUDIO}>
        <Audio src={staticFile(audio)} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const duracaoDe = (fala: Fala) => montarLinha(fala).duracao;
