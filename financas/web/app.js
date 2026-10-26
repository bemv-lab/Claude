/* Parceiro de Prosperidade · interface (JS puro, offline). */
"use strict";

const S = { mes: null, meses: [], cad: null, modo: "real", nDuvidas: 0, segLanc: "todos", filtros: {} };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function brl(c, sinal = false) {
  if (c === null || c === undefined) return "—";
  const v = Math.abs(c) / 100;
  const s = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (c < 0 ? "−" : sinal && c > 0 ? "+" : "") + "R$ " + s;
}
const paraInput = (c) => (c === null || c === undefined ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }).replace(/\./g, ""));
const dataBR = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const nomeMes = (m) => (m ? `${MESES[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}` : "—");
const nomeMesCurto = (m) => (m ? `${MESES[+m.slice(5, 7) - 1].slice(0, 3)}/${m.slice(2, 4)}` : "—");
const somarMes = (m, n) => { const [y, mm] = m.split("-").map(Number); const t = y * 12 + mm - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const diaSemana = (iso) => new Date(iso + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

const ICONES = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  lancamentos: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  duvidas: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  plano: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  flash: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  encontros: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  mais: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  dividas: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  importar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  esq: '<path d="M15 18l-6-6 6-6"/>', dir: '<path d="M9 18l6-6-6-6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  nuvem: '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 9z"/><path d="M12 12v6M9.5 14.5L12 12l2.5 2.5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
};
const icone = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;
const NAV = [["inicio", "Início"], ["plano", "Plano"], ["encontros", "Ações"], ["lancamentos", "Lançamentos"], ["flash", "Flash"], ["duvidas", "Dúvidas"], ["dividas", "Dívidas"], ["importar", "Importar"], ["ajustes", "Ajustes"]];
const NAV_CELULAR = ["inicio", "plano", "lancamentos", "encontros"];

/* ------------------------------------------------------------------ infraestrutura */
async function api(caminho, { metodo = "GET", corpo, bruto, silencioso } = {}) {
  const op = { method: metodo, headers: {} };
  if (bruto) { op.body = bruto; op.headers["Content-Type"] = "application/octet-stream"; }
  else if (corpo !== undefined) { op.body = JSON.stringify(corpo); op.headers["Content-Type"] = "application/json"; }
  const r = await fetch(caminho, op);
  if (r.status === 401) { location.href = "/entrar"; throw new Error("PIN"); }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(dados.erro || "Algo deu errado"); if (!silencioso) toast(e.message, true); throw e; }
  return dados;
}
let tToast;
function toast(msg, erro = false) {
  const t = $("#toast"); t.textContent = msg; t.style.background = erro ? "var(--critico)" : ""; t.classList.add("visivel");
  clearTimeout(tToast); tToast = setTimeout(() => t.classList.remove("visivel"), erro ? 5000 : 3200);
}
function abrirModal(html, aoMontar) {
  const d = $("#modal"); $("#modal-corpo").innerHTML = html; d.showModal();
  $$("[data-fechar]", d).forEach((b) => b.addEventListener("click", () => d.close()));
  aoMontar && aoMontar($("#modal-corpo"));
}
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") e.target.close(); });
const form = (el) => Object.fromEntries(new FormData(el).entries());

function opcoes(lista, sel, vazio) {
  return (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : "") +
    lista.map((o) => `<option value="${esc(o.id)}" ${String(o.id) === String(sel ?? "") ? "selected" : ""}>${esc(o.nome)}</option>`).join("");
}
const catsDe = (tipos) => S.cad.categorias.filter((c) => tipos.includes(c.tipo));

async function carregarCadastros() { S.cad = await api("/api/cadastros"); }
async function carregarEstado() {
  const e = await api("/api/estado"); S.modo = e.modo; S.hoje = e.hoje;
  $("#selo-demo").hidden = e.modo !== "demo";
  const m = await api("/api/meses"); S.meses = m.meses;
  if (!S.mes) S.mes = e.hoje.slice(0, 7);
}
async function atualizarContador() {
  const h = await api("/api/duvidas", { silencioso: true }).catch(() => null);
  S.nDuvidas = h ? h.total : 0; montarNav();
}

function montarNav() {
  const atual = (location.hash.replace("#/", "") || "inicio").split("?")[0];
  const item = ([id, nome]) => `<a href="#/${id}" class="${atual === id ? "ativo" : ""}">${icone(id)}<span>${nome}</span>${id === "duvidas" && S.nDuvidas ? `<span class="contador">${S.nDuvidas}</span>` : ""}</a>`;
  $("#menu").innerHTML = NAV.map(item).join("");
  const resto = NAV.filter(([id]) => !NAV_CELULAR.includes(id));
  $("#abas").innerHTML = NAV.filter(([id]) => NAV_CELULAR.includes(id)).map(item).join("") +
    `<a href="#" id="aba-mais" class="${resto.some(([id]) => id === atual) ? "ativo" : ""}">${icone("mais")}<span>Mais</span>${S.nDuvidas ? `<span class="contador">${S.nDuvidas}</span>` : ""}</a>`;
  $("#aba-mais").addEventListener("click", (e) => {
    e.preventDefault();
    abrirModal(`<h3>Mais</h3><nav class="menu-mais">${resto.map(item).join("")}</nav>`, (m) => $$("a", m).forEach((a) => a.addEventListener("click", () => $("#modal").close())));
  });
}
function montarMes(visivel) {
  const el = $("#mes-nav");
  if (!visivel) { el.innerHTML = ""; return; }
  el.innerHTML = `<button class="btn-icone" data-m="-1" aria-label="Mês anterior">${icone("esq")}</button>
    <h1>${esc(nomeMes(S.mes).replace(/^./, (c) => c.toUpperCase()))}</h1><button class="btn-icone" data-m="1" aria-label="Próximo mês">${icone("dir")}</button>`;
  $$("[data-m]", el).forEach((b) => b.addEventListener("click", () => { S.mes = somarMes(S.mes, +b.dataset.m); render(); }));
}

const TELAS = {};
async function render() {
  const nome = (location.hash.replace("#/", "") || "inicio").split("?")[0];
  const tela = TELAS[nome] ? nome : "inicio";
  if ($("#modal").open) $("#modal").close();
  montarNav();
  montarMes(["inicio", "lancamentos"].includes(tela));
  const el = $("#tela");
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  try { await TELAS[tela](el); } catch (e) { if (e.message !== "PIN") el.innerHTML = `<div class="cartao vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`; }
}

/* ------------------------------------------------------------------ Início */
const mesAtual = () => (S.hoje || new Date().toISOString()).slice(0, 7);
const ORIGEM = { renda: "entrada fixa", contrato: "contrato", conta_fixa: "conta fixa", variavel: "estimativa", manual: "lançado por vocês" };
const pct = (v) => `${Math.round(v * 100)}%`;

function fluxoHTML(rotulo, feito, falta, total, cls, nomeFeito, nomeFalta) {
  const p = total ? Math.min(1, feito / total) : 0;
  return `<div class="fluxo-item">
    <div class="fluxo-cab"><span>${rotulo}</span><b class="num">${brl(total)}</b></div>
    <div class="fluxo-barra ${cls}" role="img" aria-label="${rotulo}: ${nomeFeito} ${brl(feito)}, ${nomeFalta} ${brl(falta)}"><i style="width:${p * 100}%"></i></div>
    <div class="fluxo-leg"><span><i class="tecla ${cls}"></i>${nomeFeito} <b class="num">${brl(feito)}</b></span><span><i class="tecla ${cls} vazia"></i>${nomeFalta} <b class="num">${brl(falta)}</b></span></div>
  </div>`;
}

function previstoHTML(i) {
  const entrada = i.valor > 0;
  const st = i.status === "cancelado" ? `<span class="tag">não vai acontecer${i.ajuste_sempre ? " (sempre)" : ""}</span>`
    : i.status === "realizado" ? `<span class="tag ok">✓ ${entrada ? "recebido" : "pago"}</span>`
    : i.status === "parcial" ? `<span class="tag duv">entrou parcial</span>`
    : i.status === "nao_entrou" ? `<span class="tag duv">não entrou</span>`
    : i.realizado ? `<span class="tag duv">falta ${brl(Math.abs(i.falta))}</span>` : `<span class="tag duv">${entrada ? "a receber" : "a pagar"}</span>`;
  return `<div class="previsto ${i.status === "cancelado" ? "riscado" : ""}">
    <span class="sinal ${entrada ? "entrada" : "saida"}" aria-hidden="true">${entrada ? "↓" : "↑"}</span>
    <div class="previsto-txt"><b>${esc(i.descricao)}</b>
      <small>${i.dia ? `dia ${i.dia} · ` : ""}${ORIGEM[i.origem] || ""}${i.forma ? ` · ${esc(i.forma)}` : ""}${i.repete ? ` · todo mês${i.ate && i.ate !== "9999-12" ? ` até ${nomeMesCurto(i.ate)}` : ""}` : ""}${i.ajustado ? " · ajustado" : ""}${i.observacao ? ` · <span title="${esc(i.observacao)}">ℹ︎ obs.</span>` : ""}</small></div>
    <div class="previsto-val"><b class="num">${brl(i.valor, true)}</b>${st}</div>
    <button class="btn-texto" data-prev="${esc(i.chave_auto || "m" + i.id)}">Ajustar</button></div>`;
}

const ESTADO_RENDA = { recebido: ["recebido", "ok"], a_receber: ["a receber", "duv"], parcial: ["entrou parcial", "duv"], nao_entrou: ["não entrou", "duv"] };
function rendaHTML(r) {
  const [txt, cls] = ESTADO_RENDA[r.status] || ["", ""];
  const quanto = r.status === "recebido" ? brl(r.recebido) : r.status === "a_receber" ? `falta ${brl(r.falta)}` : r.status === "parcial" ? `${brl(r.recebido)} de ${brl(r.valor)}` : "";
  return `<div class="previsto">
    <span class="sinal entrada" aria-hidden="true">↓</span>
    <div class="previsto-txt"><b>${esc(r.descricao)}</b>
      <small>todo dia ${r.dia}${r.pessoa ? ` · ${esc(r.pessoa)}` : ""}${r.observacao ? ` · <span title="${esc(r.observacao)}">ℹ︎ obs.</span>` : ""}</small></div>
    <div class="previsto-val"><b class="num">${brl(r.valor, true)}</b><span class="tag ${cls}">${txt}${quanto ? " · " + quanto : ""}</span></div>
    <button class="btn-texto" data-renda="${r.id}">Editar</button></div>`;
}

function editarRenda(r = {}) {
  const novo = !r.id;
  abrirModal(`<h3>${novo ? "Nova entrada fixa" : "Editar entrada fixa"}</h3>
    <p class="mudo" style="margin:-6px 0 0">Mudança de valor ou de dia vale a partir do mês escolhido; os meses anteriores ficam como estavam.</p>
    <form id="f-renda" class="grade-form">
      <label class="campo">Nome<input name="descricao" value="${esc(r.descricao || "")}" placeholder="Ex.: Salário Lucas"></label>
      <label class="campo">Texto no extrato <small>como aparece no banco</small><input name="padrao" value="${esc(r.padrao || "")}" placeholder="Ex.: REMUNERACAO/SALARIO"></label>
      <label class="campo">Dia do mês<input type="number" name="dia" min="1" max="31" value="${esc(r.dia ?? "")}"></label>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${paraInput(r.valor)}"></label>
      <label class="campo">Vale a partir de<input type="month" name="a_partir" value="${esc(S.mes)}"></label>
    </form>
    <div class="modal-acoes">${novo ? "" : `<button class="btn" id="enc-renda" style="margin-right:auto">Encerrar a partir de</button>`}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-renda">Salvar</button></div>`, (m) => {
    $("#ok-renda", m).addEventListener("click", async () => {
      const v = form($("#f-renda", m));
      if (novo) await api("/api/rendas", { metodo: "POST", corpo: { ...v, inicio: v.a_partir } });
      else await api(`/api/rendas/${r.id}`, { metodo: "PATCH", corpo: v });
      $("#modal").close(); toast("Entrada salva"); render();
    });
    $("#enc-renda", m)?.addEventListener("click", async () => {
      await api(`/api/rendas/${r.id}/encerrar`, { metodo: "POST", corpo: { a_partir: $("[name=a_partir]", m).value } });
      $("#modal").close(); toast("Entrada encerrada a partir do mês escolhido"); render();
    });
  });
}

TELAS.inicio = async (el) => {
  const h = await api(`/api/home?mes=${S.mes}`);
  if (h.vazio) {
    el.innerHTML = `<div class="cartao vazio"><div class="grande">🌱</div><h3>Vamos começar</h3>
      <p>Ainda não há lançamentos. Vocês podem ver tudo funcionando com dados fictícios<br>ou importar os extratos de verdade.</p>
      <div class="modal-acoes" style="justify-content:center;margin-top:18px">
        ${S.modo === "real" ? `<button class="btn" id="ir-demo">Ver o modo demo</button>` : ""}
        <a class="btn btn-primario" href="#/importar">Importar extratos</a></div></div>`;
    $("#ir-demo")?.addEventListener("click", () => trocarModo("demo"));
    return;
  }
  const o = h.orcamento, E = h.entradas, X = h.saidas, sa = h.saude;
  const passado = S.mes < mesAtual();
  const nome = nomeMes(S.mes);
  const usado = o.limite ? Math.min(1.2, o.gasto / o.limite) : 0;
  const varSaldo = h.saldo - h.saldo_mes_anterior;
  const fora = h.previstos.filter((i) => i.origem !== "renda");          // entradas fixas têm card próprio
  const ativos = fora.filter((i) => i.status === "previsto");
  const feitos = fora.filter((i) => i.status === "realizado");
  const cancel = fora.filter((i) => i.status === "cancelado");
  h.categorias.forEach((c) => { c.ref = c.orcamento || c.media; c.refNome = c.orcamento ? "orçado" : "média"; });
  const maxCat = Math.max(1, ...h.categorias.map((c) => Math.max(c.total, c.ref || 0)));
  el.innerHTML = `<div class="pilha">
    <section class="painel-heroi">
      <div class="heroi-topo">
        <div><span class="rotulo-claro">Resultado de ${esc(nome)}</span><div class="valor-heroi">${brl(h.saldo_previsto, true)}</div></div>
        <span class="saude-chip ${sa.nivel}"><i aria-hidden="true"></i>${esc(sa.titulo)}</span>
      </div>
      <div class="fluxo">
        ${fluxoHTML("Entradas", E.recebido, E.a_receber, E.previsto, "entrada", "recebido", "a receber")}
        ${fluxoHTML("Saídas", X.pago, X.a_pagar, X.previsto, "saida", "pago", "a pagar")}
      </div>
      <div class="fech"><span>Fechamento das contas</span><b class="num">${brl(h.fechamento, true)}</b></div>
    </section>

    <div class="kpis">
      <button class="kpi" data-ajustar="entrada"><span class="rotulo">Entradas</span><b class="num">${brl(E.previsto)}</b>
        <small>${brl(E.recebido)} recebido · ${brl(E.a_receber)} a receber</small><span class="kpi-acao">Ajustar</span></button>
      <button class="kpi" data-ajustar="saida"><span class="rotulo">Saídas</span><b class="num">${brl(X.previsto)}</b>
        <small>${brl(X.pago)} pago · ${brl(X.a_pagar)} a pagar</small><span class="kpi-acao">Ajustar</span></button>
      <button class="kpi" data-ajustar="previstos"><span class="rotulo">Provisionado (líquido)</span><b class="num">${brl(h.provisionado.entradas - h.provisionado.saidas, true)}</b>
        <small>${brl(h.provisionado.saidas)} a pagar · ${brl(h.provisionado.entradas)} a receber</small><span class="kpi-acao">Lançar</span></button>
      <a class="kpi" href="#/plano"><span class="rotulo">Ainda podem gastar</span><b class="num">${brl(Math.max(0, o.restante))}</b>
        <small>${o.restante < 0 ? `passou ${brl(-o.restante)} do orçamento` : o.dias_restantes ? `${brl(o.por_dia)} por dia · ${o.dias_restantes} dias` : "do orçamento do mês"}</small><span class="kpi-acao">Orçamento</span></a>
    </div>

    <div class="cartao">
      <div class="cartao-cab"><h2>Entradas fixas</h2><button class="btn" data-nova-renda>+ Nova entrada</button></div>
      <div class="previstos">${h.rendas.map(rendaHTML).join("") || `<p class="mudo">Nenhuma entrada fixa cadastrada.</p>`}</div>
      <p class="nota">Salários e rendas que se repetem todo mês. Valor e dia são editáveis; a mudança vale a partir do mês escolhido. O que entra no extrato é ligado sozinho pelo texto do banco.</p>
    </div>
    <div class="grade g2">
      <div class="cartao">
        <div class="cartao-cab"><h2>Previstos de ${esc(nome)}</h2><button class="btn" data-novo-prev>+ Lançar previsto</button></div>
        ${ativos.length ? `<div class="previstos">${ativos.map(previstoHTML).join("")}</div>` : `<p class="mudo">Nada pendente: tudo o que estava previsto já aconteceu.</p>`}
        ${feitos.length ? `<details class="mais"><summary>${feitos.length} já ${feitos.length > 1 ? "resolvidos" : "resolvido"} (${brl(feitos.reduce((s, i) => s + Math.max(0, i.valor), 0))} recebidos · ${brl(-feitos.reduce((s, i) => s + Math.min(0, i.valor), 0))} pagos)</summary><div class="previstos">${feitos.map(previstoHTML).join("")}</div></details>` : ""}
        ${cancel.length ? `<details class="mais"><summary>${cancel.length} que não vão acontecer</summary><div class="previstos">${cancel.map(previstoHTML).join("")}</div></details>` : ""}
        <p class="nota">Salários, contratos e contas que se repetem entram sozinhos. Ajustem quando algo mudar (ex.: um adiantamento) e lancem o que não é rotina.</p>
      </div>
      <div class="cartao">
        <div class="cartao-cab"><h2>Orçamento do mês</h2><a class="btn-texto" href="#/plano">Ajustar por categoria</a></div>
        <div class="orc-num"><b class="num">${brl(o.gasto)}</b><span class="mudo"> de ${brl(o.limite)}</span></div>
        <div class="medidor ${usado > 1 ? "estouro" : usado > o.mes_decorrido + 0.1 ? "perto" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(usado * 100)}" aria-label="Orçamento usado">
          <i style="width:${Math.min(1, usado) * 100}%"></i>${o.mes_decorrido && o.mes_decorrido < 1 ? `<span class="marca-ritmo" style="left:${o.mes_decorrido * 100}%" title="ritmo do mês"></span>` : ""}</div>
        <p style="margin:12px 0 0;font-size:14px">${o.limite ? `Usaram <b>${pct(o.gasto / o.limite)}</b> do orçamento${o.mes_decorrido && o.mes_decorrido < 1 ? ` com <b>${pct(o.mes_decorrido)}</b> do mês passado` : ""}.` : "Ainda não há orçado por categoria."}</p>
        <p class="nota">O orçamento é a <b>soma do orçado de cada categoria</b> (${o.n_categorias} categorias), incluindo o que é pago com o Flash. Dívidas ficam fora: elas têm plano próprio.
          ${o.realista ? `Ele cobre o gasto típico de vocês (${brl(o.tipico)} por mês).` : `<span style="color:var(--atencao)">Ele está abaixo do gasto típico de vocês (${brl(o.tipico)} por mês): ajustem no Plano.</span>`}</p>
      </div>
    </div>

    <div class="cartao">
      <div class="cartao-cab"><h2>Entradas e saídas, mês a mês</h2>
        <div class="legenda"><span><i class="tecla entrada"></i>Entradas</span><span><i class="tecla saida"></i>Saídas</span></div></div>
      <div class="grafico" id="graf-meses"></div>
      <details class="mais"><summary>Ver os números</summary><div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead>
        <tbody>${h.serie.map((m) => `<tr><td>${nomeMesCurto(m.mes)}</td><td class="num">${brl(m.entradas)}</td><td class="num">${brl(m.saidas)}</td><td class="num">${brl(m.saldo, true)}</td></tr>`).join("")}</tbody></table></div></details>
    </div>

    <div class="grade g2">
      <div class="cartao">
        <div class="cartao-cab"><h2>O que merece atenção</h2>${h.alertas.length ? `<a class="btn-texto" href="#/ajustes">Configurar</a>` : ""}</div>
        ${h.alertas.length ? h.alertas.map(alertaHTML).join("") : `<p class="mudo">Nenhum alerta agora. Bom sinal. 🌿</p>`}
      </div>
      <div class="cartao">
        <div class="cartao-cab"><h2>Para onde foi o dinheiro</h2><a class="btn-texto" href="#/lancamentos">Ver lançamentos</a></div>
        ${h.categorias.length ? `<div class="barras">${h.categorias.map((c) => `
          <div class="barra-linha" title="${esc(c.nome)}: ${brl(c.total)} (${c.qtd} lançamentos)${c.ref ? ` · ${c.refNome} ${brl(c.ref)}` : ""}">
            <span>${esc(c.nome)}${c.orcamento && c.total > c.orcamento ? ` <span class="tag duv">passou do orçado</span>` : ""}</span><span class="num">${brl(c.total)}</span>
            <div class="trilho"><i style="width:${(c.total / maxCat) * 100}%"></i>${c.ref ? `<span class="media" style="left:${(c.ref / maxCat) * 100}%"></span>` : ""}</div>
          </div>`).join("")}</div>
          <div class="legenda-media"><i></i> orçado da categoria (sem orçado: média dos 3 meses anteriores)</div>` : `<p class="mudo">Sem gastos neste mês.</p>`}
      </div>
    </div>

    <div class="grade g4">
      <a class="cartao estat" href="#/dividas"><span class="rotulo">Dívidas em aberto</span>
        <span class="valor-grande num">${brl(h.dividas.total)}</span>
        <span class="mudo" style="font-size:13px">${brl(h.dividas.mensal)} por mês em parcelas fixas</span></a>
      <a class="cartao estat" href="#/lancamentos?parcelados"><span class="rotulo">Parcelas pagas em ${esc(nomeMesCurto(S.mes))}</span>
        <span class="valor-grande num">${brl(h.parcelas_mes.valor)}</span>
        <span class="mudo" style="font-size:13px">${h.parcelas_mes.qtd} parcela(s) · ${brl(h.parcelas_restante)} ainda por vir</span></a>
      <a class="cartao estat" href="#/duvidas"><span class="rotulo">Fila de dúvidas</span>
        <span class="valor-grande num">${h.n_duvidas}</span>
        <span class="mudo" style="font-size:13px">${h.n_duvidas ? "lançamento(s) esperando categoria" : "tudo classificado ✨"}</span></a>
      <div class="cartao estat"><span class="rotulo">Benefício (Flash)</span>
        <span class="valor-grande num">${h.beneficios.length ? brl(h.beneficios[0].saldo) : "—"}</span>
        <span class="mudo" style="font-size:13px">saldo, fora da renda livre</span></div>
    </div>
    ${h.negocio ? `<p class="mudo" style="font-size:13px">Gastos do negócio no mês (separados do pessoal): ${brl(h.negocio)}.</p>` : ""}
  </div>`;
  const porChave = Object.fromEntries(h.previstos.map((i) => [i.chave_auto || "m" + i.id, i]));
  $$("[data-prev]", el).forEach((b) => b.addEventListener("click", () => editarPrevisto(porChave[b.dataset.prev], render)));
  $("[data-novo-prev]", el).addEventListener("click", () => novoPrevisto({ mes: S.mes }, render));
  $("[data-nova-renda]", el).addEventListener("click", () => editarRenda({}));
  $$("[data-renda]", el).forEach((b) => b.addEventListener("click", () => editarRenda(h.rendas.find((x) => x.id === +b.dataset.renda))));
  $$("[data-ajustar]", el).forEach((b) => b.addEventListener("click", () => {
    const tipo = b.dataset.ajustar;
    if (tipo === "previstos") return novoPrevisto({ mes: S.mes }, render);
    const lista = h.previstos.filter((i) => (tipo === "entrada" ? i.valor > 0 : i.valor < 0));
    abrirModal(`<h3>${tipo === "entrada" ? "Entradas" : "Saídas"} previstas de ${esc(nome)}</h3>
      <p class="mudo" style="margin:-6px 0 0">${tipo === "entrada" ? `Já entraram ${brl(E.recebido)} nos extratos.` : `Já saíram ${brl(X.pago)} nos extratos.`} Ajustem o que ainda vai ${tipo === "entrada" ? "entrar" : "sair"}, ou lancem algo fora da rotina.</p>
      <div class="previstos">${lista.map(previstoHTML).join("") || `<p class="mudo">Nada previsto.</p>`}</div>
      <div class="modal-acoes"><button class="btn" data-fechar>Fechar</button><button class="btn btn-primario" id="novo-no-modal">+ Lançar ${tipo === "entrada" ? "entrada" : "saída"}</button></div>`, (m) => {
      $$("[data-prev]", m).forEach((x) => x.addEventListener("click", () => editarPrevisto(porChave[x.dataset.prev], render)));
      $("#novo-no-modal", m).addEventListener("click", () => novoPrevisto({ mes: S.mes, sentido: tipo }, render));
    });
  }));
  graficoMeses($("#graf-meses", el), h.serie);
};

function novoPrevisto(p, depois) {
  const sentido = p.sentido || (p.valor > 0 ? "entrada" : "saida");
  abrirModal(`<h3>${p.id ? "Editar previsto" : "Lançar previsto"}</h3>
    <p class="mudo" style="margin:-6px 0 0">Algo que vocês esperam receber ou pagar e que ainda não está no extrato: um freela, um presente, o IPVA, uma consulta.</p>
    <form id="f-prev" class="grade-form">
      <div class="segmentos" style="grid-column:1/-1;justify-self:start" id="seg-sentido">
        <button type="button" data-s="saida" class="${sentido === "saida" ? "ativo" : ""}">Saída</button><button type="button" data-s="entrada" class="${sentido === "entrada" ? "ativo" : ""}">Entrada</button></div>
      <input type="hidden" name="sentido" value="${sentido}">
      <label class="campo" style="grid-column:1/-1">Descrição<input name="descricao" value="${esc(p.descricao || "")}" placeholder="Ex.: Freela de design, IPVA, presente da Joana"></label>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${p.valor ? paraInput(Math.abs(p.valor)) : ""}" placeholder="0,00"></label>
      <label class="campo">Mês<input type="month" name="mes" value="${esc(p.mes_inicio || p.mes || S.mes)}"></label>
      <label class="campo">Dia <small>opcional</small><input type="number" name="dia" min="1" max="31" value="${esc(p.dia ?? "")}"></label>
      <label class="campo">Repetir<select name="repetir"><option value="">Só neste mês</option><option value="ate" ${p.ate && p.ate !== "9999-12" ? "selected" : ""}>Todo mês até…</option><option value="sempre" ${p.ate === "9999-12" ? "selected" : ""}>Todo mês, sem fim</option></select></label>
      <label class="campo" id="campo-ate" ${p.ate && p.ate !== "9999-12" ? "" : "hidden"}>Até<input type="month" name="ate" value="${esc(p.ate && p.ate !== "9999-12" ? p.ate : "")}"></label>
      <label class="campo">Categoria <small>opcional</small><select name="categoria_id">${opcoes(S.cad.categorias, p.categoria_id, "—")}</select></label>
      <label style="display:flex;gap:10px;align-items:center;grid-column:1/-1;font-size:14px"><span class="chave"><input type="checkbox" name="no_plano" ${p.no_plano === false ? "" : "checked"}><span></span></span> Somar na projeção do Plano (é fora do gasto normal)</label>
      <label class="campo" style="grid-column:1/-1">Observação<input name="observacao" value="${esc(p.observacao || "")}"></label>
    </form>
    <div class="modal-acoes">${p.id ? `<button class="btn" id="apagar-prev" style="margin-right:auto">Apagar</button>` : ""}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-prev">Salvar</button></div>`, (m) => {
    $$("#seg-sentido button", m).forEach((b) => b.addEventListener("click", () => {
      $$("#seg-sentido button", m).forEach((x) => x.classList.toggle("ativo", x === b)); $("[name=sentido]", m).value = b.dataset.s; }));
    $("[name=repetir]", m).addEventListener("change", (e) => { $("#campo-ate", m).hidden = e.target.value !== "ate"; });
    $("#ok-prev", m).addEventListener("click", async () => {
      const v = form($("#f-prev", m));
      v.ate = v.repetir === "sempre" ? "9999-12" : v.repetir === "ate" ? v.ate : null;
      v.no_plano = !!v.no_plano; delete v.repetir;
      await api(p.id ? `/api/previstos/${p.id}` : "/api/previstos", { metodo: p.id ? "PATCH" : "POST", corpo: v });
      $("#modal").close(); toast("Previsto salvo"); depois();
    });
    $("#apagar-prev", m)?.addEventListener("click", async () => { await api(`/api/previstos/${p.id}`, { metodo: "DELETE" }); $("#modal").close(); toast("Apagado"); depois(); });
  });
}

function editarPrevisto(i, depois) {
  if (i.manual) return novoPrevisto(i, depois);
  const entrada = i.valor > 0;
  const salvar = async (corpo) => { await api("/api/previstos", { metodo: "POST", corpo: { chave_auto: i.chave_auto, mes: S.mes, descricao: i.descricao, ...corpo } }); $("#modal").close(); toast("Ajuste salvo"); depois(); };
  abrirModal(`<h3>${esc(i.descricao)}</h3>
    <p class="mudo" style="margin:-6px 0 0">Previsto automaticamente (${ORIGEM[i.origem]}): ${brl(i.valor, true)}. Nos extratos deste mês: ${brl(i.realizado)}.</p>
    <form id="f-aj" class="grade-form"><label class="campo">Valor esperado neste mês (R$)<input name="valor" inputmode="decimal" value="${paraInput(Math.abs(i.valor))}"></label></form>
    <div class="modal-acoes" style="justify-content:flex-start;flex-wrap:wrap">
      <button class="btn btn-primario" id="aj-valor">Usar este valor</button>
      <button class="btn" id="aj-feito">Já ${entrada ? "recebido" : "pago"}</button>
      <button class="btn" id="aj-nao">Não vai acontecer este mês</button>
      <button class="btn" id="aj-nunca">Parar de prever</button>
      ${i.ajuste_id ? `<button class="btn-texto" id="aj-desfazer">Desfazer ajuste</button>` : ""}</div>`, (m) => {
    $("#aj-valor", m).addEventListener("click", () => salvar({ valor: $("[name=valor]", m).value, sentido: entrada ? "entrada" : "saida" }));
    $("#aj-feito", m).addEventListener("click", () => salvar({ valor: i.valor, status: "realizado" }));
    $("#aj-nao", m).addEventListener("click", () => salvar({ valor: 0, status: "cancelado" }));
    $("#aj-nunca", m).addEventListener("click", () => salvar({ valor: 0, status: "cancelado", mes: "*" }));
    $("#aj-desfazer", m)?.addEventListener("click", async () => { await api(`/api/previstos/${i.ajuste_id}`, { metodo: "DELETE" }); $("#modal").close(); depois(); });
  });
}

function graficoMeses(box, serie) {
  if (!serie.length) { box.innerHTML = `<p class="mudo">Sem meses para comparar ainda.</p>`; return; }
  const W = Math.max(280, box.clientWidth), H = 220, topo = 22, base = 26, esq = 48;
  const max = Math.max(1, ...serie.flatMap((m) => [m.entradas, m.saidas]));
  const passoY = passoBonito(max / 3), maxY = Math.ceil(max / passoY) * passoY;
  const y = (v) => topo + (1 - v / maxY) * (H - topo - base);
  const banda = (W - esq) / serie.length, larg = Math.min(22, banda * 0.28), gap = 2;
  const col = (x, v, cor) => { const yy = y(v), r = Math.min(4, y(0) - yy); return `<path d="M${x},${y(0)} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + larg - r} Q${x + larg},${yy} ${x + larg},${yy + r} V${y(0)} Z" fill="var(${cor})"/>`; };
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Entradas e saídas por mês (números na tabela abaixo)">`;
  for (let v = 0; v <= maxY + 1; v += passoY) svg += `<line class="${v ? "grade-y" : "eixo"}" x1="${esq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${esq - 8}" y="${y(v) + 4}" text-anchor="end">${compacto(v)}</text>`;
  serie.forEach((m, i) => {
    const cx = esq + banda * i + banda / 2;
    svg += `<g class="col" tabindex="0" data-i="${i}"><rect x="${cx - banda / 2}" y="0" width="${banda}" height="${H - 20}" fill="transparent"/>
      ${col(cx - larg - gap / 2, m.entradas, "--serie-entrada")}${col(cx + gap / 2, m.saidas, "--serie-saida")}</g>
      <text x="${cx}" y="${H - 4}" text-anchor="middle">${nomeMesCurto(m.mes)}</text>`;
  });
  box.innerHTML = svg + "</svg>";
  $$(".col", box).forEach((g) => {
    const m = serie[+g.dataset.i], cx = esq + banda * +g.dataset.i + banda / 2;
    const ver = () => mostrarDica(box, cx, y(Math.max(m.entradas, m.saidas)), `${brl(m.saldo, true)}`, `${nomeMes(m.mes)} · entrou ${brl(m.entradas)} · saiu ${brl(m.saidas)}`);
    g.addEventListener("pointerenter", ver); g.addEventListener("focus", ver);
    g.addEventListener("pointerleave", () => esconderDica(box)); g.addEventListener("blur", () => esconderDica(box));
  });
}

function alertaHTML(a) {
  const nivel = { 3: "Importante", 2: "Atenção", 1: "Aviso" }[a.severidade];
  return `<div class="alerta s${a.severidade}"><span class="faixa" aria-hidden="true"></span>
    <div><b><span class="sr">${nivel}: </span>${esc(a.titulo)}</b><p>${esc(a.mensagem)}</p>${a.acao ? `<p class="acao">→ ${esc(a.acao)}</p>` : ""}</div>
    <button class="btn-icone" title="Dispensar" aria-label="Dispensar alerta" onclick="dispensar(${a.id}, this)">${icone("x")}</button></div>`;
}
async function dispensar(id, btn) {
  await api(`/api/alertas/${id}/dispensar`, { metodo: "POST" });
  btn.closest(".alerta").style.opacity = 0; setTimeout(render, 250);
}

/* ------------------------------------------------------------------ Plano (Fase 2) */
S.plano = { meses: 3, extra: null, bola: true, liberar: "" };
const compacto = (c, sinal = false) => {
  const a = Math.abs(c) / 100;
  const s = a >= 1000 ? `${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : a.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return (c < 0 ? "−" : sinal && c > 0 ? "+" : "") + s;
};
const passoBonito = (v) => { const e = 10 ** Math.floor(Math.log10(Math.max(v, 1))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };

TELAS.plano = async (el) => {
  const P = S.plano;
  const qs = new URLSearchParams({ meses: P.meses, bola: P.bola ? "1" : "0" });
  if (P.extra !== null) qs.set("extra", P.extra);
  if (P.liberar) qs.set("liberar", P.liberar);
  const d = await api(`/api/plano?${qs}`);
  const pr = d.projecao, q = d.quitacao, o = d.orcamento, se = d.sem_extra;
  if (!pr.meses_referencia.length) {
    el.innerHTML = `<div class="cartao vazio"><div class="grande">🧭</div><h3>Ainda sem base para planejar</h3><p>O plano usa os últimos meses completos de gastos. Importem os extratos e voltem aqui.</p></div>`;
    return;
  }
  const ref = pr.meses_referencia.map(nomeMesCurto).join(", ");
  const m1 = pr.meses[0], ult = pr.meses[pr.meses.length - 1];
  const linhaProj = (rotulo, campo, sinal = -1, cls = "") => `<tr class="${cls}"><td>${rotulo}</td>${pr.meses.map((m) => `<td class="num">${brl(sinal * m[campo], cls !== "")}</td>`).join("")}</tr>`;
  const livre = (x) => (x.livre_em ? nomeMesCurto(x.livre_em) : `mais de ${Math.round(x.limite_meses / 12)} anos`);
  const ganhoMeses = q.livre_em && se.livre_em ? (+se.livre_em.slice(0, 4) * 12 + +se.livre_em.slice(5)) - (+q.livre_em.slice(0, 4) * 12 + +q.livre_em.slice(5)) : null;

  el.innerHTML = `<div class="pilha">
    <div class="plano-intro"><h2 style="font-size:22px">Plano</h2>
      <p class="mudo">Feito com o gasto real de ${esc(ref)}. É estimativa: muda a cada importação e melhora com o tempo.</p></div>

    <div class="cartao">
      <div class="cartao-cab"><h2>Próximos meses</h2>
        <div class="segmentos" id="seg-meses">${[3, 6, 12].map((n) => `<button data-n="${n}" class="${P.meses === n ? "ativo" : ""}">${n} meses</button>`).join("")}</div></div>
      <div class="grade g2" style="margin-bottom:8px">
        <div class="estat"><span class="rotulo">Sobra prevista em ${esc(nomeMes(m1.mes))}</span>
          <span class="valor-grande ${m1.resultado >= 0 ? "pos" : ""}">${brl(m1.resultado, true)}</span>
          <span class="mudo" style="font-size:13px">${m1.resultado >= 0 ? "depois de todas as contas, parcelas e contratos" : "o mês típico não fecha: vejam o orçamento abaixo"}</span></div>
        <div class="estat"><span class="rotulo">Somando os ${pr.meses.length} meses</span>
          <span class="valor-grande">${brl(ult.acumulado, true)}</span>
          <span class="mudo" style="font-size:13px">${pr.primeiro_positivo && pr.primeiro_positivo !== m1.mes ? `fica positivo a partir de ${nomeMesCurto(pr.primeiro_positivo)}` : "se não abrirem parcelas novas"}</span></div>
      </div>
      <div class="grafico" id="graf-proj"></div>
      <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Por mês</th>${pr.meses.map((m) => `<th class="num">${nomeMesCurto(m.mes)}</th>`).join("")}</tr></thead><tbody>
        ${linhaProj("Renda típica", "renda", 1)}
        ${linhaProj("Dia a dia", "dia_a_dia")}
        ${linhaProj("Parcelas de cartão já feitas", "parcelas")}
        ${linhaProj("Dívidas com parcela fixa", "dividas")}
        ${pr.meses.some((m) => m.previstos_entradas) ? linhaProj("Entradas fora da rotina", "previstos_entradas", 1) : ""}
        ${pr.meses.some((m) => m.previstos_saidas) ? linhaProj("Saídas fora da rotina", "previstos_saidas") : ""}
        ${linhaProj("Resultado do mês", "resultado", 1, "linha-resultado")}
        ${linhaProj("Acumulado", "acumulado", 1, "mudo")}
      </tbody></table></div>
      <p class="nota">Renda típica: ${pr.renda.informada ? "valor informado em Ajustes" : pr.renda.fontes.filter((f) => f.tipico).map((f) => `${esc(f.nome)} ${brl(f.tipico)}`).join(" + ")}.
        Dia a dia: o que não é parcela nem dívida, com mediana nas contas essenciais (um mês com dois aluguéis não puxa a conta) e média no resto.
        O Flash fica de fora dos dois lados. Parcelas e contratos seguem o calendário de cada um, então o alívio quando terminam já aparece aqui.</p>
    </div>

    <div class="cartao">
      <div class="cartao-cab"><h2>Previstos fora da rotina</h2><button class="btn" id="novo-prev-plano">+ Lançar previsto</button></div>
      ${(() => { const its = pr.meses.flatMap((m) => m.previstos_itens.map((i) => ({ ...i, mes_ref: m.mes })));
        return its.length ? `<div class="previstos">${its.map((i) => `<div class="previsto"><span class="sinal ${i.valor > 0 ? "entrada" : "saida"}" aria-hidden="true">${i.valor > 0 ? "↓" : "↑"}</span>
          <div class="previsto-txt"><b>${esc(i.descricao)}</b><small>${nomeMesCurto(i.mes_ref)}${i.dia ? `, dia ${i.dia}` : ""}${i.categoria ? ` · ${esc(i.categoria)}` : ""}${i.ate && i.ate !== i.mes ? " · repete" : ""}</small></div>
          <div class="previsto-val"><b class="num">${brl(i.valor, true)}</b></div><button class="btn-texto" data-prev-plano="${i.id}">Editar</button></div>`).join("")}</div>`
          : `<p class="mudo">Lancem aqui o que não é rotina e vai mexer nos próximos meses: 13º, férias, freela, IPVA, matrícula, uma viagem. Entra na projeção acima.</p>`; })()}
    </div>

    <div class="cartao">
      <div class="cartao-cab"><h2>Plano de quitação</h2><a class="btn-texto" href="#/dividas">Ver dívidas</a></div>
      <form class="controles" id="f-quit">
        <label class="campo">Quanto separar por mês, além das parcelas <small>sugerido: ${brl(d.extra_sugerido)} (${Math.round((1 - d.margem) * 100)}% da sobra prevista)</small>
          <input name="extra" inputmode="decimal" value="${paraInput(q.extra_mensal)}"></label>
        <div class="chips">${[...new Set([d.extra_sugerido, 50000, 100000])].map((v) => `<button type="button" class="chip ${v === q.extra_mensal ? "sugerido" : ""}" data-extra="${v}">${brl(v)}</button>`).join("")}</div>
        <label class="linha-ajuste" style="gap:10px;margin:0;padding:0;border:0"><span style="font-size:13.5px">Bola de neve</span>
          <span class="chave"><input type="checkbox" name="bola" ${q.bola_de_neve ? "checked" : ""} aria-label="Bola de neve"><span></span></span></label>
        <button class="btn btn-primario">Recalcular</button>
      </form>
      <div class="grade g3">
        <div class="estat"><span class="rotulo">Livres de dívidas em</span><span class="valor-grande">${livre(q)}</span>
          <span class="mudo" style="font-size:13px">${ganhoMeses ? `${ganhoMeses} meses antes que sem o extra` : q.nao_quitam.length ? `não quitam: ${q.nao_quitam.map(esc).join(", ")}` : ""}</span></div>
        <div class="estat"><span class="rotulo">Juros no caminho</span><span class="valor-grande">${brl(q.juros_total)}</span>
          <span class="mudo" style="font-size:13px">${se.juros_total > q.juros_total ? `${brl(se.juros_total - q.juros_total)} a menos que sem o extra` : "nas dívidas sem contrato"}</span></div>
        <div class="estat"><span class="rotulo">Sem o extra</span><span class="valor-grande">${livre(se)}</span>
          <span class="mudo" style="font-size:13px">só parcelas${se.bola_de_neve ? " e bola de neve" : ""} · juros ${brl(se.juros_total)}</span></div>
      </div>
      <h3 style="font-size:14px;margin:18px 0 0;color:var(--texto-2)">Total devido mês a mês, seguindo o plano</h3>
      <div class="grafico" id="graf-div"></div>
      <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Ordem</th><th>Saldo hoje</th><th>Juros/mês</th><th>Por mês</th><th>Quitada em</th><th>Juros pagos</th></tr></thead><tbody>
        ${q.dividas.map((x, i) => `<tr><td>${i + 1}. ${esc(x.nome)}</td><td class="num">${brl(x.saldo_hoje)}</td>
          <td class="num">${x.contrato ? "contrato" : x.juros_estimado && !x.juros_mensal ? "não informado" : `${pctBR(x.juros_mensal, 1)}${x.juros_estimado ? " <small class='mudo'>est.</small>" : ""}`}</td>
          <td class="num">${x.parcela ? brl(x.parcela) : "—"}</td><td class="num">${x.quitada_em ? nomeMesCurto(x.quitada_em) : "—"}</td>
          <td class="num">${brl(x.juros_pagos)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="nota">O extra vai para a primeira da ordem sugerida (urgência, depois juros, depois saldo) até zerar, e passa para a seguinte.
        ${q.bola_de_neve ? "Com bola de neve, a parcela de um contrato que termina passa a reforçar o extra. " : ""}
        ${q.dividas.some((x) => x.juros_estimado) ? "“est.” = taxa estimada (8% a.m. para banco/cartão sem taxa informada): informem a taxa real em Dívidas > Editar. " : ""}
        ${q.dividas.some((x) => x.juros_estimado) ? "Em dívida de cartão, juros e encargos param em 100% do valor original (Lei 14.690/2023). " : ""}
        Antecipar parcelas de contrato aqui abate o valor cheio; com o desconto de juros (CDC art. 52) sai ainda melhor.</p>
    </div>

    <div class="cartao">
      <div class="cartao-cab"><h2>Orçamento realista</h2></div>
      <form class="controles" id="f-orc">
        <label class="campo">Quanto querem liberar por mês <small>para dívidas ou reserva, cortando no que é escolha</small>
          <input name="liberar" inputmode="decimal" value="${paraInput(o.liberar || null)}" placeholder="0,00"></label>
        <div class="chips">${[20000, 50000].map((v) => `<button type="button" class="chip ${v === o.liberar ? "sugerido" : ""}" data-liberar="${v}">${brl(v)}</button>`).join("")}</div>
        <button class="btn">Recalcular</button>
      </form>
      <p style="margin:0 0 14px">${o.deficit ? `O mês típico não fecha: faltam <b>${brl(o.deficit)}</b>. ` : "O mês típico fecha com sobra, então a sugestão parte do gasto real, arredondado. "}
        ${o.alvo ? `Para ${o.deficit ? "fechar" : `liberar ${brl(o.liberar)}`}, o corte sugerido é de <b>${brl(o.corte_sugerido)}</b> por mês, no máximo 30% de cada categoria, sem mexer em moradia, contas, saúde, educação e negócio.` : ""}
        ${o.falta_depois_do_corte ? ` <span style="color:var(--atencao)">Mesmo assim faltam ${brl(o.falta_depois_do_corte)}: aí a saída é renda extra ou renegociar dívidas.</span>` : ""}</p>
      <div class="tabela-rolagem"><table class="tabela" id="tab-orc"><thead><tr><th>Categoria</th>${o.meses_referencia.map((m) => `<th class="num col-mes">${nomeMesCurto(m)}</th>`).join("")}<th class="num">Típico</th><th class="num">Orçado hoje</th><th class="num">Sugestão</th></tr></thead><tbody>
        ${o.itens.map((i) => `<tr><td>${esc(i.nome)}${i.essencial ? " <small class='mudo'>essencial</small>" : ""}</td>${i.meses.map((v) => `<td class="num mudo col-mes">${v ? brl(v) : "—"}</td>`).join("")}
          <td class="num">${brl(i.tipico)}</td><td class="num">${i.orcamento ? brl(i.orcamento) : "—"}${i.orcamento && i.tipico > i.orcamento * 1.1 ? " <span class='tag duv'>abaixo do real</span>" : ""}</td>
          <td><input data-orc="${i.id}" inputmode="decimal" value="${paraInput(i.sugestao)}" aria-label="Orçado sugerido para ${esc(i.nome)}"></td></tr>`).join("")}
      </tbody><tfoot><tr><td>Total</td>${o.meses_referencia.map(() => `<td class="col-mes"></td>`).join("")}<td class="num">${brl(o.total_tipico)}</td><td class="num">${brl(o.total_orcado)}</td><td class="num" id="tot-orc">${brl(o.total_sugerido)}</td></tr></tfoot></table></div>
      <div class="modal-acoes" style="justify-content:flex-start;margin-top:14px"><button class="btn btn-primario" id="aplicar-orc">Usar como orçado do mês</button></div>
      <p class="nota">Inclui o que foi pago com o Flash, como a comparação da Início. Dívidas ficam de fora: elas têm o plano acima.
        Ao usar, cada categoria passa a ter esse orçado e os alertas de “passou do orçado” seguem os novos valores.</p>
    </div>
  </div>`;

  $$("#seg-meses button", el).forEach((b) => b.addEventListener("click", () => { P.meses = +b.dataset.n; render(); }));
  $("#novo-prev-plano", el).addEventListener("click", () => novoPrevisto({ mes: somarMes(mesAtual(), 1) }, render));
  $$("[data-prev-plano]", el).forEach((b) => b.addEventListener("click", () => {
    const i = pr.meses.flatMap((m) => m.previstos_itens).find((x) => x.id === +b.dataset.prevPlano);
    novoPrevisto({ ...i, mes_inicio: i.mes, no_plano: !!i.no_plano }, render);
  }));
  $("#f-quit", el).addEventListener("submit", (e) => { e.preventDefault(); const v = form(e.target); P.extra = v.extra.trim() || null; P.bola = !!v.bola; render(); });
  $$("[data-extra]", el).forEach((b) => b.addEventListener("click", () => { P.extra = paraInput(+b.dataset.extra); render(); }));
  $("#f-orc", el).addEventListener("submit", (e) => { e.preventDefault(); P.liberar = form(e.target).liberar.trim(); P.extra = null; render(); });
  $$("[data-liberar]", el).forEach((b) => b.addEventListener("click", () => { P.liberar = paraInput(+b.dataset.liberar); P.extra = null; render(); }));
  $$("[data-orc]", el).forEach((i) => i.addEventListener("input", () => {
    const t = $$("[data-orc]", el).reduce((s, x) => s + (Math.round(parseFloat(x.value.replace(/\./g, "").replace(",", ".")) * 100) || 0), 0);
    $("#tot-orc", el).textContent = brl(t);
  }));
  $("#aplicar-orc", el).addEventListener("click", async () => {
    const itens = $$("[data-orc]", el).map((x) => ({ id: +x.dataset.orc, orcamento: x.value.trim() }));
    const r = await api("/api/orcamento/aplicar", { metodo: "POST", corpo: { itens } });
    toast(`Orçado salvo · ${brl(r.orcamento_mensal)} por mês`); await carregarCadastros(); render();
  });
  graficoResultado($("#graf-proj", el), pr.meses);
  graficoDivida($("#graf-div", el), q.serie);
};

function mostrarDica(box, x, y, valor, rotulo) {
  let d = $(".dica", box);
  if (!d) { d = document.createElement("div"); d.className = "dica"; box.appendChild(d); }
  const b = document.createElement("b"); b.textContent = valor;
  const s = document.createElement("span"); s.textContent = rotulo;
  d.replaceChildren(b, s); d.classList.add("visivel");
  d.style.left = Math.min(Math.max(0, x - d.offsetWidth / 2), box.clientWidth - d.offsetWidth) + "px";
  d.style.top = Math.max(-8, y - d.offsetHeight - 10) + "px";
}
const esconderDica = (box) => $(".dica", box)?.classList.remove("visivel");

function graficoResultado(box, meses) {
  const W = Math.max(280, box.clientWidth), H = 200, topo = 26;
  const vals = meses.map((m) => m.resultado);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const base = min < 0 ? 44 : 26;
  const y = (v) => topo + ((max - v) / ((max - min) || 1)) * (H - topo - base);
  const passo = W / meses.length, larg = Math.min(24, passo * 0.5), r = 4, y0 = y(0);
  const rotular = (i) => meses.length <= 6 || i === meses.length - 1;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Resultado previsto por mês (valores na tabela abaixo)">`;
  meses.forEach((m, i) => {
    const cx = passo * i + passo / 2, x0 = cx - larg / 2, y1 = y(m.resultado), pos = m.resultado >= 0;
    const rr = Math.min(r, Math.abs(y1 - y0)), dy = pos ? rr : -rr;
    const caminho = `M${x0},${y0} V${y1 + dy} Q${x0},${y1} ${x0 + rr},${y1} H${x0 + larg - rr} Q${x0 + larg},${y1} ${x0 + larg},${y1 + dy} V${y0} Z`;
    svg += `<g class="col" tabindex="0" data-i="${i}"><rect x="${cx - passo / 2}" y="0" width="${passo}" height="${H - 20}" fill="transparent"/>
      <path d="${caminho}" fill="var(${pos ? "--bom" : "--critico"})"/></g>`;
    if (rotular(i)) svg += `<text class="valor" x="${cx}" y="${pos ? y1 - 7 : y1 + 15}" text-anchor="middle">${compacto(m.resultado, true)}</text>`;
    svg += `<text x="${cx}" y="${H - 4}" text-anchor="middle">${nomeMesCurto(m.mes)}</text>`;
  });
  svg += `<line class="eixo" x1="0" x2="${W}" y1="${y0}" y2="${y0}"/></svg>`;
  box.innerHTML = svg;
  $$(".col", box).forEach((g) => {
    const m = meses[+g.dataset.i], cx = passo * +g.dataset.i + passo / 2;
    const ver = () => mostrarDica(box, cx, Math.min(y(m.resultado), y0), brl(m.resultado, true), `${nomeMes(m.mes)} · resultado previsto`);
    g.addEventListener("pointerenter", ver); g.addEventListener("focus", ver);
    g.addEventListener("pointerleave", () => esconderDica(box)); g.addEventListener("blur", () => esconderDica(box));
  });
}

function graficoDivida(box, serie) {
  const W = Math.max(280, box.clientWidth), H = 210, topo = 18, base = 26, esq = 52, dir = 16, n = serie.length;
  const max = Math.max(1, ...serie.map((p) => p.saldo));
  const passoY = passoBonito(max / 3), maxY = Math.ceil(max / passoY) * passoY;
  const x = (i) => esq + (n > 1 ? (i / (n - 1)) * (W - esq - dir) : 0);
  const y = (v) => topo + (1 - v / maxY) * (H - topo - base);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Total devido mês a mês (detalhes na tabela abaixo)">`;
  for (let v = 0; v <= maxY + 1; v += passoY) {
    svg += `<line class="${v ? "grade-y" : "eixo"}" x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}"/><text x="${esq - 8}" y="${y(v) + 4}" text-anchor="end">${compacto(v)}</text>`;
  }
  const cada = Math.max(1, Math.ceil(n / 6));
  serie.forEach((p, i) => { if (i % cada === 0) svg += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${nomeMesCurto(p.mes)}</text>`; });
  const pts = serie.map((p, i) => `${x(i)},${y(p.saldo)}`);
  svg += `<path class="area-serie" d="M${x(0)},${y(0)} L${pts.join(" L")} L${x(n - 1)},${y(0)} Z"/><path class="linha-serie" d="M${pts.join(" L")}"/>`;
  const ult = serie[n - 1];
  svg += `<circle class="ponto" cx="${x(n - 1)}" cy="${y(ult.saldo)}" r="4"/>`;
  svg += `<text class="valor" x="${x(n - 1)}" y="${y(ult.saldo) - 10}" text-anchor="end">${ult.saldo ? compacto(ult.saldo) : `zero em ${nomeMesCurto(ult.mes)}`}</text>`;
  svg += `<line class="mira" id="mira" x1="0" x2="0" y1="${topo}" y2="${H - base}" visibility="hidden"/><circle class="ponto" id="mira-ponto" r="4" visibility="hidden"/>`;
  svg += `<rect id="alvo" x="${esq}" y="0" width="${W - esq - dir}" height="${H - base}" fill="transparent"/></svg>`;
  box.innerHTML = svg;
  const alvo = $("#alvo", box), mira = $("#mira", box), ponto = $("#mira-ponto", box);
  alvo.addEventListener("pointermove", (e) => {
    const rect = box.querySelector("svg").getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - esq) / (W - esq - dir)) * (n - 1))));
    const p = serie[i];
    mira.setAttribute("x1", x(i)); mira.setAttribute("x2", x(i)); mira.setAttribute("visibility", "visible");
    ponto.setAttribute("cx", x(i)); ponto.setAttribute("cy", y(p.saldo)); ponto.setAttribute("visibility", "visible");
    mostrarDica(box, (x(i) / W) * box.clientWidth, (y(p.saldo) / H) * box.clientHeight, brl(p.saldo), `${nomeMes(p.mes)} · total devido`);
  });
  alvo.addEventListener("pointerleave", () => { mira.setAttribute("visibility", "hidden"); ponto.setAttribute("visibility", "hidden"); esconderDica(box); });
}

/* ------------------------------------------------------------------ Fila de dúvidas */
TELAS.duvidas = async (el) => {
  const d = await api("/api/duvidas");
  S.nDuvidas = d.total; montarNav();
  if (!d.itens.length) {
    el.innerHTML = `<div class="pilha"><div class="cartao vazio"><div class="grande">✨</div><h3>Fila vazia</h3><p>Tudo classificado. Quando importarem extratos novos, o que o sistema não souber aparece aqui.</p></div><div id="produtos"></div></div>`;
    produtosPendentes($("#produtos", el));
    return;
  }
  const usados = [...S.cad.categorias].sort((a, b) => (b.usos || 0) - (a.usos || 0));
  el.innerHTML = `<div class="pilha">
    <div><h2 style="font-size:22px">Fila de dúvidas</h2><p class="mudo" style="margin:4px 0 0">${d.total} lançamento(s). Um clique classifica e ensina a regra; os parecidos vão juntos.</p></div>
    ${d.itens.map((t) => {
      const entrada = t.valor > 0;
      const base = entrada ? usados.filter((c) => c.tipo === "receita") : usados.filter((c) => ["despesa"].includes(c.tipo)).slice(0, 9);
      const sug = t.sugestao_id ? S.cad.categorias.find((c) => c.id === t.sugestao_id) : null;
      const chips = (sug ? [sug] : []).concat(base.filter((c) => !sug || c.id !== sug.id));
      return `<div class="cartao duvida" data-id="${t.id}">
        <div class="duvida-topo"><div><div class="desc">${esc(t.descricao)}</div>
          <div class="mudo" style="font-size:13px">${dataBR(t.data)} · ${esc(t.conta)}${t.pessoa ? " · " + esc(t.pessoa) : ""}
          ${t.parcela_total ? ` · <span class="tag parc">${t.parcela_atual}/${t.parcela_total}</span>` : ""}
          ${t.parecidos ? ` · <span class="tag">+${t.parecidos} parecido(s)</span>` : ""}</div></div>
          <div class="val num ${entrada ? "pos" : ""}">${brl(t.valor, true)}</div></div>
        ${t.motivo_duvida ? `<div class="motivo">${esc(t.motivo_duvida)}</div>` : ""}
        <div class="chips">
          ${chips.map((c) => `<button class="chip ${sug && c.id === sug.id ? "sugerido" : ""}" data-cat="${c.id}">${esc(c.nome)}</button>`).join("")}
          <button class="chip especial" data-cat="${catId("Transferência entre contas")}">Transferência entre nós</button>
          ${!entrada ? `<button class="chip especial" data-cat="${catId("Pagamento de fatura")}">Pagamento de fatura</button>
          <button class="chip especial" data-divida>Pagamento de dívida…</button>` : ""}
          <button class="chip especial" data-cat="${catId("Investimentos e reserva")}">Reserva/investimento</button>
          <select class="chip" data-outra aria-label="Outra categoria"><option value="">Outra…</option>${opcoes(S.cad.categorias.filter((c) => !chips.includes(c)))}</select>
        </div>
        <div class="opcoes-duvida">
          <label>Quem <select data-pessoa>${opcoes(S.cad.pessoas, t.pessoa_id)}</select></label>
          <label><span class="chave"><input type="checkbox" data-negocio><span></span></span> Do negócio (Rocco Kids)</label>
          <label><span class="chave"><input type="checkbox" data-lembrar checked><span></span></span> Lembrar para os próximos</label>
        </div></div>`;
    }).join("")}</div>`;
  el.firstElementChild.insertAdjacentHTML("beforeend", `<div id="produtos"></div>`);
  produtosPendentes($("#produtos", el));
  $$(".duvida", el).forEach((card) => {
    const enviar = async (categoria_id, extra = {}) => {
      const corpo = { categoria_id, pessoa_id: $("[data-pessoa]", card).value, lembrar: $("[data-lembrar]", card).checked,
        escopo: $("[data-negocio]", card).checked ? "negocio" : "pessoal", ...extra };
      const r = await api(`/api/transacoes/${card.dataset.id}/classificar`, { metodo: "POST", corpo });
      const nome = S.cad.categorias.find((c) => String(c.id) === String(categoria_id))?.nome || "";
      toast(`Classificado como ${nome}${r.parecidos ? ` · e mais ${r.parecidos} parecido(s)` : ""}`);
      card.classList.add("saindo");
      setTimeout(() => (r.parecidos ? render() : (card.remove(), atualizarContador(), !$(".duvida") && render())), 300);
    };
    $$("[data-cat]", card).forEach((b) => b.addEventListener("click", () => enviar(b.dataset.cat)));
    $("[data-outra]", card).addEventListener("change", (e) => e.target.value && enviar(e.target.value));
    $("[data-divida]", card)?.addEventListener("click", () => abrirModal(`<h3>Qual dívida este pagamento abate?</h3>
      <select id="qual-divida">${opcoes(S.cad.dividas)}</select>
      <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-div">Confirmar</button></div>`,
      (m) => $("#ok-div", m).addEventListener("click", () => { $("#modal").close(); enviar(catId("Dívidas"), { divida_id: $("#qual-divida", m).value }); })));
  });
};
const catId = (nome) => S.cad.categorias.find((c) => c.nome === nome)?.id;

/* ------------------------------------------------------------------ Lançamentos */
TELAS.lancamentos = async (el) => {
  if (location.hash.includes("parcelados")) S.segLanc = "parcelados";
  el.innerHTML = `<div class="pilha"><div class="cartao-cab" style="margin:0"><div class="segmentos" id="seg">
      ${[["todos", "Lançamentos"], ["recorrentes", "Recorrentes"], ["parcelados", "Parcelados"]].map(([k, n]) =>
        `<button data-s="${k}" class="${S.segLanc === k ? "ativo" : ""}">${n}</button>`).join("")}</div></div><div id="lanc-corpo"></div></div>`;
  $$("#seg button", el).forEach((b) => b.addEventListener("click", () => { S.segLanc = b.dataset.s; history.replaceState(null, "", "#/lancamentos"); TELAS.lancamentos(el); }));
  const corpo = $("#lanc-corpo", el);
  if (S.segLanc === "recorrentes") return recorrentes(corpo);
  if (S.segLanc === "parcelados") return parcelados(corpo);
  const f = S.filtros;
  corpo.innerHTML = `<div class="cartao"><div class="filtros">
      <input type="text" id="f-q" placeholder="Buscar descrição…" value="${esc(f.q || "")}">
      <select id="f-conta_id">${opcoes(S.cad.contas, f.conta_id, "Todas as contas")}</select>
      <select id="f-categoria_id"><option value="">Todas as categorias</option><option value="0" ${f.categoria_id === "0" ? "selected" : ""}>A classificar</option>${opcoes(S.cad.categorias, f.categoria_id)}</select>
      <select id="f-pessoa_id">${opcoes(S.cad.pessoas, f.pessoa_id, "Todas as pessoas")}</select>
      <select id="f-escopo"><option value="">Pessoal e negócio</option><option value="pessoal" ${f.escopo === "pessoal" ? "selected" : ""}>Só pessoal</option><option value="negocio" ${f.escopo === "negocio" ? "selected" : ""}>Só negócio</option></select>
    </div><div id="lista-tx"></div></div>`;
  let tm;
  $$(".filtros [id^=f-]", corpo).forEach((i) => i.addEventListener(i.tagName === "INPUT" ? "input" : "change", () => {
    clearTimeout(tm); tm = setTimeout(() => { S.filtros[i.id.slice(2)] = i.value; listar(); }, 250);
  }));
  const listar = async () => {
    const q = new URLSearchParams({ mes: S.mes, ...Object.fromEntries(Object.entries(S.filtros).filter(([, v]) => v)) });
    const { itens } = await api(`/api/transacoes?${q}`);
    const reais = itens.filter((t) => t.tipo === "normal");
    const ent = reais.filter((t) => t.valor > 0).reduce((s, t) => s + t.valor, 0);
    const sai = reais.filter((t) => t.valor < 0).reduce((s, t) => s + t.valor, 0);
    let ultimoDia = "";
    $("#lista-tx").innerHTML = itens.length ? `<p class="mudo" style="font-size:13px;margin:8px 4px 0">${itens.length} lançamento(s) · entradas <b class="num">${brl(ent)}</b> · saídas <b class="num">${brl(sai)}</b> <span title="Transferências entre vocês e pagamentos de fatura não entram nas somas">(sem transferências)</span></p>
      <div class="lista">${itens.map((t) => {
        const dia = t.data !== ultimoDia ? `<div class="dia">${esc(diaSemana(t.data))}</div>` : ""; ultimoDia = t.data;
        const tags = [
          t.classificacao === "duvida" ? `<span class="tag duv">a classificar</span>` : "",
          t.parcela_total ? `<span class="tag parc">${t.parcela_atual}/${t.parcela_total}</span>` : "",
          t.estimado ? `<span class="tag" title="${esc(t.observacao || "")}">estimado</span>` : "",
          t.escopo === "negocio" ? `<span class="tag neg">negócio</span>` : "",
          t.tipo === "transferencia" ? `<span class="tag">transferência</span>` : t.tipo === "fatura" ? `<span class="tag">fatura</span>` : "",
          t.divida ? `<span class="tag">${esc(t.divida)}</span>` : "",
          t.marketplace && !t.produto ? `<span class="tag duv">descrever produto</span>` : "",
          t.mes_ref && t.mes_ref !== t.data.slice(0, 7) ? `<span class="tag" title="${t.conta_tipo === "cartao" && !t.competencia ? "paga na fatura deste mês" : "vocês escolheram este mês"}">${t.conta_tipo === "cartao" && !t.competencia ? "fatura de " : "conta em "}${nomeMesCurto(t.mes_ref)}</span>` : ""].join("");
        return `${dia}<div class="tx" data-id="${t.id}" tabindex="0"><span class="desc">${t.produto ? `${esc(t.produto)} <small class="mudo">· ${esc(t.descricao)}</small>` : esc(t.descricao)}</span>
          <span class="val num ${t.valor > 0 ? "pos" : ""}" ${t.tipo !== "normal" ? 'style="opacity:.55"' : ""}>${brl(t.valor, true)}</span>
          <span class="meta-tx">${esc(t.categoria || "Sem categoria")} · ${esc(t.conta)}${t.pessoa ? " · " + esc(t.pessoa) : ""} ${tags}</span></div>`;
      }).join("")}</div>` : `<div class="vazio"><h3>Nada por aqui</h3><p>Nenhum lançamento neste mês com esses filtros.</p></div>`;
    $$("#lista-tx .tx").forEach((r) => { const t = itens.find((x) => x.id === +r.dataset.id);
      r.addEventListener("click", () => editarTx(t, listar)); r.addEventListener("keydown", (e) => e.key === "Enter" && editarTx(t, listar)); });
  };
  listar();
};

function editarTx(t, depois) {
  abrirModal(`<h3>${esc(t.descricao)}</h3>
    <p class="mudo" style="margin:-8px 0 0">${dataBR(t.data)} · ${esc(t.conta)} · <b class="num">${brl(t.valor, true)}</b>${t.portador ? ` · cartão: ${esc(t.portador)}` : ""}${t.parcela_total ? ` · parcela ${t.parcela_atual}/${t.parcela_total}` : ""}</p>
    <form id="f-tx" class="grade-form">
      ${t.marketplace || t.produto ? `<label class="campo" style="grid-column:1/-1">O que foi comprado <small>${t.parcela_total ? "vale para todas as parcelas" : "marketplace"}</small><input name="produto" value="${esc(t.produto || "")}" placeholder="Ex.: fone de ouvido, cadeira, presente da Ana"></label>` : ""}
      <label class="campo">Categoria<select name="categoria_id">${opcoes(S.cad.categorias, t.categoria_id, "Sem categoria")}</select></label>
      <label class="campo">Quem<select name="pessoa_id">${opcoes(S.cad.pessoas, t.pessoa_id)}</select></label>
      <label class="campo">Pessoal ou negócio<select name="escopo"><option value="pessoal">Pessoal</option><option value="negocio" ${t.escopo === "negocio" ? "selected" : ""}>Negócio (Rocco Kids)</option></select></label>
      <label class="campo">Conta no mês de <small>${t.conta_tipo === "cartao" ? "padrão: mês da fatura" : "padrão: mês da data"}</small><input type="month" name="competencia" value="${esc(t.competencia || t.mes_ref || "")}"></label>
      <label class="campo" style="grid-column:1/-1">Observação<input type="text" name="observacao" value="${esc(t.observacao || "")}"></label>
      <label style="display:flex;gap:10px;align-items:center;grid-column:1/-1;font-size:14px"><span class="chave"><input type="checkbox" name="lembrar" checked><span></span></span> Aplicar aos próximos parecidos (${esc(t.chave || "—")})</label>
    </form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="salvar-tx">Salvar</button></div>`, (m) => {
    $("#salvar-tx", m).addEventListener("click", async () => {
      const v = form($("#f-tx", m));
      if (String(v.categoria_id) !== String(t.categoria_id ?? "")) {
        const r = await api(`/api/transacoes/${t.id}/classificar`, { metodo: "POST", corpo: { categoria_id: v.categoria_id || null, pessoa_id: v.pessoa_id, escopo: v.escopo, lembrar: !!v.lembrar } });
        if (r.parecidos) toast(`Regra salva · ${r.parecidos} parecido(s) também`);
      }
      const corpo = { pessoa_id: v.pessoa_id, escopo: v.escopo, observacao: v.observacao };
      if ("produto" in v) corpo.produto = v.produto;
      if (v.competencia && v.competencia !== (t.competencia || t.mes_ref)) corpo.competencia = v.competencia;
      await api(`/api/transacoes/${t.id}`, { metodo: "PATCH", corpo });
      $("#modal").close(); toast("Salvo"); depois(); atualizarContador();
    });
  });
}

const FORMA_CLS = { "Cartão": "cartao", "Pix no crédito": "cartao", Pix: "pix", Boleto: "boleto", "Débito automático": "debito", "Débito em conta": "debito", Flash: "flash", "Transferência": "pix" };
async function recorrentes(el) {
  const { itens } = await api("/api/recorrentes");
  const soma = (l) => l.reduce((s, i) => s + i.valor_medio, 0);
  const semDivida = itens.filter((i) => !i.divida);
  const ass = semDivida.filter((i) => i.assinatura), cartao = semDivida.filter((i) => FORMA_CLS[i.forma] === "cartao"), conta = semDivida.filter((i) => FORMA_CLS[i.forma] !== "cartao" && i.assinatura);
  const grupo = (titulo, lista, dica) => `<div class="cartao"><div class="cartao-cab"><h2>${titulo}</h2><span class="mudo num">${brl(soma(lista))}/mês</span></div>
    ${lista.length ? `<div class="lista">${lista.map((i) => `<div class="tx" style="cursor:default"><span class="desc">${esc(i.descricao)}</span>
      <span class="val num">${brl(i.valor_medio)}<small class="mudo" style="font-weight:400">/mês</small></span>
      <span class="meta-tx"><span class="forma ${FORMA_CLS[i.forma] || ""}">${esc(i.forma)}</span> ${esc(i.categoria || "Sem categoria")} · ${esc(i.conta)} · todo dia ~${i.dia} · ${i.meses} meses${i.assinatura ? ' <span class="tag neg">assinatura</span>' : ""}${i.escopo === "negocio" ? ' <span class="tag neg">negócio</span>' : ""}${i.divida ? ' <span class="tag">dívida</span>' : ""}</span></div>`).join("")}</div>`
      : `<p class="mudo">${dica}</p>`}</div>`;
  el.innerHTML = `<div class="pilha"><div class="grade g3">
      <div class="cartao estat"><span class="rotulo">Assinaturas</span><span class="valor-grande num">${brl(soma(ass))}</span><span class="mudo" style="font-size:13px">${ass.length} assinatura(s) · ${brl(soma(ass) * 12)} por ano</span></div>
      <div class="cartao estat"><span class="rotulo">No cartão</span><span class="valor-grande num">${brl(soma(cartao))}</span><span class="mudo" style="font-size:13px">${cartao.length} cobrança(s) por mês</span></div>
      <div class="cartao estat"><span class="rotulo">Por Pix, boleto ou débito</span><span class="valor-grande num">${brl(soma(conta))}</span><span class="mudo" style="font-size:13px">${conta.length} cobrança(s) por mês</span></div>
    </div>
    ${grupo("No cartão de crédito", cartao, "Nenhuma cobrança repetida no cartão.")}
    ${grupo("Por Pix, boleto ou débito em conta", conta, "Nenhuma cobrança repetida nas contas.")}
    <p class="nota">Detectados sozinhos: mesmo estabelecimento, valor parecido, em meses diferentes. Para mudar a categoria (ex.: uma assinatura), toquem no lançamento na lista de lançamentos.</p></div>`;
}

async function parcelados(el) {
  S.mesParc = S.mesParc && S.mesParc.slice(0, 7) === S.mes.slice(0, 7) ? S.mesParc : S.mes;
  const d = await api(`/api/parcelamentos?mes=${S.mes}`);
  const sel = d.agenda.find((a) => a.mes === S.mes) || { valor: 0, qtd: 0 };
  const novas = d.detalhe.filter((x) => x.nova), ultimas = d.detalhe.filter((x) => x.ultima);
  const max = Math.max(1, ...d.agenda.map((a) => a.valor));
  const fim = d.detalhe.length ? d.detalhe.reduce((s, x) => s + x.restante_depois, 0) : 0;
  el.innerHTML = `<div class="pilha">
    <div class="grade g4">
      <div class="cartao estat"><span class="rotulo">Parcelas pagas em ${esc(nomeMesCurto(S.mes))}</span><span class="valor-grande num">${brl(sel.valor)}</span><span class="mudo" style="font-size:13px">${sel.qtd} parcela(s) ${S.mes < mesAtual() ? "pagas" : "na fatura do mês"}</span></div>
      <div class="cartao estat"><span class="rotulo">Compras novas no mês</span><span class="valor-grande num">${novas.length}</span><span class="mudo" style="font-size:13px">${novas.length ? `${brl(novas.reduce((s, x) => s + x.valor * x.n, 0))} parcelados` : "nenhuma parcela 1 este mês"}</span></div>
      <div class="cartao estat"><span class="rotulo">Terminam no mês</span><span class="valor-grande num">${ultimas.length}</span><span class="mudo" style="font-size:13px">${ultimas.length ? `liberam ${brl(ultimas.reduce((s, x) => s + x.valor, 0))} por mês` : "nenhuma última parcela"}</span></div>
      <div class="cartao estat"><span class="rotulo">Ainda a pagar, no total</span><span class="valor-grande num">${brl(d.restante_total)}</span><span class="mudo" style="font-size:13px">${d.termina ? `a última termina em ${nomeMesCurto(d.termina)}` : "nada em aberto 👏"}</span></div>
    </div>
    <div class="cartao"><div class="cartao-cab"><h2>Parcelas por mês</h2><span class="mudo" style="font-size:13px">no cartão, pelo mês da fatura · toquem num mês</span></div>
      <div class="colunas-mes">${d.agenda.map((a) => `<button class="col-mes ${a.mes === S.mes ? "ativo" : ""} ${a.mes < mesAtual() ? "passado" : ""}" data-mes="${a.mes}" aria-label="${nomeMes(a.mes)}: ${brl(a.valor)}">
        <span class="col-valor num">${compacto(a.valor)}</span><span class="col-trilho"><i style="height:${(a.valor / max) * 100}%"></i></span><span class="col-rotulo">${nomeMesCurto(a.mes)}</span></button>`).join("")}</div>
      <p class="nota">Regra do casal: evitar parcelamento. Cada barra é dinheiro de um mês já comprometido antes de chegar.</p></div>
    <div class="cartao"><div class="cartao-cab"><h2>Parcelas de ${esc(nomeMes(S.mes))}</h2><span class="num">${brl(sel.valor)}</span></div>
      ${d.detalhe.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Compra</th><th class="num">Parcela</th><th class="num">Valor</th><th class="num">Depois deste mês</th><th class="num">Termina</th></tr></thead><tbody>
        ${d.detalhe.map((x, n) => `<tr ${n >= 12 ? 'class="extra" hidden' : ""}><td><b>${esc(x.produto || x.descricao)}</b>${x.produto ? `<br><small class="mudo">${esc(x.descricao)}</small>` : ""}<br><small class="mudo">${esc(x.conta)}${x.pessoa ? " · " + esc(x.pessoa) : ""}${x.prevista ? " · prevista" : ""}</small>
          ${x.nova ? ' <span class="tag duv">nova</span>' : ""}${x.ultima ? ' <span class="tag ok">última</span>' : ""}</td>
          <td class="num">${x.k}/${x.n}</td><td class="num">${brl(x.valor)}</td><td class="num">${x.restante_depois ? brl(x.restante_depois) : "—"}</td><td class="num">${nomeMesCurto(x.termina)}</td></tr>`).join("")}
      </tbody></table></div>${d.detalhe.length > 12 ? `<button class="btn-texto" data-ver="det">Ver todas as ${d.detalhe.length} parcelas</button>` : ""}<p class="nota">Depois de ${esc(nomeMesCurto(S.mes))}, essas compras ainda somam ${brl(fim)}.</p>` : `<p class="mudo">Nenhuma parcela em ${esc(nomeMes(S.mes))}.</p>`}</div>
    <div class="cartao"><div class="cartao-cab"><h2>Compras em andamento</h2><span class="mudo" style="font-size:13px">${d.itens.length} compra(s)</span></div>
      ${d.itens.length ? `<div class="lista-parc">${d.itens.map((p, n) => `<div class="parc ${n >= 10 ? "extra" : ""}" ${n >= 10 ? "hidden" : ""}>
        <div class="parc-topo"><b>${esc(p.produto || p.descricao)}</b><span class="num">${brl(p.restante)} <small class="mudo">a pagar</small></span></div>
        <div class="parc-passos" aria-label="${p.pagas} de ${p.parcela_total} pagas">${Array.from({ length: p.parcela_total }, (_, k) => `<i class="${k < p.pagas ? "paga" : ""}"></i>`).join("")}</div>
        <small class="mudo">${p.pagas} de ${p.parcela_total} pagas · ${brl(p.valor_parcela)} por mês${p.proxima ? ` · próxima em ${nomeMesCurto(p.proxima.mes)}` : ""} · termina em ${nomeMesCurto(p.termina)}${p.pessoa ? " · " + esc(p.pessoa) : ""}</small></div>`).join("")}</div>${d.itens.length > 10 ? `<button class="btn-texto" data-ver="and">Ver todas as ${d.itens.length} compras</button>` : ""}`
        : `<p class="mudo">Nenhuma compra parcelada em aberto. 👏</p>`}</div>
  </div>`;
  $$("[data-mes]", el).forEach((b) => b.addEventListener("click", () => { S.mes = b.dataset.mes; montarMes(true); parcelados(el); }));
  $$("[data-ver]", el).forEach((b) => b.addEventListener("click", () => { $$(".extra", b.closest(".cartao")).forEach((x) => (x.hidden = false)); b.remove(); }));
}

async function produtosPendentes(box) {
  const d = await api("/api/marketplace");
  const pend = d.itens.filter((i) => !i.produto);
  box.innerHTML = `<div class="cartao"><div class="cartao-cab"><h2>O que foi comprado? ${pend.length ? `<span class="contador">${pend.length}</span>` : ""}</h2><span class="mudo" style="font-size:13px">Amazon, Mercado Livre, Shopee, Shein…</span></div>
    ${pend.length ? `<p class="mudo" style="margin:-6px 0 12px;font-size:13.5px">O extrato só mostra a loja. Escrevam o produto: depois fica fácil achar e decidir se valeu a pena. Numa compra parcelada, vale para todas as parcelas.</p>
      <div class="lista">${pend.slice(0, 30).map((i) => `<form class="produto-linha" data-tx="${i.id}"><div><b>${esc(i.descricao)}</b><small class="mudo">${dataBR(i.data_compra || i.data)} · ${esc(i.conta)}${i.pessoa ? " · " + esc(i.pessoa) : ""} · ${i.parcela_total ? `${brl(i.total)} em ${i.parcela_total}x` : brl(i.valor)}</small></div>
        <input name="produto" placeholder="Ex.: fone de ouvido" aria-label="Produto comprado em ${esc(i.descricao)}"><button class="btn">Salvar</button></form>`).join("")}</div>
      ${pend.length > 30 ? `<p class="nota">Mostrando 30 de ${pend.length}.</p>` : ""}` : `<p class="mudo">Todas as compras de marketplace têm descrição. ✨</p>`}</div>`;
  $$(".produto-linha", box).forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault(); const v = form(f).produto.trim(); if (!v) return;
    const r = await api(`/api/transacoes/${f.dataset.tx}`, { metodo: "PATCH", corpo: { produto: v } });
    f.style.opacity = 0; setTimeout(() => produtosPendentes(box), 200); toast("Produto salvo");
  }));
}

/* ------------------------------------------------------------------ Plano de ação (encontros) */
const SITUACAO = { cumprindo: ["Cumprindo", "bom"], atencao: ["Atenção", "atencao"], quebrou: ["Não cumprido", "critico"],
  melhor: ["Melhor que antes", "bom"], igual: ["Igual a antes", "neutro"], pior: ["Pior que antes", "critico"], sem_registro: ["Sem registro ainda", "neutro"] };
const STATUS_ACAO = [["", "Continua valendo"], ["cumprida", "Cumprida"], ["parcial", "Cumprida em parte"], ["nao_cumprida", "Não cumprida"], ["cancelada", "Cancelar"]];
const periodoBR = (a, b) => `${dataBR(a).slice(0, 5)} a ${dataBR(b)}`;

function acaoHTML(a) {
  const [sit, cls] = a.status !== "ativa" ? [a.status_nome, a.status === "cumprida" ? "bom" : a.status === "parcial" ? "atencao" : "neutro"] : SITUACAO[a.situacao] || ["", "neutro"];
  const temCat = a.categoria_id && a.gasto !== undefined;
  const usado = temCat && a.limite ? Math.min(1.2, a.gasto / a.limite) : 0;
  return `<div class="acao">
    <div class="acao-topo"><div><b>${esc(a.texto)}</b><small class="mudo">${esc(a.responsavel || "Casal")} · ${periodoBR(a.inicio, a.fim)}${a.status === "ativa" ? a.encerrada ? " · período encerrado" : ` · faltam ${a.dias_restantes} dia(s)` : ""}</small></div>
      <span class="selo ${cls}">${esc(sit)}</span></div>
    ${temCat ? `<div class="acao-num">
        <div><span class="rotulo">${esc(a.categoria)} no período</span><b class="num">${brl(a.gasto)}</b>${a.limite !== null ? `<small class="mudo">limite ${a.limite ? brl(a.limite) : "zero"}</small>` : ""}</div>
        <div><span class="rotulo">Antes (mesmos ${a.dias_passados} dias)</span><b class="num">${brl(a.gasto_antes)}</b><small class="${a.economia >= 0 ? "pos" : ""}">${a.economia >= 0 ? `${brl(a.economia)} a menos` : `${brl(-a.economia)} a mais`}</small></div></div>
      ${a.limite ? `<div class="medidor ${usado > 1 ? "estouro" : usado > a.dias_passados / a.dias_total + 0.15 ? "perto" : ""}"><i style="width:${Math.min(1, usado) * 100}%"></i><span class="marca-ritmo" style="left:${(a.dias_passados / a.dias_total) * 100}%"></span></div>` : ""}
      ${a.itens && a.itens.length ? `<details class="mais"><summary>${a.itens.length} compra(s) no período</summary><ul class="historico">${a.itens.map((i) => `<li>${dataBR(i.data)} · ${esc(i.produto || i.descricao)} · <b class="num">${brl(i.valor)}</b></li>`).join("")}</ul></details>` : ""}` : ""}
    ${a.registros.length ? `<ul class="historico">${a.registros.slice(0, 3).map((r) => `<li>${dataBR(r.data)}${r.status ? ` · ${esc((STATUS_ACAO.find((x) => x[0] === r.status) || [, r.status])[1])}` : ""}${r.nota ? `: ${esc(r.nota)}` : ""}</li>`).join("")}</ul>` : ""}
    ${a.status === "ativa" ? `<div class="modal-acoes" style="justify-content:flex-start;margin-top:10px"><button class="btn" data-registrar="${a.id}">Registrar como está indo</button></div>` : ""}
  </div>`;
}

function linhaPeriodo(x) {
  return `<div class="periodo"><span class="rotulo">${periodoBR(x.ini, x.fim)} · ${x.dias} dias</span>
    <div class="periodo-num"><span>Entrou <b class="num">${brl(x.entradas)}</b></span><span>Saiu <b class="num">${brl(x.saidas)}</b></span><span>Saldo <b class="num ${x.saldo >= 0 ? "pos" : ""}">${brl(x.saldo, true)}</b></span></div></div>`;
}

TELAS.encontros = async (el) => {
  const d = await api("/api/encontros");
  const an = d.analise;
  const varia = (l, cls) => l.length ? `<ul class="variacoes">${l.map((v) => `<li><span>${esc(v.categoria)}</span><b class="num ${cls}">${brl(v.diferenca, true)}</b><small class="mudo">${brl(v.antes)} → ${brl(v.agora)}</small></li>`).join("")}</ul>` : `<p class="mudo" style="font-size:13.5px">Nada relevante.</p>`;
  el.innerHTML = `<div class="pilha">
    <div class="cartao-cab" style="margin:0"><div><h2 style="font-size:22px;color:var(--texto)">Plano de ação</h2>
      <p class="mudo" style="margin:4px 0 0">Os combinados dos encontros de alinhamento de vocês, e se estão sendo cumpridos.</p></div>
      <button class="btn btn-primario" id="novo-encontro">+ Novo encontro</button></div>

    <div class="cartao"><div class="cartao-cab"><h2>Compromissos em andamento</h2><button class="btn" id="nova-acao">+ Compromisso</button></div>
      ${d.ativas.length ? `<div class="acoes">${d.ativas.map(acaoHTML).join("")}</div>`
        : `<p class="mudo">Nenhum compromisso ativo. No próximo encontro, combinem 1 a 3 ações simples. Por exemplo: “não comprar roupas até o próximo encontro” (categoria Vestuário, limite zero) ou “no máximo R$ 300 em restaurante”.</p>`}</div>

    <div class="cartao"><div class="cartao-cab"><h2>Análise entre períodos</h2></div>
      <form class="controles" id="f-analise">
        <label class="campo">Período anterior<span class="duas-datas"><input type="date" name="ini_antes" value="${an.antes.ini}"><input type="date" name="fim_antes" value="${an.antes.fim}"></span></label>
        <label class="campo">Período atual<span class="duas-datas"><input type="date" name="ini" value="${an.agora.ini}"><input type="date" name="fim" value="${an.agora.fim}"></span></label>
        <button class="btn">Comparar</button></form>
      <div id="res-analise">${analiseHTML(an, varia)}</div>
    </div>

    <div class="cartao"><div class="cartao-cab"><h2>Encontros</h2><span class="mudo" style="font-size:13px">${d.encontros.length} registrado(s)</span></div>
      ${d.encontros.length ? d.encontros.map((e) => `<details class="encontro" ${e === d.encontros[0] ? "open" : ""}><summary><b>${dataBR(e.data)}</b> ${esc(e.titulo || "Encontro de alinhamento")} <small class="mudo">${e.acoes.length} compromisso(s)</small></summary>
        ${e.notas ? `<p class="notas">${esc(e.notas)}</p>` : ""}
        <div class="modal-acoes" style="justify-content:flex-start"><button class="btn" data-edit-enc="${e.id}">Editar encontro</button><button class="btn" data-acao-enc="${e.id}">+ Compromisso</button></div>${e.acoes.length ? `<div class="acoes">${e.acoes.map(acaoHTML).join("")}</div>` : ""}</details>`).join("")
        : `<p class="mudo">Registrem o primeiro encontro: data, o que conversaram e os compromissos até o próximo.</p>`}</div>
  </div>`;
  const ligar = (raiz) => $$("[data-registrar]", raiz).forEach((b) => b.addEventListener("click", () => registrarAcao(+b.dataset.registrar)));
  ligar(el);
  $("#novo-encontro", el).addEventListener("click", () => novoEncontro(d.ativas));
  $("#nova-acao", el).addEventListener("click", () => novaAcao());
  $$("[data-edit-enc]", el).forEach((b) => b.addEventListener("click", () => editarEncontro(d.encontros.find((x) => x.id === +b.dataset.editEnc))));
  $$("[data-acao-enc]", el).forEach((b) => b.addEventListener("click", () => novaAcao(+b.dataset.acaoEnc)));
  $("#f-analise", el).addEventListener("submit", async (e) => {
    e.preventDefault(); const r = await api(`/api/analise?${new URLSearchParams(form(e.target))}`);
    $("#res-analise", el).innerHTML = analiseHTML(r, varia); ligar($("#res-analise", el));
  });
};

function analiseHTML(an, varia) {
  const dif = an.agora.saldo - an.antes.saldo;
  return `<div class="grade g2">${linhaPeriodo(an.antes)}${linhaPeriodo(an.agora)}</div>
    <p style="margin:12px 0 0;font-size:14px">O saldo do período atual foi <b class="${dif >= 0 ? "pos" : ""}">${brl(Math.abs(dif))} ${dif >= 0 ? "melhor" : "pior"}</b> que o do anterior.${an.agora.dias !== an.antes.dias ? " Os períodos têm tamanhos diferentes: as categorias abaixo comparam o gasto proporcional." : ""}</p>
    <div class="grade g2" style="margin-top:14px"><div><h4 class="subtitulo">Gastaram menos</h4>${varia(an.melhoraram, "pos")}</div><div><h4 class="subtitulo">Gastaram mais</h4>${varia(an.pioraram, "")}</div></div>
    ${an.acoes.length ? `<h4 class="subtitulo" style="margin-top:16px">Compromissos do período</h4><div class="acoes">${an.acoes.map(acaoHTML).join("")}</div>` : ""}`;
}

function camposAcao(i, a = {}) {
  const hoje = mesAtual() + S.hoje.slice(7, 10);
  const fim = new Date(Date.parse(S.hoje) + 30 * 864e5).toISOString().slice(0, 10);
  return `<div class="grade-form acao-form" data-i="${i}">
    <label class="campo" style="grid-column:1/-1">Compromisso<input name="texto" value="${esc(a.texto || "")}" placeholder="Ex.: Não comprar roupas"></label>
    <label class="campo">Acompanhar a categoria <small>opcional</small><select name="categoria_id">${opcoes(S.cad.categorias.filter((c) => c.tipo === "despesa"), a.categoria_id, "— só registro manual —")}</select></label>
    <label class="campo">Limite no período (R$) <small>0 = não gastar nada</small><input name="limite" inputmode="decimal" placeholder="vazio = sem limite"></label>
    <label class="campo">De<input type="date" name="inicio" value="${hoje}"></label>
    <label class="campo">Até <small>próximo encontro</small><input type="date" name="fim" value="${fim}"></label>
    <label class="campo">Quem<select name="responsavel">${["Casal", "Bárbara", "Lucas"].map((p) => `<option>${p}</option>`).join("")}</select></label></div>`;
}

function editarEncontro(e) {
  abrirModal(`<h3>Editar encontro</h3><div class="grade-form">
    <label class="campo">Data<input type="date" id="enc-data" value="${esc(e.data)}"></label>
    <label class="campo">Título<input id="enc-titulo" value="${esc(e.titulo || "")}"></label>
    <label class="campo" style="grid-column:1/-1">O que conversaram<textarea id="enc-notas" rows="4">${esc(e.notas || "")}</textarea></label></div>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-edit-enc">Salvar</button></div>`, (m) =>
    $("#ok-edit-enc", m).addEventListener("click", async () => {
      await api(`/api/encontros/${e.id}`, { metodo: "PATCH", corpo: { data: $("#enc-data", m).value, titulo: $("#enc-titulo", m).value, notas: $("#enc-notas", m).value } });
      $("#modal").close(); toast("Encontro salvo"); render();
    }));
}

function novaAcao(encontroId = null) {
  abrirModal(`<h3>Novo compromisso</h3>${encontroId ? `<input type="hidden" name="encontro_id" value="${encontroId}">` : ""}${camposAcao(0)}
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-acao">Salvar</button></div>`, (m) => {
    $("#ok-acao", m).addEventListener("click", async () => {
      const v = Object.fromEntries($$("[name]", m).map((x) => [x.name, x.value]));
      await api("/api/acoes", { metodo: "POST", corpo: v }); $("#modal").close(); toast("Compromisso salvo"); render();
    });
  });
}

function novoEncontro(ativas) {
  let n = 1;
  abrirModal(`<h3>Novo encontro de alinhamento</h3>
    <div class="grade-form"><label class="campo">Data<input type="date" id="enc-data" value="${S.hoje}"></label>
      <label class="campo">Título <small>opcional</small><input id="enc-titulo" placeholder="Ex.: Fechamento de outubro"></label>
      <label class="campo" style="grid-column:1/-1">O que conversaram<textarea id="enc-notas" rows="3" placeholder="Decisões, preocupações, conquistas…"></textarea></label></div>
    ${ativas.length ? `<h4 class="subtitulo">Como foram os compromissos</h4>${ativas.map((a) => `<div class="revisao" data-acao="${a.id}"><div><b>${esc(a.texto)}</b><small class="mudo">${esc((SITUACAO[a.situacao] || [""])[0])}${a.gasto !== undefined ? ` · ${brl(a.gasto)} no período` : ""}</small></div>
      <select name="status">${STATUS_ACAO.map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><input name="nota" placeholder="Comentário"></div>`).join("")}` : ""}
    <h4 class="subtitulo">Compromissos até o próximo encontro</h4><div id="novas-acoes">${camposAcao(0)}</div>
    <button class="btn-texto" id="mais-acao">+ outro compromisso</button>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-enc">Salvar encontro</button></div>`, (m) => {
    $("#mais-acao", m).addEventListener("click", () => $("#novas-acoes", m).insertAdjacentHTML("beforeend", camposAcao(n++)));
    $("#ok-enc", m).addEventListener("click", async () => {
      const acoesNovas = $$(".acao-form", m).map((f) => Object.fromEntries($$("[name]", f).map((x) => [x.name, x.value]))).filter((a) => a.texto.trim());
      const revisoes = $$(".revisao", m).map((r) => ({ acao_id: r.dataset.acao, status: $("[name=status]", r).value, nota: $("[name=nota]", r).value }));
      await api("/api/encontros", { metodo: "POST", corpo: { data: $("#enc-data", m).value, titulo: $("#enc-titulo", m).value, notas: $("#enc-notas", m).value, acoes: acoesNovas, revisoes } });
      $("#modal").close(); toast("Encontro registrado"); render();
    });
  });
}

function registrarAcao(id) {
  abrirModal(`<h3>Como está indo?</h3><div class="grade-form">
    <label class="campo">Situação<select id="reg-status">${STATUS_ACAO.map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
    <label class="campo" style="grid-column:1/-1">Comentário<input id="reg-nota" placeholder="Ex.: resistimos à promoção da Shein"></label></div>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-reg">Registrar</button></div>`, (m) =>
    $("#ok-reg", m).addEventListener("click", async () => {
      await api(`/api/acoes/${id}/registro`, { metodo: "POST", corpo: { status: $("#reg-status", m).value, nota: $("#reg-nota", m).value } });
      $("#modal").close(); toast("Registrado"); render();
    }));
}

/* ------------------------------------------------------------------ Flash (módulo separado) */
TELAS.flash = async (el) => {
  const f = await api("/api/flash");
  if (!f.existe) { el.innerHTML = `<div class="cartao vazio"><h3>Sem extrato do Flash</h3><p>Importem o extrato do Flash na pasta flash.</p></div>`; return; }
  const maxG = Math.max(1, ...f.gastos_mes.map((g) => -g.total));
  const salvarSaldo = async (e) => { e.preventDefault(); const v = form(e.target);
    await api("/api/flash/saldo", { metodo: "POST", corpo: { saldo: v.saldo, data: v.data } }); toast("Saldo do Flash salvo"); TELAS.flash(el); };
  el.innerHTML = `<div class="pilha">
    <div class="cartao">
      <div class="cartao-cab"><h2>Saldo do Flash</h2><span class="mudo" style="font-size:13px">${f.saldo === null ? "ainda não informado" : `desde ${dataBR(f.data_inicial)}`}</span></div>
      <form class="controles" id="f-flash">
        <label class="campo">Saldo agora (R$)<input name="saldo" inputmode="decimal" value="${paraInput(f.saldo_informado ?? 0)}"></label>
        <label class="campo">Data do saldo<input type="date" name="data" value="${esc(f.data_inicial || S.hoje)}"></label>
        <button class="btn btn-primario">Salvar saldo</button>
      </form>
      <form class="controles" id="f-recarga" style="margin-top:14px">
        <label class="campo">Nova recarga (R$)<input name="valor" inputmode="decimal" placeholder="0,00"></label>
        <label class="campo">Data da recarga<input type="date" name="data" value="${esc(S.hoje)}"></label>
        <button class="btn btn-primario">Registrar recarga</button>
      </form>
      <div class="grade g3" style="margin-top:14px">
        <div class="estat"><span class="rotulo">Saldo atual</span><span class="valor-grande num">${f.saldo === null ? "—" : brl(f.saldo)}</span></div>
        <div class="estat"><span class="rotulo">Por dia</span><span class="valor-grande num">${brl(f.por_dia)}</span><span class="mudo" style="font-size:13px">nos ${f.dias_restantes} dias que faltam no mês</span></div>
        <div class="estat"><span class="rotulo">Por semana</span><span class="valor-grande num">${brl(f.por_semana)}</span><span class="mudo" style="font-size:13px">7 dias seguidos</span></div>
      </div>
    </div>
    <div class="grade g2">
      <div class="cartao"><div class="cartao-cab"><h2>Gastos do mês</h2></div>
        ${f.gastos_mes.length ? `<div class="barras">${f.gastos_mes.map((g) => `<div class="barra-linha"><span>${esc(g.nome)}</span><span class="num">${brl(g.total)}</span><div class="trilho"><i style="width:${(-g.total / maxG) * 100}%"></i></div></div>`).join("")}</div>` : `<p class="mudo">Nenhum gasto neste mês.</p>`}</div>
      <div class="cartao"><div class="cartao-cab"><h2>Últimos lançamentos</h2></div>
        <div class="lista">${f.itens.slice(0, 25).map((t) => `<div class="tx" style="cursor:default"><span class="desc">${esc(t.descricao)}</span><span class="val num ${t.valor > 0 ? "pos" : ""}">${brl(t.valor, true)}</span><span class="meta-tx">${dataBR(t.data)} · ${esc(t.categoria || "Sem categoria")}</span></div>`).join("")}</div></div>
    </div>
    <p class="nota">O Flash não entra no controle do mês: não soma em entradas, saídas, orçamento nem no plano.</p>
  </div>`;
  $("#f-flash", el).addEventListener("submit", salvarSaldo);
  $("#f-recarga", el).addEventListener("submit", async (e) => { e.preventDefault(); const v = form(e.target);
    await api("/api/flash/recarga", { metodo: "POST", corpo: { valor: v.valor, data: v.data } }); toast("Recarga registrada"); TELAS.flash(el); });
};

/* ------------------------------------------------------------------ Dívidas */
const TIPOS_DIVIDA = { consignado: "Consignado", familia: "Família", cartao: "Cartão", banco: "Banco", outro: "Outro" };
const STATUS_DIVIDA = { ativa: ["Ativa", "neutro"], negociando: ["Em negociação", "atencao"], acordo: ["Acordo fechado", "bom"], quitada: ["Quitada", "bom"] };

TELAS.dividas = async (el) => {
  const p = await api("/api/dividas");
  el.innerHTML = `<div class="pilha">
    <div class="grade g3">
      <div class="cartao estat"><span class="rotulo">Total devido</span><span class="valor-grande num">${brl(p.total_devido)}</span>
        <span class="mudo" style="font-size:13px">${p.a_confirmar.length ? `sem contar ${p.a_confirmar.map(esc).join(", ")} (a confirmar)` : "todas com valor informado"}</span></div>
      <div class="cartao estat"><span class="rotulo">Saída mensal com dívidas</span><span class="valor-grande num">${brl(p.mensal_comprometido)}</span>
        <span class="mudo" style="font-size:13px">${p.dividas.filter((d) => d.mensal && d.termino !== "quitada").map((d) => `${esc(d.nome.split(" (")[0])} ${brl(d.mensal)}`).join(" + ")}</span></div>
      <div class="cartao estat"><span class="rotulo">Juros do rotativo (simulações)</span><span class="valor-grande num">${String(p.juros_rotativo).replace(".", ",")}% a.m.</span>
        <span class="mudo" style="font-size:13px">ajuste em Ajustes se o app do cartão mostrar outro</span></div>
    </div>
    <div class="cartao"><div class="cartao-cab"><h2>Ordem sugerida para atacar</h2></div>
      <ol class="prioridade">${p.prioridade.map((x) => `<li><div><b>${esc(x.nome)}</b><p>${esc(x.motivo)}</p></div></li>`).join("")}</ol>
      <p class="mudo" style="font-size:12.5px;margin:14px 0 0">Lógica: urgência primeiro, depois juros mais caros, depois saldo menor. Orientação educativa, não consultoria financeira.</p></div>
    ${p.dividas.map(dividaHTML).join("")}
    <button class="btn" id="nova-divida" style="align-self:flex-start">+ Nova dívida</button>
  </div>`;
  $$("[data-editar]", el).forEach((b) => b.addEventListener("click", () => editarDivida(p.dividas.find((d) => d.id === +b.dataset.editar))));
  $$("[data-pagar]", el).forEach((b) => b.addEventListener("click", () => registrarPagamento(+b.dataset.pagar)));
  $$("[data-negociar]", el).forEach((b) => b.addEventListener("click", () => registrarNegociacao(+b.dataset.negociar)));
  $("#nova-divida").addEventListener("click", () => editarDivida({ nome: "", tipo: "outro", status: "ativa" }));
  $$("form[data-sim-cartao]", el).forEach((f) => f.addEventListener("submit", simularCartao));
  $$("form[data-sim-antecipar]", el).forEach((f) => f.addEventListener("submit", simularAntecipacao));
};

const pctBR = (v, casas = 2) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`);

function dividaHTML(d) {
  const [st, cls] = STATUS_DIVIDA[d.status] || STATUS_DIVIDA.ativa;
  const termino = d.termino === "quitada" ? "Quitada" : d.termino ? nomeMesCurto(d.termino) : "—";
  const juros = d.juros_mensal !== null ? `${pctBR(d.juros_mensal)} a.m.` : d.taxa_implicita !== undefined && d.taxa_implicita !== null ? `${pctBR(d.taxa_implicita)} a.m. <small class="mudo">(implícita)</small>` : "não informado";
  const cartao1x = d.forma_pagamento === "cartao_1x" && d.termino !== "quitada";
  const pagas = d.parcelas_pagas;
  return `<div class="cartao ${cartao1x ? "destaque" : ""}"><div class="divida-cab"><div><h3>${esc(d.nome)}</h3>
      <span class="mudo" style="font-size:13px">${esc(TIPOS_DIVIDA[d.tipo] || "")}${d.credor ? " · " + esc(d.credor) : ""}${d.dia_vencimento ? ` · vence dia ${d.dia_vencimento}` : ""}${d.data_inicio ? ` · desde ${dataBR(d.data_inicio)}` : ""}</span></div>
      <span class="selo ${cls}">${st}</span></div>
    ${cartao1x ? `<div class="faixa-destaque">⚠️ <span><b>Antes de passar no cartão:</b> pagando a fatura inteira no vencimento, não há juros. Se qualquer parte cair no rotativo, os juros são os mais caros do mercado. Simulem abaixo.</span></div>` : ""}
    <div class="numeros">
      <div><div class="rotulo">Saldo devedor</div><div class="num">${d.saldo_atual === null ? "a confirmar" : brl(d.saldo_atual)}</div></div>
      <div><div class="rotulo">Por mês</div><div class="num">${d.mensal ? brl(d.mensal) : "—"}</div></div>
      <div><div class="rotulo">Termina</div><div class="num">${termino}</div></div>
      <div><div class="rotulo">Juros</div><div class="num" style="font-size:15px">${juros}</div></div>
    </div>
    ${pagas !== undefined && pagas !== null ? `<div class="medidor" role="meter" aria-valuemin="0" aria-valuemax="${d.parcelas_total}" aria-valuenow="${pagas}" aria-label="Parcelas pagas"><i style="width:${(pagas / d.parcelas_total) * 100}%"></i></div>
      <p class="mudo" style="font-size:13px;margin:0">${pagas} de ${d.parcelas_total} parcelas pagas · faltam ${d.parcelas_restantes_atual} · contrato total ${brl(d.total_contrato)}</p>` : ""}
    ${d.taxa_implicita !== undefined && d.taxa_implicita !== null ? `<p class="mudo" style="font-size:13px;margin:6px 0 0">Emprestado ${brl(d.valor_emprestado)} → juros do contrato ${brl(d.juros_contrato)} · taxa implícita ${pctBR(d.taxa_implicita)} a.m. (${pctBR(d.taxa_anual, 1)} a.a.)</p>` : ""}
    ${d.mensal_necessario ? `<p class="mudo" style="font-size:13px;margin:6px 0 0">Para quitar até ${nomeMesCurto(d.plano_data_alvo)}: ${brl(d.mensal_necessario)} por mês.</p>` : ""}
    ${d.aviso ? `<p style="font-size:13.5px;margin:10px 0 0;color:var(--atencao)">${esc(d.aviso)}</p>` : ""}
    ${d.observacao ? `<p class="mudo" style="font-size:13.5px;margin:10px 0 0">${esc(d.observacao)}</p>` : ""}
    ${d.pagamentos.length ? `<details style="margin-top:12px"><summary class="btn-texto" style="display:inline">Pagamentos encontrados (${d.pagamentos.length})</summary>
      <ul class="historico">${d.pagamentos.map((x) => `<li>${dataBR(x.data)} · <span class="num">${brl(x.valor)}</span>${x.transacao_id ? " · encontrado no extrato" : " · registrado à mão"}</li>`).join("")}</ul></details>` : ""}
    ${d.negociacoes.length || d.status === "negociando" ? `<div style="margin-top:12px"><b style="font-size:14px">Histórico de negociação</b>
      ${d.negociacoes.length ? `<ul class="historico">${d.negociacoes.map((n) => `<li>${dataBR(n.data)}: ${esc(n.texto)}</li>`).join("")}</ul>` : `<p class="mudo" style="font-size:13px;margin:4px 0">Nada registrado ainda.</p>`}</div>` : ""}
    ${cartao1x ? `<form class="sim" data-sim-cartao><h4>Simular o pagamento no cartão</h4>
      <div class="grade-form"><label class="campo">Valor da dívida<input name="valor" value="${paraInput(d.saldo_atual)}" placeholder="0,00" inputmode="decimal"></label>
      <label class="campo">Resto da fatura <small>vazio = compras do mês no cartão</small><input name="fatura_sem_compra" placeholder="automático" inputmode="decimal"></label>
      <label class="campo">Quanto conseguem pagar da fatura <small>vazio = tudo</small><input name="vou_pagar" placeholder="a fatura inteira" inputmode="decimal"></label></div>
      <button class="btn" style="margin-top:12px">Simular</button><div data-res></div></form>` : ""}
    ${d.tipo === "consignado" && d.termino !== "quitada" ? `<form class="sim" data-sim-antecipar data-parcela="${d.parcela_valor || 0}" data-restantes="${d.parcelas_restantes_atual || 0}" data-juros="${d.taxa_simulacao ?? ""}">
      <h4>E se antecipar parcelas?</h4>
      ${d.taxa_simulacao ? `<p class="mudo" style="font-size:13px;margin:0 0 12px">Quitar tudo hoje custaria ~<b class="num">${brl(d.quitar_hoje.pagar_hoje)}</b> em vez de ${brl(d.quitar_hoje.nominal)} (economia de ${brl(d.quitar_hoje.economia)}), usando ${pctBR(d.taxa_simulacao)} a.m.${d.juros_mensal === null ? " (taxa implícita)" : ""}.</p>
      <div class="grade-form"><label class="campo">Quantas parcelas antecipar (das últimas)<input type="number" name="antecipar" min="1" max="${d.parcelas_restantes_atual}" value="${Math.min(6, d.parcelas_restantes_atual)}"></label></div>
      <button class="btn" style="margin-top:12px">Simular</button><div data-res></div>`
      : `<p class="mudo" style="font-size:13.5px;margin:0">Informem em “Editar” o <b>valor originalmente emprestado</b> (opcional) ou a taxa do contrato. Com isso eu calculo a taxa implícita e quanto economizam antecipando.</p>`}</form>` : ""}
    <div class="modal-acoes" style="justify-content:flex-start;margin-top:16px">
      <button class="btn" data-editar="${d.id}">Editar</button>
      <button class="btn" data-pagar="${d.id}">Registrar pagamento</button>
      ${["negociando", "acordo"].includes(d.status) || d.tipo === "cartao" ? `<button class="btn" data-negociar="${d.id}">Anotar negociação</button>` : ""}
    </div></div>`;
}

async function simularCartao(e) {
  e.preventDefault();
  const r = await api("/api/simular/cartao", { metodo: "POST", corpo: form(e.target) });
  $("[data-res]", e.target).innerHTML = `<div class="resultado ${r.alerta ? "ruim" : "ok"}">
    ${r.alerta ? `<b>⚠️ Isso vai custar juros.</b><br>` : `<b>✓ Sem juros se pagarem a fatura inteira.</b><br>`}${esc(r.mensagem)}
    <div class="mudo" style="font-size:12.5px;margin-top:6px">Fatura estimada: ${brl(r.fatura)} (resto da fatura considerado: ${brl(r.fatura_sem_compra)})${r.vence_em ? ` · se passar hoje no ${esc(r.cartao)}, vence em ${dataBR(r.vence_em)}` : ""}${r.folga_estimada !== undefined ? ` · sobra estimada no mês para pagar a fatura: ${brl(Math.max(0, r.folga_estimada))}` : ""}</div></div>`;
}
async function simularAntecipacao(e) {
  e.preventDefault();
  const f = e.target;
  const r = await api("/api/simular/antecipacao", { metodo: "POST", corpo: { parcela: +f.dataset.parcela, restantes: +f.dataset.restantes, juros: f.dataset.juros, antecipar: form(f).antecipar } });
  $("[data-res]", f).innerHTML = `<div class="resultado ok">Antecipando as ${r.antecipar} últimas parcelas, pagam hoje <b>${brl(r.pagar_hoje)}</b> em vez de ${brl(r.nominal)}: economia de <b>${brl(r.economia)}</b>. Ficam ${r.restantes_depois} parcela(s).
    <div class="mudo" style="font-size:12.5px;margin-top:6px">Na antecipação os juros das parcelas futuras são descontados (CDC, art. 52 §2º). Como o consignado está no nome do seu pai, a economia só existe se ele amortizar no banco: confirmem o valor exato com o banco antes.</div></div>`;
}

function editarDivida(d) {
  const campo = (nome, rotulo, valor, extra = "", dica = "") => `<label class="campo">${rotulo}${dica ? ` <small>${dica}</small>` : ""}<input name="${nome}" value="${esc(valor ?? "")}" ${extra}></label>`;
  abrirModal(`<h3>${d.id ? "Editar dívida" : "Nova dívida"}</h3>
    <form id="f-div" class="grade-form">
      ${campo("nome", "Nome", d.nome)}${campo("credor", "Credor", d.credor)}
      <label class="campo">Tipo<select name="tipo">${Object.entries(TIPOS_DIVIDA).map(([k, v]) => `<option value="${k}" ${d.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="campo">Situação<select name="status">${Object.entries(STATUS_DIVIDA).map(([k, [v]]) => `<option value="${k}" ${d.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${campo("saldo_base", "Saldo devedor hoje (R$)", paraInput(d.saldo_atual ?? d.saldo_base), 'inputmode="decimal" placeholder="a confirmar"', d.tipo === "consignado" ? "ou use parcelas" : "")}
      ${campo("parcela_valor", "Parcela (R$)", paraInput(d.parcela_valor), 'inputmode="decimal"')}
      ${campo("parcelas_restantes", "Parcelas restantes hoje", d.parcelas_restantes_atual ?? d.parcelas_restantes, 'type="number" min="0"')}
      ${campo("parcelas_total", "Total de parcelas do contrato", d.parcelas_total, 'type="number" min="0"')}
      ${campo("data_inicio", "1ª parcela em", d.data_inicio, 'type="date"')}
      ${campo("mes_final", "Mês da última parcela", d.mes_final, 'type="month"')}
      ${campo("valor_emprestado", "Valor originalmente emprestado (R$)", paraInput(d.valor_emprestado), 'inputmode="decimal" placeholder="opcional"', "dá a taxa implícita")}
      ${campo("dia_vencimento", "Dia do vencimento", d.dia_vencimento, 'type="number" min="1" max="31"')}
      ${campo("juros_mensal", "Juros (% ao mês)", d.juros_mensal === null || d.juros_mensal === undefined ? "" : String(d.juros_mensal).replace(".", ","), 'inputmode="decimal" placeholder="não sei"')}
      ${campo("plano_mensal", "Plano: quanto por mês (R$)", paraInput(d.plano_mensal), 'inputmode="decimal"')}
      ${campo("plano_data_alvo", "Plano: quitar até", d.plano_data_alvo, 'type="month"')}
      <label class="campo">Urgência<select name="urgencia">${["Normal", "Atenção", "Urgente (cobrança/negativação)"].map((v, i) => `<option value="${i}" ${+d.urgencia === i ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="campo">Forma de pagamento<select name="forma_pagamento">${[["", "—"], ["pix", "Pix/transferência"], ["boleto", "Boleto"], ["cartao_1x", "Cartão de crédito (1x)"], ["debito_automatico", "Débito automático"]].map(([k, v]) => `<option value="${k}" ${(d.forma_pagamento || "") === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${campo("reconhecer_valor", "Reconhecer no extrato: valor (R$)", paraInput(d.reconhecer_valor), 'inputmode="decimal"', "saída com esse valor exato")}
      ${campo("reconhecer_texto", "…ou trecho da descrição", d.reconhecer_texto, "", "ex.: nome de quem recebe o Pix")}
      <label class="campo" style="grid-column:1/-1">Observação<textarea name="observacao" rows="2">${esc(d.observacao || "")}</textarea></label>
    </form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="salvar-div">Salvar</button></div>`, (m) => {
    $("#salvar-div", m).addEventListener("click", async () => {
      const v = form($("#f-div", m));
      const orig = { saldo_base: paraInput(d.saldo_atual ?? d.saldo_base), parcelas_restantes: String(d.parcelas_restantes_atual ?? d.parcelas_restantes ?? "") };
      if (d.id) for (const k of Object.keys(orig)) if (v[k] === orig[k]) delete v[k];   // só manda saldo se mudou
      if (v.plano_data_alvo) v.plano_data_alvo = v.plano_data_alvo + "-01";
      await api(d.id ? `/api/dividas/${d.id}` : "/api/dividas", { metodo: d.id ? "PATCH" : "POST", corpo: v });
      $("#modal").close(); toast("Dívida salva"); await carregarCadastros(); render();
    });
  });
}
function registrarPagamento(id) {
  abrirModal(`<h3>Registrar pagamento</h3><p class="mudo" style="margin:-6px 0 0">Use para pagamentos que não aparecem nos extratos (ex.: dinheiro vivo). Os do extrato são reconhecidos sozinhos.</p>
    <form id="f-pag" class="grade-form"><label class="campo">Valor (R$)<input name="valor" inputmode="decimal" required></label>
    <label class="campo">Data<input type="date" name="data" value="${new Date().toISOString().slice(0, 10)}"></label>
    <label class="campo" style="grid-column:1/-1">Observação<input name="observacao"></label></form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-pag">Registrar</button></div>`, (m) =>
    $("#ok-pag", m).addEventListener("click", async () => { await api(`/api/dividas/${id}/pagamento`, { metodo: "POST", corpo: form($("#f-pag", m)) }); $("#modal").close(); toast("Pagamento registrado"); render(); }));
}
function registrarNegociacao(id) {
  abrirModal(`<h3>Anotar negociação</h3><form id="f-neg" class="grade-form">
    <label class="campo">Data<input type="date" name="data" value="${new Date().toISOString().slice(0, 10)}"></label>
    <label class="campo" style="grid-column:1/-1">O que foi proposto ou combinado<textarea name="texto" rows="3" placeholder="Ex.: proposta de 12x de R$ 389,00 com entrada de R$ 200,00"></textarea></label></form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-neg">Salvar</button></div>`, (m) =>
    $("#ok-neg", m).addEventListener("click", async () => { await api(`/api/dividas/${id}/negociacao`, { metodo: "POST", corpo: form($("#f-neg", m)) }); $("#modal").close(); toast("Anotado"); render(); }));
}

/* ------------------------------------------------------------------ Importar */
TELAS.importar = async (el) => {
  const imp = await api("/api/importacoes");
  el.innerHTML = `<div class="pilha">
    <div class="grade g2">
      <div class="cartao">
        <div class="cartao-cab"><h2>Enviar extratos</h2></div>
        <label class="campo" style="margin-bottom:14px">De qual conta?
          <select id="up-conta"><option value="">Descobrir pelo arquivo (OFX)</option>${opcoes(S.cad.contas.filter((c) => c.ativa))}<option value="planilha">Planilha antiga (mapear colunas)</option></select></label>
        <label class="soltar" id="soltar"><input type="file" id="up-arq" multiple accept=".ofx,.qfx,.csv,.txt,.pdf" hidden>
          ${icone("nuvem")}<h3>Arraste os arquivos aqui</h3><p class="mudo" style="margin:0">ou toque para escolher · OFX ou CSV baixados do app do banco</p></label>
      </div>
      <div class="cartao">
        <div class="cartao-cab"><h2>Ou pela pasta</h2></div>
        <p style="margin-top:0">Salvem os arquivos em <code>${esc(imp.pasta)}</code>, cada um na subpasta da conta (<code>inter-conta</code>, <code>inter-cartao</code>, <code>bb</code>, <code>itau</code>, <code>nubank</code>, <code>flash</code>, <code>planilha</code>), e toquem em Atualizar. Ou rodem <code>python importar.py</code>.</p>
        <button class="btn btn-primario" id="atualizar-2">${icone("importar")} Atualizar agora</button>
        <p class="mudo" style="font-size:13px">Nada duplica: o sistema reconhece arquivos e lançamentos que já entraram. Nunca pedimos senha de banco.</p>
      </div>
    </div>
    <div id="resultado-imp"></div>
    <div class="cartao"><div class="cartao-cab"><h2>Últimas importações</h2></div>
      ${imp.itens.length ? imp.itens.map((i) => `<div class="arquivo-linha"><span>${esc(i.arquivo)}<br><small class="mudo">${esc(i.conta || "")} · ${dataBR(i.criado_em)}</small></span>
        <span class="num" style="text-align:right">${i.novas} novos<br><small class="mudo">${i.duplicadas} já existiam</small></span></div>`).join("") : `<p class="mudo">Nenhuma ainda.</p>`}</div>
  </div>`;
  const zona = $("#soltar", el), arq = $("#up-arq", el);
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", (e) => enviarArquivos([...e.dataTransfer.files]));
  arq.addEventListener("change", () => enviarArquivos([...arq.files]));
  $("#atualizar-2", el).addEventListener("click", () => $("#btn-atualizar").click());
};

async function enviarArquivos(arquivos) {
  const sel = $("#up-conta").value;
  const res = [];
  for (const f of arquivos) {
    toast(`Lendo ${f.name}…`);
    const q = new URLSearchParams({ nome: f.name, ...(sel && sel !== "planilha" ? { conta_id: sel } : {}), ...(sel === "planilha" ? { planilha: "1" } : {}) });
    try { res.push(await api(`/api/upload?${q}`, { metodo: "POST", bruto: await f.arrayBuffer() })); } catch (e) { /* toast já mostrou */ }
  }
  if (!res.length) return;
  const junto = { arquivos: res.flatMap((r) => r.arquivos), novas: res.reduce((s, r) => s + r.novas, 0), duplicadas: res.reduce((s, r) => s + r.duplicadas, 0),
    transferencias: res.reduce((s, r) => s + r.transferencias, 0), pagamentos_divida: res.reduce((s, r) => s + r.pagamentos_divida, 0),
    duvidas: res.at(-1).duvidas, duvidas_novas: res.reduce((s, r) => s + r.duvidas_novas, 0), alertas_novos: res.reduce((s, r) => s + r.alertas_novos, 0) };
  mostrarResultado(junto);
}

function mostrarResultado(r) {
  const alvo = $("#resultado-imp") || (location.hash = "#/importar", null);
  const html = `<div class="cartao"><div class="cartao-cab"><h2>O que mudou</h2></div>
    <div class="resumo-imp">
      <div class="estat"><span class="rotulo">Lançamentos novos</span><span class="valor-grande num">${r.novas}</span></div>
      <div class="estat"><span class="rotulo">Duplicados ignorados</span><span class="valor-grande num">${r.duplicadas}</span></div>
      <div class="estat"><span class="rotulo">Transferências entre vocês</span><span class="valor-grande num">${r.transferencias}</span></div>
      <div class="estat"><span class="rotulo">Pagamentos de dívida</span><span class="valor-grande num">${r.pagamentos_divida}</span></div>
      <div class="estat"><span class="rotulo">Na fila de dúvidas</span><span class="valor-grande num">${r.duvidas}</span></div>
      <div class="estat"><span class="rotulo">Alertas novos</span><span class="valor-grande num">${r.alertas_novos}</span></div>
    </div>
    ${r.arquivos.map((a) => `<div class="arquivo-linha"><span>${esc(a.arquivo)}${a.conta ? ` <small class="mudo">→ ${esc(a.conta)}</small>` : ""}<br><small class="mudo">${esc(a.mensagem || "")}</small></span>
      <span>${a.status === "ok" ? `<span class="selo bom">${a.novas} novos</span>` : a.status === "ja_importado" ? `<span class="selo neutro">já importado</span>`
        : a.status === "precisa_mapear" ? `<button class="btn" data-mapear="${esc(a.caminho)}">Mapear colunas</button>` : `<span class="selo atencao">${esc(a.status)}</span>`}</span></div>`).join("")}
    ${r.duvidas ? `<div class="modal-acoes" style="justify-content:flex-start;margin-top:14px"><a class="btn btn-primario" href="#/duvidas">Classificar dúvidas</a><a class="btn" href="#/inicio">Ver início</a></div>` : ""}</div>`;
  const pend = r.arquivos.filter((a) => a.status === "precisa_mapear");
  const montar = () => {
    $("#resultado-imp").innerHTML = html;
    $$("[data-mapear]").forEach((b) => b.addEventListener("click", () => mapear(pend.find((a) => a.caminho === b.dataset.mapear))));
  };
  if (alvo) montar(); else setTimeout(montar, 400);
  atualizarContador();
}

function mapear(a) {
  const col = (nome, rotulo, sel, vazio = "—") => `<label class="campo">${rotulo}<select name="${nome}"><option value="">${vazio}</option>${a.cabecalho.map((c, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${esc(c || `Coluna ${i + 1}`)}</option>`).join("")}</select></label>`;
  const s = a.sugestao || {};
  abrirModal(`<h3>Mapear colunas: ${esc(a.arquivo)}</h3>
    <p class="mudo" style="margin:-6px 0 0">Digam o que é cada coluna. Eu guardo e, das próximas vezes, arquivos com este cabeçalho entram sozinhos.</p>
    <table class="tabela-amostra"><thead><tr>${a.cabecalho.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${a.amostra.slice(0, 4).map((l) => `<tr>${a.cabecalho.map((_, i) => `<td>${esc(l[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <form id="f-map" class="grade-form">
      ${col("data", "Data *", s.data)}${col("valor", "Valor *", s.valor, "— (uso débito/crédito)")}
      ${col("debito", "Débito (se separado)", s.debito)}${col("credito", "Crédito (se separado)", s.credito)}
      ${col("conta", "Conta/cartão (coluna)", s.conta)}
      <label class="campo">…ou conta fixa<select name="conta_fixa">${opcoes(S.cad.contas, null, "—")}</select></label>
      ${col("pessoa", "Pessoa (coluna)", s.pessoa)}${col("categoria", "Categoria (coluna)", s.categoria)}${col("parcela", "Parcela (coluna)", s.parcela)}
      <fieldset class="campo" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend style="font-size:13px;font-weight:500;color:var(--texto-2)">Descrição * (pode marcar mais de uma)</legend>
        <div class="chips" style="margin-top:6px">${a.cabecalho.map((c, i) => `<label class="chip"><input type="checkbox" name="descricao" value="${i}" ${(s.descricao || []).includes(i) ? "checked" : ""}> ${esc(c || `Coluna ${i + 1}`)}</label>`).join("")}</div></fieldset>
      <label style="display:flex;gap:10px;align-items:center;grid-column:1/-1;font-size:14px"><span class="chave"><input type="checkbox" name="inverter"><span></span></span> Na planilha, despesas aparecem como valores positivos</label>
    </form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-map">Importar</button></div>`, (m) => {
    $("#ok-map", m).addEventListener("click", async () => {
      const f = $("#f-map", m); const v = form(f);
      v.descricao = $$("input[name=descricao]:checked", f).map((x) => +x.value);
      v.inverter = !!v.inverter; v.linha_cabecalho = a.linha_cabecalho;
      const r = await api("/api/mapear", { metodo: "POST", corpo: { caminho: a.caminho, mapa: v, salvar: true } });
      $("#modal").close(); toast(`${r.novas} lançamentos importados`); mostrarResultado(r);
    });
  });
}

/* ------------------------------------------------------------------ Ajustes */
TELAS.ajustes = async (el) => {
  const [cfg, al, metas, regras] = await Promise.all([api("/api/config"), api("/api/alertas"), api("/api/metas"), api("/api/regras")]);
  const aprendidas = regras.itens.filter((r) => r.origem !== "semente");
  const nomes = JSON.parse(cfg.nomes_casal || "[]").join(", ");
  el.innerHTML = `<div class="pilha">
    <h2 style="font-size:22px">Ajustes</h2>
    <div class="cartao"><div class="cartao-cab"><h2>Orçamento do mês</h2></div>
      <form id="f-cfg" class="grade-form">
        <label class="campo">Renda mensal esperada <small>vazio = média dos últimos meses</small><input name="renda_mensal_esperada" value="${paraInput(+cfg.renda_mensal_esperada || null)}" inputmode="decimal" placeholder="automático"></label>
        <label class="campo">Guardar por mês<input name="meta_poupanca_mensal" value="${paraInput(+cfg.meta_poupanca_mensal || null)}" inputmode="decimal" placeholder="0,00"></label>
        <label class="campo">Limite combinado no cartão/mês<input name="limite_fatura_mensal" value="${paraInput(+cfg.limite_fatura_mensal || null)}" inputmode="decimal" placeholder="sem limite"></label>
        <label class="campo">Juros do rotativo (% a.m.)<input name="juros_rotativo_mensal" value="${esc(String(cfg.juros_rotativo_mensal).replace(".", ","))}" inputmode="decimal"></label>
        <label class="campo">Nomes de vocês nos extratos <small>para achar transferências</small><input name="nomes_casal" value="${esc(nomes)}"></label>
      </form><button class="btn btn-primario" id="salvar-cfg" style="margin-top:14px">Salvar</button></div>

    <div class="cartao" id="metas"><div class="cartao-cab"><h2>Metas</h2><button class="btn" id="nova-meta">+ Meta</button></div>
      ${metas.itens.length ? metas.itens.map((m) => `<div class="linha-ajuste"><div><b>${esc(m.nome)}</b><p>${esc({ baixo: "Baixo valor", medio: "Médio valor", alto: "Alto valor" }[m.faixa] || "")} · ${brl(m.guardado)} de ${brl(m.valor_alvo)}${m.prazo ? ` · até ${nomeMesCurto(m.prazo)}` : ""}</p></div>
        <button class="btn" data-meta="${m.id}">Atualizar</button></div>`).join("") : `<p class="mudo">Nenhuma meta ainda.</p>`}
      <p class="mudo" style="font-size:12.5px">Na Fase 2: quanto guardar por mês, se cabe no orçamento e a ordem sugerida (dívidas caras → reserva → metas).</p></div>

    <div class="cartao"><div class="cartao-cab"><h2>Alertas</h2></div>
      ${al.config.map((c) => `<div class="linha-ajuste"><div><b>${esc(c.nome)}</b><p>${esc(c.descricao)}</p></div>
        <label class="chave"><input type="checkbox" data-alerta="${c.tipo}" ${c.ativo ? "checked" : ""} aria-label="${esc(c.nome)}"><span></span></label></div>`).join("")}</div>

    <div class="cartao"><div class="cartao-cab"><h2>Contas e cartões</h2><button class="btn" id="nova-conta">+ Conta</button></div>
      ${S.cad.contas.map((c) => `<div class="linha-ajuste"><div><b>${esc(c.nome)}</b><p>${esc({ corrente: "Conta", cartao: "Cartão de crédito", beneficio: "Benefício", investimento: "Investimento" }[c.tipo])} · ${esc(c.titular || "")} · pasta <code>${esc(c.pasta || "—")}</code>${c.dia_vencimento ? ` · vence dia ${c.dia_vencimento}` : ""}${c.ativa ? "" : " · desativada"}</p></div>
        <button class="btn" data-conta="${c.id}">Editar</button></div>`).join("")}
      <div class="linha-ajuste"><div><b>Quem usa cada cartão</b><p>${S.cad.portadores.map((p) => `${esc(S.cad.contas.find((c) => c.id === p.conta_id)?.nome)}: “${esc(p.padrao)}” → ${esc(S.cad.pessoas.find((x) => x.id === p.pessoa_id)?.nome)} <button class="btn-texto" data-del-port="${p.id}">remover</button>`).join("<br>") || "—"}</p></div>
        <button class="btn" id="novo-portador">+ Portador</button></div></div>

    <div class="cartao"><div class="cartao-cab"><h2>Categorias</h2><button class="btn" id="nova-cat">+ Categoria</button></div>
      <div class="chips">${S.cad.categorias.map((c) => `<button class="chip" data-cat-ed="${c.id}">${esc(c.nome)}${c.orcamento ? ` · <span class="num mudo">${brl(c.orcamento)}</span>` : ""}</button>`).join("")}</div>
      <p class="mudo" style="font-size:12.5px">O valor ao lado é o orçado do mês (veio da aba Orçamento da planilha). Toque para editar.</p></div>

    <div class="cartao"><div class="cartao-cab"><h2>Regras aprendidas (${aprendidas.length})</h2><button class="btn" id="nova-regra">+ Regra</button></div>
      ${aprendidas.length ? aprendidas.map((r) => `<div class="regra"><span><b>${esc(r.padrao)}</b> → ${esc(r.categoria || r.tipo || "?")}${r.escopo === "negocio" ? ' <span class="tag neg">negócio</span>' : ""} <small class="mudo">${r.sinal === "entrada" ? "entradas" : r.sinal === "saida" ? "saídas" : ""} · ${r.usos} uso(s)</small></span>
        <button class="btn-texto" data-del-regra="${r.id}">apagar</button></div>`).join("") : `<p class="mudo">Cada classificação na fila de dúvidas vira uma regra aqui.</p>`}
      <p class="mudo" style="font-size:12.5px">Além destas, há ${regras.itens.length - aprendidas.length} regras de fábrica (iFood, Uber, mercados, farmácias, streaming…).</p></div>

    <div class="cartao"><div class="cartao-cab"><h2>Backup</h2></div>
      <p style="margin-top:0">Copia o banco para uma pasta, por exemplo a do Google Drive no computador. Guarda as 30 cópias mais recentes.</p>
      <div class="filtros"><input type="text" id="pasta-backup" value="${esc(cfg.pasta_backup || "")}" placeholder="Ex.: G:/Meu Drive/Financas ou /Users/voce/Google Drive/Financas"><button class="btn btn-primario" id="fazer-backup" style="flex:0 0 auto">Fazer backup agora</button></div></div>

    <div class="cartao"><div class="cartao-cab"><h2>Dados</h2></div>
      <div class="linha-ajuste"><div><b>Modo demo</b><p>Dados fictícios para explorar sem medo. Os dados reais ficam intactos.</p></div>
        <label class="chave"><input type="checkbox" id="chave-demo" ${S.modo === "demo" ? "checked" : ""} aria-label="Modo demo"><span></span></label></div>
      ${S.modo === "demo" ? `<div class="linha-ajuste"><div><b>Recriar demo</b><p>Volta os dados fictícios ao começo.</p></div><button class="btn" id="recriar-demo">Recriar</button></div>` : ""}
      <p class="mudo" style="font-size:12.5px">Tudo fica neste computador, em <code>financas/dados/</code>. Nenhuma senha de banco é pedida ou guardada. Orientação educativa, não é consultoria financeira.</p></div>
  </div>`;
  if (location.hash.includes("metas")) setTimeout(() => $("#metas").scrollIntoView({ behavior: "smooth" }), 100);

  $("#salvar-cfg").addEventListener("click", async () => {
    const v = form($("#f-cfg")); v.nomes_casal = v.nomes_casal.split(",");
    await api("/api/config", { metodo: "PATCH", corpo: v }); toast("Ajustes salvos");
  });
  $$("[data-alerta]").forEach((c) => c.addEventListener("change", async () => {
    await api(`/api/config-alertas/${c.dataset.alerta}`, { metodo: "PATCH", corpo: { ativo: c.checked } }); toast(c.checked ? "Alerta ligado" : "Alerta desligado");
  }));
  $("#nova-meta").addEventListener("click", () => editarMeta({}));
  $$("[data-meta]").forEach((b) => b.addEventListener("click", () => editarMeta(metas.itens.find((m) => m.id === +b.dataset.meta))));
  $$("[data-conta]").forEach((b) => b.addEventListener("click", () => editarConta(S.cad.contas.find((c) => c.id === +b.dataset.conta))));
  $("#nova-conta").addEventListener("click", () => editarConta({ tipo: "corrente", ativa: 1 }));
  $("#novo-portador").addEventListener("click", novoPortador);
  $$("[data-del-port]").forEach((b) => b.addEventListener("click", async () => { await api(`/api/portadores/${b.dataset.delPort}`, { metodo: "DELETE" }); await carregarCadastros(); render(); }));
  $("#nova-cat").addEventListener("click", () => editarCategoria({ tipo: "despesa" }));
  $$("[data-cat-ed]").forEach((b) => b.addEventListener("click", () => editarCategoria(S.cad.categorias.find((c) => c.id === +b.dataset.catEd))));
  $$("[data-del-regra]").forEach((b) => b.addEventListener("click", async () => { await api(`/api/regras/${b.dataset.delRegra}`, { metodo: "DELETE" }); toast("Regra apagada"); render(); }));
  $("#nova-regra").addEventListener("click", novaRegra);
  $("#fazer-backup").addEventListener("click", async () => {
    const r = await api("/api/backup", { metodo: "POST", corpo: { pasta: $("#pasta-backup").value } }); toast(`Backup salvo (${r.tamanho_kb} KB)`);
  });
  $("#chave-demo").addEventListener("change", (e) => trocarModo(e.target.checked ? "demo" : "real"));
  $("#recriar-demo")?.addEventListener("click", () => trocarModo("demo", true));
};

function editarMeta(m) {
  abrirModal(`<h3>${m.id ? "Atualizar meta" : "Nova meta"}</h3><form id="f-meta" class="grade-form">
    <label class="campo">Nome<input name="nome" value="${esc(m.nome || "")}" placeholder="Ex.: Reserva de emergência"></label>
    <label class="campo">Faixa<select name="faixa">${[["baixo", "Baixo valor"], ["medio", "Médio valor"], ["alto", "Alto valor"]].map(([k, v]) => `<option value="${k}" ${m.faixa === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="campo">Valor da meta (R$)<input name="valor_alvo" value="${paraInput(m.valor_alvo)}" inputmode="decimal"></label>
    <label class="campo">Já guardado (R$)<input name="guardado" value="${paraInput(m.guardado ?? 0)}" inputmode="decimal"></label>
    <label class="campo">Prazo<input type="month" name="prazo" value="${esc(m.prazo || "")}"></label>
    <label class="campo">Prioridade<input type="number" name="prioridade" min="1" value="${m.prioridade || 1}"></label></form>
    <div class="modal-acoes">${m.id ? `<button class="btn" id="arquivar-meta" style="margin-right:auto">Arquivar</button>` : ""}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-meta">Salvar</button></div>`, (el) => {
    $("#ok-meta", el).addEventListener("click", async () => { await api(m.id ? `/api/metas/${m.id}` : "/api/metas", { metodo: m.id ? "PATCH" : "POST", corpo: form($("#f-meta", el)) }); $("#modal").close(); toast("Meta salva"); render(); });
    $("#arquivar-meta", el)?.addEventListener("click", async () => { await api(`/api/metas/${m.id}`, { metodo: "PATCH", corpo: { ativa: 0 } }); $("#modal").close(); render(); });
  });
}
function editarConta(c) {
  abrirModal(`<h3>${c.id ? esc(c.nome) : "Nova conta"}</h3><form id="f-conta" class="grade-form">
    <label class="campo">Nome<input name="nome" value="${esc(c.nome || "")}"></label>
    <label class="campo">Instituição<input name="instituicao" value="${esc(c.instituicao || "")}"></label>
    <label class="campo">Tipo<select name="tipo">${[["corrente", "Conta"], ["cartao", "Cartão de crédito"], ["beneficio", "Benefício"], ["investimento", "Investimento"]].map(([k, v]) => `<option value="${k}" ${c.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="campo">Titular<select name="titular_id">${opcoes(S.cad.pessoas, c.titular_id)}</select></label>
    ${c.id ? `<label class="campo">Dia do vencimento <small>cartões</small><input type="number" name="dia_vencimento" min="1" max="31" value="${esc(c.dia_vencimento ?? "")}"></label>
    <label class="campo">Dia do fechamento<input type="number" name="dia_fechamento" min="1" max="31" value="${esc(c.dia_fechamento ?? "")}"></label>
    <label class="campo">Nº da conta no OFX <small>opcional, reconhece o arquivo sozinho</small><input name="identificador" value="${esc(c.identificador || "")}"></label>
    <label class="campo">Ativa<select name="ativa"><option value="1">Sim</option><option value="0" ${c.ativa ? "" : "selected"}>Não</option></select></label>
    <label class="campo" style="grid-column:1/-1">Observação<input name="observacao" value="${esc(c.observacao || "")}"></label>` : ""}</form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-conta">Salvar</button></div>`, (el) =>
    $("#ok-conta", el).addEventListener("click", async () => {
      const v = form($("#f-conta", el));
      for (const k of ["dia_vencimento", "dia_fechamento", "titular_id", "ativa"]) if (k in v) v[k] = v[k] === "" ? null : +v[k];
      await api(c.id ? `/api/contas/${c.id}` : "/api/contas", { metodo: c.id ? "PATCH" : "POST", corpo: v });
      $("#modal").close(); toast("Conta salva"); await carregarCadastros(); render();
    }));
}
function novoPortador() {
  abrirModal(`<h3>Quem usa o cartão</h3><p class="mudo" style="margin:-6px 0 0">Quando o extrato traz o nome ou o final do cartão, a compra vai para a pessoa certa.</p>
    <form id="f-port" class="grade-form"><label class="campo">Cartão<select name="conta_id">${opcoes(S.cad.contas.filter((c) => c.tipo === "cartao"))}</select></label>
    <label class="campo">Pessoa<select name="pessoa_id">${opcoes(S.cad.pessoas)}</select></label>
    <label class="campo" style="grid-column:1/-1">Texto no extrato <small>nome ou final do cartão, ex.: LUCAS ou 4321</small><input name="padrao"></label></form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-port">Salvar</button></div>`, (el) =>
    $("#ok-port", el).addEventListener("click", async () => { await api("/api/portadores", { metodo: "POST", corpo: form($("#f-port", el)) }); $("#modal").close(); await carregarCadastros(); render(); }));
}
function editarCategoria(c) {
  abrirModal(`<h3>${c.id ? "Categoria" : "Nova categoria"}</h3><form id="f-cat" class="grade-form">
    <label class="campo">Nome<input name="nome" value="${esc(c.nome || "")}"></label>
    <label class="campo">Tipo<select name="tipo">${[["despesa", "Despesa"], ["receita", "Receita"], ["divida", "Dívida"], ["investimento", "Investimento"], ["transferencia", "Transferência"]].map(([k, v]) => `<option value="${k}" ${c.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="campo">Orçado no mês (R$) <small>vazio = sem orçado</small><input name="orcamento" inputmode="decimal" value="${paraInput(c.orcamento)}"></label></form>
    <div class="modal-acoes">${c.id ? `<button class="btn" id="desativar-cat" style="margin-right:auto">Desativar</button>` : ""}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-cat">Salvar</button></div>`, (el) => {
    $("#ok-cat", el).addEventListener("click", async () => { await api(c.id ? `/api/categorias/${c.id}` : "/api/categorias", { metodo: c.id ? "PATCH" : "POST", corpo: form($("#f-cat", el)) }); $("#modal").close(); await carregarCadastros(); render(); });
    $("#desativar-cat", el)?.addEventListener("click", async () => { await api(`/api/categorias/${c.id}`, { metodo: "PATCH", corpo: { ativa: 0 } }); $("#modal").close(); await carregarCadastros(); render(); });
  });
}
function novaRegra() {
  abrirModal(`<h3>Nova regra</h3><p class="mudo" style="margin:-6px 0 0">Todo lançamento cuja descrição contenha este texto vai para a categoria escolhida.</p>
    <form id="f-regra" class="grade-form"><label class="campo">Texto na descrição<input name="padrao" placeholder="Ex.: ACADEMIA CORPO LIVRE"></label>
    <label class="campo">Categoria<select name="categoria_id">${opcoes(S.cad.categorias)}</select></label>
    <label class="campo">Pessoal ou negócio<select name="escopo"><option value="pessoal">Pessoal</option><option value="negocio">Negócio</option></select></label></form>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="ok-regra">Criar</button></div>`, (el) =>
    $("#ok-regra", el).addEventListener("click", async () => { const r = await api("/api/regras", { metodo: "POST", corpo: form($("#f-regra", el)) }); $("#modal").close(); toast(`Regra criada · ${r.reclassificados} da fila resolvidos`); render(); atualizarContador(); }));
}

async function trocarModo(modo, recriar = false) {
  toast(modo === "demo" ? "Preparando o modo demo…" : "Voltando para os dados reais…");
  await api("/api/modo", { metodo: "POST", corpo: { modo, recriar } });
  S.mes = null; await carregarEstado(); await carregarCadastros(); await atualizarContador();
  location.hash = "#/inicio"; render();
}

/* ------------------------------------------------------------------ início */
$("#btn-atualizar").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.classList.add("girando"); b.disabled = true;
  try {
    const r = await api("/api/atualizar", { metodo: "POST" });
    toast(r.novas ? `${r.novas} lançamentos novos` : "Nada novo em entrada/");
    if (location.hash.startsWith("#/importar")) mostrarResultado(r);
    else if (r.novas || r.pendentes.length) { location.hash = "#/importar"; setTimeout(() => mostrarResultado(r), 500); }
    else render();
  } finally { b.classList.remove("girando"); b.disabled = false; }
});
function aplicarIconeTema() {
  const escuro = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  $("#btn-tema").innerHTML = icone(escuro ? "sol" : "lua");
  return escuro;
}
$("#btn-tema").addEventListener("click", () => {
  const novo = aplicarIconeTema() ? "light" : "dark";
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem("tema", novo); } catch (e) { /* sem armazenamento */ }
  aplicarIconeTema();
});
window.addEventListener("hashchange", render);
window.addEventListener("resize", () => montarNav());

(async () => {
  aplicarIconeTema();
  await carregarEstado(); await carregarCadastros(); await atualizarContador();
  render();
})();
