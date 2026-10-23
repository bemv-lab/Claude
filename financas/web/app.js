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
const NAV = [["inicio", "Início"], ["lancamentos", "Lançamentos"], ["duvidas", "Dúvidas"], ["dividas", "Dívidas"], ["importar", "Importar"], ["ajustes", "Ajustes"]];

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
  const e = await api("/api/estado"); S.modo = e.modo;
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
  $("#abas").innerHTML = NAV.filter(([id]) => id !== "ajustes" || window.innerWidth > 900).slice(0, 5).map(item).join("");
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
  const o = h.orcamento;
  const pct = o.limite ? Math.min(1, o.gasto / o.limite) : 0;
  const classeMed = o.percentual > 1 ? "estouro" : o.percentual > 0.85 ? "perto" : "";
  const varSaldo = h.saldo - h.saldo_mes_anterior;
  const maxCat = Math.max(1, ...h.categorias.map((c) => Math.max(c.total, c.media)));
  el.innerHTML = `
  <div class="pilha">
    <div class="cartao heroi">
      <div>
        <div class="rotulo">Saldo do mês</div>
        <div class="valor-gigante num ${h.saldo >= 0 ? "pos" : ""}">${brl(h.saldo, true)}</div>
        <div class="mini-linhas"><span>Entrou <b class="num">${brl(h.receitas)}</b></span><span>Saiu <b class="num">${brl(h.despesas)}</b></span></div>
        ${h.entradas_pendentes ? `<p class="mudo" style="font-size:13px;margin:12px 0 0">+ ${brl(h.entradas_pendentes)} em entradas esperando classificação.</p>` : ""}
        ${h.saldo_mes_anterior ? `<p class="mudo" style="font-size:13px;margin:8px 0 0">${varSaldo >= 0 ? "Melhor" : "Pior"} que o mês anterior em ${brl(Math.abs(varSaldo))}.</p>` : ""}
      </div>
      <div>
        <div class="rotulo">Ainda podem gastar</div>
        <div class="valor-grande num">${brl(Math.max(0, o.restante))}</div>
        ${o.restante < 0 ? `<span class="selo critico">Passou ${brl(-o.restante)} do orçamento</span>`
          : o.dias_restantes ? `<div class="mudo" style="font-size:13.5px">${brl(o.por_dia)} por dia nos ${o.dias_restantes} dias que faltam</div>` : ""}
        <div class="medidor ${classeMed}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}" aria-label="Orçamento usado"><i style="width:${pct * 100}%"></i></div>
        <div class="mudo" style="font-size:12.5px">${brl(o.gasto)} de ${brl(o.limite)} ${o.automatico ? `· orçamento automático: renda ${brl(o.renda_referencia)} − dívidas ${brl(o.compromissos_dividas)}${o.meta_poupanca ? ` − poupança ${brl(o.meta_poupanca)}` : ""}` : "· orçamento definido por vocês"}</div>
      </div>
    </div>

    <div class="grade g2">
      <div class="cartao">
        <div class="cartao-cab"><h2>O que merece atenção</h2>${h.alertas.length ? `<a class="btn-texto" href="#/ajustes">Configurar</a>` : ""}</div>
        ${h.alertas.length ? h.alertas.map(alertaHTML).join("") : `<p class="mudo">Nenhum alerta agora. Bom sinal. 🌿</p>`}
      </div>
      <div class="cartao">
        <div class="cartao-cab"><h2>Fila de dúvidas ${h.n_duvidas ? `<span class="contador">${h.n_duvidas}</span>` : ""}</h2>
          ${h.n_duvidas ? `<a class="btn btn-primario" href="#/duvidas">Classificar</a>` : ""}</div>
        ${h.duvidas.length ? `<div class="lista">${h.duvidas.map((t) => `
          <a class="tx" href="#/duvidas" style="text-decoration:none;color:inherit">
            <span class="desc">${esc(t.descricao)}</span><span class="val num">${brl(t.valor)}</span>
            <span class="meta-tx">${dataBR(t.data)} · ${esc(t.conta)}</span></a>`).join("")}</div>
          <p class="mudo" style="font-size:13px;margin:10px 0 0">Um clique por estabelecimento: o sistema aprende e classifica os parecidos sozinho.</p>`
          : `<p class="mudo">Tudo classificado. ✨</p>`}
      </div>
    </div>

    <div class="grade g2">
      <div class="cartao">
        <div class="cartao-cab"><h2>Para onde foi o dinheiro</h2><a class="btn-texto" href="#/lancamentos">Ver lançamentos</a></div>
        ${h.categorias.length ? `<div class="barras">${h.categorias.map((c) => `
          <div class="barra-linha" title="${esc(c.nome)}: ${brl(c.total)} (${c.qtd} lançamentos)${c.media ? ` · média ${brl(c.media)}` : ""}">
            <span>${esc(c.nome)}</span><span class="num">${brl(c.total)}</span>
            <div class="trilho"><i style="width:${(c.total / maxCat) * 100}%"></i>${c.media ? `<span class="media" style="left:${(c.media / maxCat) * 100}%"></span>` : ""}</div>
          </div>`).join("")}</div>
          <div class="legenda-media"><i></i> média dos 3 meses anteriores</div>` : `<p class="mudo">Sem gastos neste mês.</p>`}
      </div>
      <div class="cartao">
        <div class="cartao-cab"><h2>Metas</h2><a class="btn-texto" href="#/ajustes?metas">Editar</a></div>
        ${h.metas.length ? h.metas.map((m) => { const p = Math.min(1, m.guardado / m.valor_alvo); return `
          <div class="meta"><div class="meta-topo"><span>${esc(m.nome)}</span><span class="num">${Math.round(p * 100)}%</span></div>
          <div class="medidor"><i style="width:${p * 100}%"></i></div>
          <small class="num">${brl(m.guardado)} de ${brl(m.valor_alvo)}${m.prazo ? ` · até ${nomeMesCurto(m.prazo)}` : ""}</small></div>`; }).join("")
          : `<p class="mudo">Cadastrem a primeira meta em Ajustes (reserva, viagem, uma compra).</p>`}
      </div>
    </div>

    <div class="grade g3">
      <a class="cartao estat" href="#/dividas" style="text-decoration:none;color:inherit"><span class="rotulo">Dívidas em aberto</span>
        <span class="valor-grande num">${brl(h.dividas.total)}</span>
        <span class="mudo" style="font-size:13px">${brl(h.dividas.mensal)} por mês${h.dividas.a_confirmar.length ? ` · ${h.dividas.a_confirmar.length} a confirmar` : ""}</span></a>
      <a class="cartao estat" href="#/lancamentos?parcelados" style="text-decoration:none;color:inherit"><span class="rotulo">Parcelas ainda por vir</span>
        <span class="valor-grande num">${brl(h.parcelas_restante)}</span>
        <span class="mudo" style="font-size:13px">${h.n_parcelamentos} compra(s) parcelada(s)</span></a>
      <div class="cartao estat"><span class="rotulo">Benefício (Flash)</span>
        <span class="valor-grande num">${h.beneficios.length ? brl(h.beneficios[0].saldo) : "—"}</span>
        <span class="mudo" style="font-size:13px">saldo de benefício, fora da renda livre</span></div>
    </div>
    ${h.negocio ? `<p class="mudo" style="font-size:13px">Gastos do negócio no mês (separados do pessoal): ${brl(h.negocio)}.</p>` : ""}
  </div>`;
};

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

/* ------------------------------------------------------------------ Fila de dúvidas */
TELAS.duvidas = async (el) => {
  const d = await api("/api/duvidas");
  S.nDuvidas = d.total; montarNav();
  if (!d.itens.length) {
    el.innerHTML = `<div class="cartao vazio"><div class="grande">✨</div><h3>Fila vazia</h3><p>Tudo classificado. Quando importarem extratos novos, o que o sistema não souber aparece aqui.</p></div>`;
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
          t.escopo === "negocio" ? `<span class="tag neg">negócio</span>` : "",
          t.tipo === "transferencia" ? `<span class="tag">transferência</span>` : t.tipo === "fatura" ? `<span class="tag">fatura</span>` : "",
          t.divida ? `<span class="tag">${esc(t.divida)}</span>` : ""].join("");
        return `${dia}<div class="tx" data-id="${t.id}" tabindex="0"><span class="desc">${esc(t.descricao)}</span>
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
    <p class="mudo" style="margin:-8px 0 0">${dataBR(t.data)} · ${esc(t.conta)} · <b class="num">${brl(t.valor, true)}</b>${t.portador ? ` · cartão: ${esc(t.portador)}` : ""}</p>
    <form id="f-tx" class="grade-form">
      <label class="campo">Categoria<select name="categoria_id">${opcoes(S.cad.categorias, t.categoria_id, "Sem categoria")}</select></label>
      <label class="campo">Quem<select name="pessoa_id">${opcoes(S.cad.pessoas, t.pessoa_id)}</select></label>
      <label class="campo">Pessoal ou negócio<select name="escopo"><option value="pessoal">Pessoal</option><option value="negocio" ${t.escopo === "negocio" ? "selected" : ""}>Negócio (Rocco Kids)</option></select></label>
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
      await api(`/api/transacoes/${t.id}`, { metodo: "PATCH", corpo: { pessoa_id: v.pessoa_id, escopo: v.escopo, observacao: v.observacao } });
      $("#modal").close(); toast("Salvo"); depois(); atualizarContador();
    });
  });
}

async function recorrentes(el) {
  const { itens } = await api("/api/recorrentes");
  const ass = itens.filter((i) => i.assinatura);
  el.innerHTML = `<div class="pilha"><div class="grade g3">
      <div class="cartao estat"><span class="rotulo">Assinaturas por mês</span><span class="valor-grande num">${brl(ass.reduce((s, i) => s + i.valor_medio, 0))}</span><span class="mudo" style="font-size:13px">${ass.length} assinatura(s) · ${brl(ass.reduce((s, i) => s + i.valor_medio, 0) * 12)} por ano</span></div>
      <div class="cartao estat"><span class="rotulo">Todos os recorrentes</span><span class="valor-grande num">${brl(itens.reduce((s, i) => s + i.valor_medio, 0))}</span><span class="mudo" style="font-size:13px">${itens.length} cobrança(s) que se repetem todo mês</span></div>
    </div>
    <div class="cartao"><div class="cartao-cab"><h2>Detectados automaticamente</h2></div>
      ${itens.length ? `<div class="lista">${itens.map((i) => `<div class="tx" style="cursor:default"><span class="desc">${esc(i.chave)}</span>
        <span class="val num">${brl(i.valor_medio)}<small class="mudo" style="font-weight:400">/mês</small></span>
        <span class="meta-tx">${esc(i.categoria || "Sem categoria")} · ${esc(i.conta)} · ${i.meses} meses · próxima ~${dataBR(i.proxima)} ${i.assinatura ? '<span class="tag neg">assinatura</span>' : ""}</span></div>`).join("")}</div>`
        : `<p class="mudo">Com pelo menos 2 ou 3 meses de extrato, as cobranças repetidas aparecem aqui.</p>`}
    </div></div>`;
}

async function parcelados(el) {
  const { itens, agenda } = await api("/api/parcelamentos");
  const max = Math.max(1, ...agenda.map((a) => a.valor));
  el.innerHTML = `<div class="pilha"><div class="grade g2">
    <div class="cartao"><div class="cartao-cab"><h2>Renda futura já comprometida</h2></div>
      <div class="barras">${agenda.map((a) => `<div class="barra-linha" title="${nomeMes(a.mes)}: ${brl(a.valor)}"><span>${nomeMes(a.mes).replace(/^./, (c) => c.toUpperCase())}</span><span class="num">${brl(a.valor)}</span><div class="trilho"><i style="width:${(a.valor / max) * 100}%"></i></div></div>`).join("")}</div>
      <p class="mudo" style="font-size:13px;margin:14px 0 0">Regra do casal: evitar parcelamento. Cada parcela aqui é dinheiro de um mês que ainda não chegou.</p></div>
    <div class="cartao"><div class="cartao-cab"><h2>Compras parceladas</h2></div>
      ${itens.length ? itens.map((p) => `<div class="meta"><div class="meta-topo"><span>${esc(p.descricao)}</span><span class="num">${brl(p.restante)}</span></div>
        <div class="medidor perto"><i style="width:${(p.parcela_atual / p.parcela_total) * 100}%"></i></div>
        <small>${p.parcela_atual}/${p.parcela_total} de ${brl(p.valor_parcela)} · ${esc(p.pessoa || "")} · termina em ${nomeMesCurto(p.termina)}</small></div>`).join("")
        : `<p class="mudo">Nenhuma compra parcelada. 👏</p>`}</div>
  </div></div>`;
}

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
        <span class="mudo" style="font-size:13px">já descontada do orçamento do mês</span></div>
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

function dividaHTML(d) {
  const [st, cls] = STATUS_DIVIDA[d.status] || STATUS_DIVIDA.ativa;
  const termino = d.termino === "quitada" ? "Quitada" : d.termino ? nomeMesCurto(d.termino) : "—";
  const juros = d.juros_mensal === null ? "não informado" : `${String(d.juros_mensal).replace(".", ",")}% a.m.`;
  return `<div class="cartao"><div class="divida-cab"><div><h3>${esc(d.nome)}</h3>
      <span class="mudo" style="font-size:13px">${esc(TIPOS_DIVIDA[d.tipo] || "")}${d.credor ? " · " + esc(d.credor) : ""}${d.dia_vencimento ? ` · vence dia ${d.dia_vencimento}` : ""}</span></div>
      <span class="selo ${cls}">${st}</span></div>
    <div class="numeros">
      <div><div class="rotulo">Saldo devedor</div><div class="num">${d.saldo_atual === null ? "a confirmar" : brl(d.saldo_atual)}</div></div>
      <div><div class="rotulo">Por mês</div><div class="num">${d.mensal ? brl(d.mensal) : "—"}</div></div>
      <div><div class="rotulo">Termina</div><div class="num">${termino}</div></div>
      <div><div class="rotulo">Juros</div><div class="num" style="font-size:15px">${juros}</div></div>
    </div>
    ${d.parcelas_restantes_atual !== null ? `<p class="mudo" style="font-size:13px;margin:6px 0 0">${d.parcelas_restantes_atual} parcela(s) restante(s).</p>` : ""}
    ${d.mensal_necessario ? `<p class="mudo" style="font-size:13px;margin:6px 0 0">Para quitar até ${nomeMesCurto(d.plano_data_alvo)}: ${brl(d.mensal_necessario)} por mês.</p>` : ""}
    ${d.aviso ? `<p style="font-size:13.5px;margin:10px 0 0;color:var(--atencao)">${esc(d.aviso)}</p>` : ""}
    ${d.observacao ? `<p class="mudo" style="font-size:13.5px;margin:10px 0 0">${esc(d.observacao)}</p>` : ""}
    ${d.pagamentos.length ? `<details style="margin-top:12px"><summary class="btn-texto" style="display:inline">Pagamentos (${d.pagamentos.length})</summary>
      <ul class="historico">${d.pagamentos.map((x) => `<li>${dataBR(x.data)} · <span class="num">${brl(x.valor)}</span>${x.transacao_id ? " · encontrado no extrato" : " · registrado à mão"}</li>`).join("")}</ul></details>` : ""}
    ${d.negociacoes.length || d.status === "negociando" ? `<div style="margin-top:12px"><b style="font-size:14px">Histórico de negociação</b>
      ${d.negociacoes.length ? `<ul class="historico">${d.negociacoes.map((n) => `<li>${dataBR(n.data)}: ${esc(n.texto)}</li>`).join("")}</ul>` : `<p class="mudo" style="font-size:13px;margin:4px 0">Nada registrado ainda.</p>`}</div>` : ""}
    ${d.forma_pagamento === "cartao_1x" ? `<form class="sim" data-sim-cartao><h4>Antes de pagar no cartão: quanto isso custaria?</h4>
      <div class="grade-form"><label class="campo">Valor da dívida<input name="valor" value="${paraInput(d.saldo_atual)}" placeholder="0,00" inputmode="decimal"></label>
      <label class="campo">Resto da fatura <small>vazio = compras do mês</small><input name="fatura_sem_compra" placeholder="automático" inputmode="decimal"></label>
      <label class="campo">Quanto conseguem pagar da fatura <small>vazio = tudo</small><input name="vou_pagar" placeholder="a fatura inteira" inputmode="decimal"></label></div>
      <button class="btn" style="margin-top:12px">Simular</button><div data-res></div></form>` : ""}
    ${d.tipo === "consignado" ? `<form class="sim" data-sim-antecipar data-parcela="${d.parcela_valor || 0}" data-restantes="${d.parcelas_restantes_atual || 0}" data-juros="${d.juros_mensal ?? ""}">
      <h4>E se antecipar parcelas?</h4>
      ${d.parcelas_restantes_atual && d.juros_mensal !== null ? `<div class="grade-form"><label class="campo">Quantas parcelas antecipar (das últimas)<input type="number" name="antecipar" min="1" max="${d.parcelas_restantes_atual}" value="${Math.min(3, d.parcelas_restantes_atual)}"></label></div>
      <button class="btn" style="margin-top:12px">Simular</button><div data-res></div>`
      : `<p class="mudo" style="font-size:13.5px;margin:0">Informem em “Editar” as parcelas restantes e a taxa de juros do contrato (está no contrato ou no app do banco do seu pai). Com isso eu calculo quanto economizam antecipando.</p>`}</form>` : ""}
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
    <div class="mudo" style="font-size:12.5px;margin-top:6px">Fatura estimada: ${brl(r.fatura)} (resto da fatura considerado: ${brl(r.fatura_sem_compra)})</div></div>`;
}
async function simularAntecipacao(e) {
  e.preventDefault();
  const f = e.target;
  const r = await api("/api/simular/antecipacao", { metodo: "POST", corpo: { parcela: +f.dataset.parcela, restantes: +f.dataset.restantes, juros: f.dataset.juros, antecipar: form(f).antecipar } });
  $("[data-res]", f).innerHTML = `<div class="resultado ok">Antecipando as ${r.antecipar} últimas parcelas, pagam hoje <b>${brl(r.pagar_hoje)}</b> em vez de ${brl(r.nominal)}: economia de <b>${brl(r.economia)}</b>. Ficam ${r.restantes_depois} parcela(s).
    <div class="mudo" style="font-size:12.5px;margin-top:6px">Na antecipação os juros das parcelas futuras são descontados (CDC, art. 52). Confirmem o valor exato com o banco antes de pagar.</div></div>`;
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
      ${campo("parcelas_restantes", "Parcelas restantes", d.parcelas_restantes_atual ?? d.parcelas_restantes, 'type="number" min="0"')}
      ${campo("mes_final", "Mês da última parcela", d.mes_final, 'type="month"')}
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
        <label class="campo">Orçamento de gastos <small>vazio = renda − dívidas − poupança</small><input name="orcamento_mensal" value="${paraInput(+cfg.orcamento_mensal || null)}" inputmode="decimal" placeholder="automático"></label>
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
      <div class="chips">${S.cad.categorias.map((c) => `<button class="chip" data-cat-ed="${c.id}">${esc(c.nome)}</button>`).join("")}</div></div>

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
    <label class="campo">Tipo<select name="tipo">${[["despesa", "Despesa"], ["receita", "Receita"], ["divida", "Dívida"], ["investimento", "Investimento"], ["transferencia", "Transferência"]].map(([k, v]) => `<option value="${k}" ${c.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></form>
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
