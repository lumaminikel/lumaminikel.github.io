// =========================================================================
// ADMIN.JS — Editor do content.json que publica direto no repositório
// =========================================================================
// Fluxo: lê o content.json pela API do GitHub, você edita nos formulários e,
// ao publicar, tudo (content.json + imagens novas) vai num único commit.
// O token fica só no navegador (localStorage ou sessionStorage).
// =========================================================================

(function () {
  "use strict";

  // ---------- Configuração ----------
  const OWNER = "lumaminikel";
  const REPO = "lumaminikel.github.io";
  const BRANCH = "main";
  const API = "https://api.github.com";
  const REPO_PATH = `/repos/${OWNER}/${REPO}`;
  const TOKEN_KEY = "portfolio_admin_token";

  // ---------- Estado ----------
  let state = null; // conteúdo sendo editado (espelho do content.json)
  let loadedSha = null; // sha do content.json quando foi carregado
  let originalRefs = new Set(); // imagens referenciadas no último conteúdo publicado
  let dirty = false;
  const pending = new Map(); // caminho -> { blob, url, enviado }

  const CLASSES = { p: "enfaseprimaria", s: "enfasesecundaria", t: "enfaseterciaria" };

  // ---------- Utilidades ----------
  const $ = (id) => document.getElementById(id);

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Mesma marcação do render.js (usada só na prévia dos textos)
  function rich(texto, padrao) {
    let s = esc(texto);
    s = s.replace(
      /\{(p|s|t)\}([\s\S]*?)\{\/\1\}/g,
      (_, k, t) => `<span class="${CLASSES[k]}">${t}</span>`
    );
    if (padrao) {
      s = s.replace(/\*\*([\s\S]+?)\*\*/g, `<span class="${padrao}">$1</span>`);
    }
    return s;
  }

  function slugify(t) {
    return String(t || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function toB64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  function fromB64Utf8(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(new Error("Falha ao ler a imagem."));
      r.readAsDataURL(blob);
    });
  }

  // ---------- Token ----------
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
  function setToken(token, lembrar) {
    clearToken();
    (lembrar ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  }

  // ---------- API do GitHub ----------
  async function gh(path, opts) {
    opts = opts || {};
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: "Bearer " + getToken(),
    };
    if (opts.body) headers["Content-Type"] = "application/json";
    let resp;
    try {
      resp = await fetch(API + path, {
        method: opts.method || "GET",
        headers,
        cache: "no-store",
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      const err = new Error("Sem conexão com o GitHub. Verifique sua internet.");
      err.status = 0;
      throw err;
    }
    if (!resp.ok) {
      let detalhe = "";
      try {
        detalhe = (await resp.json()).message || "";
      } catch (e) {}
      const err = new Error(detalhe);
      err.status = resp.status;
      throw err;
    }
    return resp.status === 204 ? null : resp.json();
  }

  function msgErro(e) {
    if (e.local) return e.message;
    switch (e.status) {
      case 0:
        return e.message;
      case 401:
        return "Token inválido ou expirado. Gere um novo no GitHub.";
      case 403:
        return "O token não tem permissão. Ele precisa ser do repositório lumaminikel.github.io com Contents: Read and write.";
      case 404:
        return "Repositório ou arquivo não encontrado. Confira se o token tem acesso ao repositório e se o content.json já foi publicado.";
      case 409:
      case 422:
        return "O GitHub recusou a gravação (" + (e.message || "conflito") + "). Recarregue a página e tente de novo.";
      default:
        return e.message || "Algo deu errado. Tente novamente.";
    }
  }

  // ---------- Mensagens ----------
  let msgTimer = null;
  function mensagem(texto, tipo, link) {
    const el = $("mensagem");
    el.className = tipo || "";
    el.replaceChildren(document.createTextNode(texto));
    if (link) {
      el.append(" ", h("a", { href: link.url, target: "_blank", rel: "noopener" }, link.texto));
    }
    el.hidden = false;
    clearTimeout(msgTimer);
    if (tipo !== "erro") msgTimer = setTimeout(() => (el.hidden = true), tipo === "ok" ? 12000 : 4000);
  }

  // ---------- Helper de DOM ----------
  function h(tag, props) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    });
    const filhos = Array.prototype.slice.call(arguments, 2).flat();
    filhos.forEach((c) => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(c));
    });
    return el;
  }

  // ---------- Estado de alterações ----------
  function marcarAlterado() {
    dirty = true;
    const e = $("estado");
    e.textContent = "● Alterações não publicadas";
    e.className = "sujo";
    $("btn-salvar").disabled = false;
  }
  function marcarLimpo() {
    dirty = false;
    const e = $("estado");
    e.textContent = "Tudo publicado";
    e.className = "";
    $("btn-salvar").disabled = true;
  }
  window.addEventListener("beforeunload", (ev) => {
    if (dirty) {
      ev.preventDefault();
      ev.returnValue = "";
    }
  });

  // ---------- Componentes de formulário ----------
  function envolver(el, antes, depois) {
    const ini = el.selectionStart;
    const fim = el.selectionEnd;
    const sel = el.value.slice(ini, fim) || "texto";
    el.setRangeText(antes + sel + depois, ini, fim, "select");
    el.focus();
    el.dispatchEvent(new Event("input"));
  }

  // Campo de texto ligado a obj[chave]. opc: multi, linhas, rico, padrao, ajuda, placeholder
  function campo(rotulo, obj, chave, opc) {
    opc = opc || {};
    const entrada = opc.multi
      ? h("textarea", { rows: opc.linhas || 3, placeholder: opc.placeholder })
      : h("input", { type: "text", placeholder: opc.placeholder });
    entrada.value = obj[chave] == null ? "" : obj[chave];

    const previa = opc.rico ? h("div", { class: "previa" }) : null;
    const atualizar = () => {
      if (previa) previa.innerHTML = rich(entrada.value, opc.padrao || null);
    };
    entrada.addEventListener("input", () => {
      obj[chave] = entrada.value;
      marcarAlterado();
      atualizar();
    });
    atualizar();

    let barra = null;
    if (opc.rico) {
      const marcas = [];
      if (opc.padrao) marcas.push(["Destaque", "**", "**"]);
      marcas.push(["Roxo", "{p}", "{/p}"], ["Laranja", "{s}", "{/s}"], ["Claro", "{t}", "{/t}"]);
      barra = h(
        "div",
        { class: "barra" },
        marcas.map(([nome, a, b]) =>
          h("button", { type: "button", class: "mini", onclick: () => envolver(entrada, a, b) }, nome)
        )
      );
    }

    return h(
      "div",
      { class: "campo" },
      h("label", {}, rotulo),
      barra,
      entrada,
      previa,
      opc.ajuda ? h("small", {}, opc.ajuda) : null
    );
  }

  // Textarea onde cada linha vira um item do array
  function campoLinhas(rotulo, obj, chave, ajuda) {
    const ta = h("textarea", { rows: 6 });
    ta.value = (obj[chave] || []).join("\n");
    ta.addEventListener("input", () => {
      obj[chave] = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
      marcarAlterado();
    });
    return h("div", { class: "campo" }, h("label", {}, rotulo), ta, ajuda ? h("small", {}, ajuda) : null);
  }

  // Input que guarda um array separado por vírgula
  function campoLista(rotulo, obj, chave, ajuda) {
    const inp = h("input", { type: "text" });
    inp.value = (obj[chave] || []).join(", ");
    inp.addEventListener("input", () => {
      obj[chave] = inp.value.split(",").map((s) => s.trim()).filter(Boolean);
      marcarAlterado();
    });
    return h("div", { class: "campo" }, h("label", {}, rotulo), inp, ajuda ? h("small", {}, ajuda) : null);
  }

  // Lista editável com subir / descer / remover / adicionar
  function lista(arr, criarItem, novo, rotuloAdd, titulo) {
    const wrap = h("div", { class: "lista" });

    function mover(i, d) {
      const j = i + d;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      marcarAlterado();
      desenhar();
    }
    function remover(i) {
      if (!confirm("Remover este item?")) return;
      arr.splice(i, 1);
      marcarAlterado();
      desenhar();
    }
    function desenhar() {
      wrap.replaceChildren();
      arr.forEach((item, i) => {
        wrap.append(
          h(
            "div",
            { class: "item" },
            h(
              "div",
              { class: "item-topo" },
              h("strong", {}, titulo(item, i)),
              h(
                "span",
                { class: "acoes" },
                h("button", { type: "button", class: "mini", title: "Subir", disabled: i === 0, onclick: () => mover(i, -1) }, "↑"),
                h("button", { type: "button", class: "mini", title: "Descer", disabled: i === arr.length - 1, onclick: () => mover(i, 1) }, "↓"),
                h("button", { type: "button", class: "mini perigo", title: "Remover", onclick: () => remover(i) }, "✕")
              )
            ),
            criarItem(item, i)
          )
        );
      });
      wrap.append(
        h(
          "button",
          {
            type: "button",
            class: "btn sec",
            onclick: () => {
              arr.push(novo());
              marcarAlterado();
              desenhar();
            },
          },
          "+ " + rotuloAdd
        )
      );
    }
    desenhar();
    return wrap;
  }

  // ---------- Imagens ----------
  function previewSrc(caminho) {
    const p = pending.get(caminho);
    return p ? p.url : caminho || "";
  }

  // Redimensiona e converte para WebP (ou JPEG, se o navegador não gerar WebP)
  async function processarImagem(file, limite) {
    const bmp = await createImageBitmap(file);
    let escala = 1;
    if (limite.ladoMax) escala = Math.min(1, limite.ladoMax / Math.max(bmp.width, bmp.height));
    else if (limite.larguraMax) escala = Math.min(1, limite.larguraMax / bmp.width);
    const w = Math.max(1, Math.round(bmp.width * escala));
    const hgt = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, w, hgt);
    const toBlob = (tipo, q) => new Promise((res) => canvas.toBlob(res, tipo, q));
    let blob = await toBlob("image/webp", 0.85);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, hgt);
      blob = await toBlob("image/jpeg", 0.88);
      ext = "jpg";
    }
    if (!blob) throw new Error("Não foi possível converter a imagem.");
    return { blob, ext, w, h: hgt };
  }

  // Campo de imagem: mostra a atual e permite trocar. opc: prefixo (função), ladoMax / larguraMax
  function campoImagem(rotulo, obj, chave, opc) {
    const prev = h("img", { class: "prev-img", alt: "" });
    prev.src = previewSrc(obj[chave]);
    const info = h("small", {}, obj[chave] || "Sem imagem");
    const entrada = h("input", { type: "file", accept: "image/*" });

    entrada.addEventListener("change", async () => {
      const file = entrada.files && entrada.files[0];
      if (!file) return;
      try {
        mensagem("Processando imagem…");
        const r = await processarImagem(file, opc);
        const caminho = `assets/${opc.prefixo()}-${Date.now()}.${r.ext}`;
        const antigo = pending.get(obj[chave]);
        if (antigo && !antigo.enviado) {
          URL.revokeObjectURL(antigo.url);
          pending.delete(obj[chave]);
        }
        pending.set(caminho, { blob: r.blob, url: URL.createObjectURL(r.blob), enviado: false });
        obj[chave] = caminho;
        prev.src = previewSrc(caminho);
        info.textContent = `Nova imagem: ${r.w}×${r.h}px, ${Math.round(r.blob.size / 1024)} KB (será enviada ao publicar)`;
        marcarAlterado();
        $("mensagem").hidden = true;
      } catch (e) {
        mensagem("Não consegui processar essa imagem. Tente outro arquivo (JPG, PNG ou WebP).", "erro");
      }
      entrada.value = "";
    });

    return h(
      "div",
      { class: "campo" },
      h("label", {}, rotulo),
      h("div", { class: "img-campo" }, prev, h("div", { class: "lado" }, entrada, info))
    );
  }

  // Lista suspensa ligada a obj[chave]
  function campoSelect(rotulo, obj, chave, opcoes, ajuda) {
    const sel = h("select", {}, opcoes.map(([v, n]) => h("option", { value: v }, n)));
    sel.value = obj[chave] || opcoes[0][0];
    sel.addEventListener("change", () => {
      obj[chave] = sel.value;
      marcarAlterado();
    });
    return h("div", { class: "campo" }, h("label", {}, rotulo), sel, ajuda ? h("small", {}, ajuda) : null);
  }

  // ---------- Blocos da página do projeto ----------
  const TIPOS_BLOCO = [
    ["titulo", "Título de seção"],
    ["texto", "Texto"],
    ["imagem", "Imagem"],
    ["galeria", "Galeria de imagens"],
    ["destaque", "Frase em destaque"],
  ];

  function tituloBloco(b) {
    const nomes = Object.fromEntries(TIPOS_BLOCO);
    const base = nomes[b.tipo] || "Bloco";
    const t = String(b.texto || b.conteudo || b.legenda || "").replace(/\s+/g, " ").trim();
    return t ? base + " — " + (t.length > 40 ? t.slice(0, 40) + "…" : t) : base;
  }

  function mudarTipoBloco(b, tipo) {
    const txt = b.texto != null ? b.texto : b.conteudo != null ? b.conteudo : "";
    Object.keys(b).forEach((k) => delete b[k]);
    b.tipo = tipo;
    if (tipo === "titulo") b.texto = txt;
    else if (tipo === "texto" || tipo === "destaque") b.conteudo = txt;
    else if (tipo === "imagem") Object.assign(b, { src: "", alt: "", legenda: "", modo: "inteira" });
    else if (tipo === "galeria") b.imagens = [];
  }

  function editorBloco(b, p) {
    const caixa = h("div", {});
    const prefixo = () => (slugify(p.titulo) || "projeto") + "-bloco";

    function desenhar() {
      caixa.replaceChildren();
      const sel = h("select", {}, TIPOS_BLOCO.map(([v, n]) => h("option", { value: v }, n)));
      sel.value = b.tipo;
      sel.addEventListener("change", () => {
        mudarTipoBloco(b, sel.value);
        marcarAlterado();
        desenhar();
      });
      caixa.append(h("div", { class: "campo" }, h("label", {}, "Tipo de bloco"), sel));

      if (b.tipo === "titulo") {
        caixa.append(campo("Título da seção", b, "texto", { placeholder: "Ex.: O desafio" }));
      } else if (b.tipo === "texto") {
        caixa.append(
          campo("Texto", b, "conteudo", {
            multi: true,
            linhas: 6,
            rico: true,
            padrao: CLASSES.s,
            ajuda: "Linha em branco separa parágrafos. Linhas começando com “- ” viram lista.",
          })
        );
      } else if (b.tipo === "destaque") {
        caixa.append(campo("Frase em destaque", b, "conteudo", { multi: true, linhas: 3, rico: true, padrao: CLASSES.s }));
      } else if (b.tipo === "imagem") {
        caixa.append(
          campoImagem("Imagem", b, "src", { larguraMax: 1600, prefixo }),
          campo("Descrição da imagem (acessibilidade)", b, "alt"),
          campo("Legenda (opcional)", b, "legenda"),
          campoSelect(
            "Exibição",
            b,
            "modo",
            [
              ["inteira", "Imagem inteira"],
              ["recortada", "Recortada no topo (clique abre inteira) — boa para prints longos"],
            ]
          )
        );
      } else if (b.tipo === "galeria") {
        caixa.append(
          lista(
            b.imagens,
            (i) =>
              h(
                "div",
                {},
                campoImagem("Imagem", i, "src", { larguraMax: 1600, prefixo }),
                h("div", { class: "grade" }, campo("Descrição (acessibilidade)", i, "alt"), campo("Legenda (opcional)", i, "legenda"))
              ),
            () => ({ src: "", alt: "", legenda: "" }),
            "Adicionar imagem",
            (_, n) => "Imagem " + (n + 1)
          )
        );
      }
    }
    desenhar();
    return caixa;
  }

  // ---------- Painéis ----------
  function painel(id, titulo, sub, ...conteudo) {
    return h("section", { class: "painel", id: "painel-" + id, hidden: true }, h("h2", {}, titulo), h("p", { class: "sub" }, sub), conteudo);
  }

  function painelGeral() {
    return painel(
      "geral",
      "Geral",
      "Contato e rodapé do site.",
      campo("WhatsApp", state.contato, "whatsapp", { ajuda: "Só números, com 55 e DDD. Ex.: 5555981241369" }),
      campo("Texto do rodapé", state, "rodape", { ajuda: "{ano} é trocado pelo ano atual automaticamente." })
    );
  }

  function painelInicio() {
    return painel(
      "inicio",
      "Início",
      "Apresentação no topo do site e sua foto.",
      campo("Saudação", state.hero, "saudacao", { rico: true }),
      campo("Título principal", state.hero, "titulo", { rico: true }),
      campo("Texto de apresentação", state.hero, "texto", { multi: true, rico: true }),
      campoImagem("Sua foto", state.hero, "foto", { ladoMax: 1200, prefixo: () => "foto" }),
      campo("Descrição da foto (acessibilidade)", state.hero, "fotoAlt")
    );
  }

  function painelSobre() {
    return painel(
      "sobre",
      "Sobre mim",
      "Parágrafos da seção “Minha História”. Use o botão Destaque para realçar trechos.",
      lista(
        state.sobre.paragrafos,
        (_, i) => campo("Parágrafo", state.sobre.paragrafos, i, { multi: true, linhas: 4, rico: true, padrao: CLASSES.s }),
        () => "",
        "Adicionar parágrafo",
        (_, i) => "Parágrafo " + (i + 1)
      )
    );
  }

  function painelExperiencia() {
    return painel(
      "experiencia",
      "Experiência",
      "Linha do tempo profissional. A ordem aqui é a ordem no site (mais recente primeiro).",
      lista(
        state.experiencia,
        (e) =>
          h(
            "div",
            {},
            h("div", { class: "grade" }, campo("Período", e, "periodo", { placeholder: "Abr 2026 — Presente" }), campo("Empresa", e, "empresa")),
            campo("Cargo", e, "cargo"),
            h("label", { class: "campo", style: "color:#dcc6ff;font-size:13px;font-weight:600;display:block;margin-bottom:6px" }, "Descrição (um bloco por parágrafo)"),
            lista(
              e.descricao,
              (_, i) => campo("Parágrafo", e.descricao, i, { multi: true, rico: true, padrao: CLASSES.t }),
              () => "",
              "Adicionar parágrafo",
              (_, i) => "Parágrafo " + (i + 1)
            )
          ),
        () => ({ periodo: "", empresa: "", cargo: "", descricao: [""] }),
        "Adicionar experiência",
        (e) => e.empresa || "Nova experiência"
      )
    );
  }

  function painelSkills() {
    return painel(
      "skills",
      "Skills",
      "Grupos de competências. Em cada grupo, escreva uma skill por linha.",
      lista(
        state.skills,
        (g) => h("div", {}, campo("Nome do grupo", g, "titulo"), campoLinhas("Skills (uma por linha)", g, "itens")),
        () => ({ titulo: "", itens: [] }),
        "Adicionar grupo",
        (g) => g.titulo || "Novo grupo"
      )
    );
  }

  function painelProjetos() {
    return painel(
      "projetos",
      "Projetos",
      "Cards da seção “Meus Projetos”.",
      lista(
        state.projetos,
        (p) =>
          h(
            "div",
            {},
            h("div", { class: "grade" }, campo("Título", p, "titulo"), campo("Identificador (slug)", p, "slug", { ajuda: "Deixe vazio para gerar a partir do título. Será usado na página do projeto." })),
            campoLista("Tecnologias", p, "tecnologias", "Separe por vírgula. Ex.: WordPress, Elementor, SEO"),
            campo("Descrição", p, "descricao", { multi: true }),
            campoImagem("Imagem do card", p, "imagem", { larguraMax: 1400, prefixo: () => slugify(p.titulo) || "projeto" }),
            campo("Descrição da imagem (acessibilidade)", p, "imagemAlt"),
            h("label", { class: "campo", style: "color:#dcc6ff;font-size:13px;font-weight:600;display:block;margin-bottom:6px" }, "Botões"),
            lista(
              p.botoes,
              (b) => h("div", { class: "grade" }, campo("Texto do botão", b, "texto"), campo("Link", b, "url", { placeholder: "https://" })),
              () => ({ texto: "Ver projeto", url: "https://" }),
              "Adicionar botão",
              (b) => b.texto || "Botão"
            ),
            h("h3", { class: "sub-titulo" }, "Página do projeto"),
            h("p", { class: "dica" }, "Conte como o projeto foi feito. O botão “Ver detalhes” aparece no card assim que houver pelo menos um bloco."),
            campo("Subtítulo da página", p.pagina, "subtitulo", { multi: true, linhas: 2, rico: true, padrao: CLASSES.s, ajuda: "Frase logo abaixo do título. Se ficar vazio, usa a descrição do card." }),
            h("label", { class: "campo", style: "color:#dcc6ff;font-size:13px;font-weight:600;display:block;margin-bottom:6px" }, "Informações rápidas (ano, função, cliente…)"),
            lista(
              p.pagina.detalhes,
              (d) => h("div", { class: "grade" }, campo("Rótulo", d, "rotulo", { placeholder: "Ano" }), campo("Valor", d, "valor", { placeholder: "2025" })),
              () => ({ rotulo: "", valor: "" }),
              "Adicionar informação",
              (d) => d.rotulo || "Informação"
            ),
            h("label", { class: "campo", style: "color:#dcc6ff;font-size:13px;font-weight:600;display:block;margin-bottom:6px" }, "Conteúdo da página (blocos, na ordem em que aparecem)"),
            lista(p.pagina.blocos, (b) => editorBloco(b, p), () => ({ tipo: "texto", conteudo: "" }), "Adicionar bloco", tituloBloco),
            h(
              "button",
              {
                type: "button",
                class: "btn sec",
                onclick: () => window.open("projeto.html?p=" + encodeURIComponent(p.slug || slugify(p.titulo)), "_blank", "noopener"),
              },
              "Abrir página do projeto (depois de publicar)"
            )
          ),
        () => ({ slug: "", titulo: "", tecnologias: [], descricao: "", imagem: "", imagemAlt: "", botoes: [{ texto: "Ver projeto", url: "https://" }] }),
        "Adicionar projeto",
        (p) => p.titulo || "Novo projeto"
      )
    );
  }

  const ABAS = [
    ["geral", "Geral", painelGeral],
    ["inicio", "Início", painelInicio],
    ["sobre", "Sobre", painelSobre],
    ["experiencia", "Experiência", painelExperiencia],
    ["skills", "Skills", painelSkills],
    ["projetos", "Projetos", painelProjetos],
  ];

  function mostrarAba(id) {
    ABAS.forEach(([aid]) => {
      $("painel-" + aid).hidden = aid !== id;
      $("aba-" + aid).classList.toggle("ativa", aid === id);
    });
  }

  function montarEditor() {
    const abas = $("abas");
    const paineis = $("paineis");
    abas.replaceChildren();
    paineis.replaceChildren();
    ABAS.forEach(([id, nome, fn]) => {
      abas.append(h("button", { type: "button", id: "aba-" + id, onclick: () => mostrarAba(id) }, nome));
      paineis.append(fn());
    });
    mostrarAba("geral");
  }

  // ---------- Carregar conteúdo ----------
  function normalizar(c) {
    c.contato = c.contato || {};
    c.hero = c.hero || {};
    c.sobre = c.sobre || {};
    c.sobre.paragrafos = c.sobre.paragrafos || [];
    c.experiencia = c.experiencia || [];
    c.experiencia.forEach((e) => (e.descricao = e.descricao || []));
    c.skills = c.skills || [];
    c.skills.forEach((g) => (g.itens = g.itens || []));
    c.projetos = c.projetos || [];
    c.projetos.forEach((p) => {
      p.tecnologias = p.tecnologias || [];
      p.botoes = p.botoes || [];
      p.pagina = p.pagina || {};
      p.pagina.subtitulo = p.pagina.subtitulo || "";
      p.pagina.detalhes = p.pagina.detalhes || [];
      p.pagina.blocos = p.pagina.blocos || [];
      p.pagina.blocos.forEach((b) => {
        if (b.tipo === "galeria") b.imagens = b.imagens || [];
      });
    });
    c.rodape = c.rodape || "";
    return c;
  }

  function imagensReferenciadas(c) {
    const s = new Set();
    if (c.hero && c.hero.foto) s.add(c.hero.foto);
    (c.projetos || []).forEach((p) => {
      if (p.imagem) s.add(p.imagem);
      ((p.pagina && p.pagina.blocos) || []).forEach((b) => {
        if (b.tipo === "imagem" && b.src) s.add(b.src);
        if (b.tipo === "galeria") (b.imagens || []).forEach((i) => i.src && s.add(i.src));
      });
    });
    return s;
  }

  async function iniciar() {
    const repo = await gh(REPO_PATH);
    if (repo.permissions && repo.permissions.push === false) {
      const err = new Error("");
      err.status = 403;
      throw err;
    }
    const arq = await gh(`${REPO_PATH}/contents/content.json?ref=${BRANCH}`);
    state = normalizar(JSON.parse(fromB64Utf8(arq.content)));
    loadedSha = arq.sha;
    originalRefs = imagensReferenciadas(state);
    montarEditor();
    marcarLimpo();
    $("tela-login").hidden = true;
    $("tela-editor").hidden = false;
  }

  // ---------- Publicar ----------
  function validar() {
    const erros = [];
    const zap = String(state.contato.whatsapp || "").replace(/\D/g, "");
    if (zap.length < 12 || zap.length > 13) erros.push("WhatsApp: use só números, com 55 + DDD + número (12 ou 13 dígitos).");
    if (!state.hero.foto) erros.push("Início: falta a foto.");

    const slugs = new Set();
    state.projetos.forEach((p, i) => {
      const nome = p.titulo || "Projeto " + (i + 1);
      if (!p.titulo) erros.push(`Projeto ${i + 1}: falta o título.`);
      if (!p.imagem) erros.push(`${nome}: falta a imagem.`);
      if (!p.slug) p.slug = slugify(p.titulo);
      let base = p.slug || "projeto";
      let slug = base;
      let n = 2;
      while (slugs.has(slug)) slug = base + "-" + n++;
      p.slug = slug;
      slugs.add(slug);
      p.botoes.forEach((b) => {
        try {
          const u = new URL(b.url);
          if (!["http:", "https:"].includes(u.protocol)) throw new Error();
        } catch (e) {
          erros.push(`${nome}: o link do botão "${b.texto || ""}" não é válido (precisa começar com https://).`);
        }
      });
      p.pagina.blocos.forEach((b, j) => {
        const onde = `${nome}, bloco ${j + 1}`;
        if (b.tipo === "imagem" && !b.src) erros.push(`${onde}: falta a imagem.`);
        else if (b.tipo === "galeria") {
          if (!b.imagens.length) erros.push(`${onde}: a galeria está vazia.`);
          else if (b.imagens.some((i) => !i.src)) erros.push(`${onde}: há imagem sem arquivo na galeria.`);
        } else if (b.tipo === "titulo" && !String(b.texto || "").trim()) erros.push(`${onde}: o título está vazio.`);
        else if ((b.tipo === "texto" || b.tipo === "destaque") && !String(b.conteudo || "").trim()) erros.push(`${onde}: o texto está vazio.`);
      });
    });
    if (erros.length) {
      alert("Corrija antes de publicar:\n\n• " + erros.join("\n• "));
      return false;
    }
    return true;
  }

  async function publicar() {
    if (!validar()) return;

    const atuais = imagensReferenciadas(state);
    const enviar = [...pending.entries()].filter(([caminho, v]) => atuais.has(caminho) && !v.enviado).map(([c]) => c);
    const remover = [...originalRefs].filter((c) => !atuais.has(c) && c.startsWith("assets/"));

    let resumo = "Publicar as alterações no site?\n\n• content.json atualizado";
    if (enviar.length) resumo += `\n• ${enviar.length} imagem(ns) nova(s)`;
    if (remover.length) resumo += `\n• ${remover.length} imagem(ns) não usada(s) removida(s):\n    ` + remover.join("\n    ");
    if (!confirm(resumo)) return;

    const btn = $("btn-salvar");
    btn.disabled = true;
    mensagem("Publicando…");
    try {
      // 1. Garante que ninguém mexeu no content.json desde que a página abriu
      const atual = await gh(`${REPO_PATH}/contents/content.json?ref=${BRANCH}`);
      if (atual.sha !== loadedSha) {
        const err = new Error("O content.json foi alterado fora do admin. Recarregue a página para não sobrescrever essa mudança.");
        err.status = 409;
        err.local = true;
        throw err;
      }

      // 2. Commit atual e árvore base
      const ref = await gh(`${REPO_PATH}/git/ref/heads/${BRANCH}`);
      const commitBase = ref.object.sha;
      const commit = await gh(`${REPO_PATH}/git/commits/${commitBase}`);
      const treeBase = commit.tree.sha;

      // 3. Blobs (content.json + imagens novas)
      const entradas = [];
      const jsonTexto = JSON.stringify(state, null, 2) + "\n";
      const blobJson = await gh(`${REPO_PATH}/git/blobs`, { method: "POST", body: { content: jsonTexto, encoding: "utf-8" } });
      entradas.push({ path: "content.json", mode: "100644", type: "blob", sha: blobJson.sha });
      for (const caminho of enviar) {
        const b64 = await blobToB64(pending.get(caminho).blob);
        const blob = await gh(`${REPO_PATH}/git/blobs`, { method: "POST", body: { content: b64, encoding: "base64" } });
        entradas.push({ path: caminho, mode: "100644", type: "blob", sha: blob.sha });
      }

      // 4. Remoções (só de arquivos que realmente existem no repositório)
      if (remover.length) {
        const arvore = await gh(`${REPO_PATH}/git/trees/${treeBase}?recursive=1`);
        const existentes = new Set(arvore.tree.map((t) => t.path));
        remover.filter((c) => existentes.has(c)).forEach((c) => entradas.push({ path: c, mode: "100644", type: "blob", sha: null }));
      }

      // 5. Árvore, commit e atualização da branch
      const novaArvore = await gh(`${REPO_PATH}/git/trees`, { method: "POST", body: { base_tree: treeBase, tree: entradas } });
      const msg = "Atualiza conteúdo pelo admin" + (enviar.length ? ` (+${enviar.length} imagem(ns))` : "");
      const novoCommit = await gh(`${REPO_PATH}/git/commits`, { method: "POST", body: { message: msg, tree: novaArvore.sha, parents: [commitBase] } });
      await gh(`${REPO_PATH}/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: novoCommit.sha } });

      // 6. Atualiza o estado local
      loadedSha = blobJson.sha;
      originalRefs = atuais;
      enviar.forEach((c) => (pending.get(c).enviado = true));
      marcarLimpo();
      mensagem("Publicado! O site atualiza em cerca de 1 minuto.", "ok", { url: "index.html", texto: "Ver site" });
    } catch (e) {
      btn.disabled = false;
      mensagem(msgErro(e), "erro");
    }
  }

  // ---------- Eventos de início ----------
  async function entrar() {
    const t = $("campo-token").value.trim();
    if (!t) return;
    setToken(t, $("lembrar").checked);
    $("erro-login").textContent = "";
    $("btn-entrar").disabled = true;
    try {
      await iniciar();
      $("campo-token").value = "";
    } catch (e) {
      clearToken();
      $("erro-login").textContent = msgErro(e);
    }
    $("btn-entrar").disabled = false;
  }

  $("btn-entrar").addEventListener("click", entrar);
  $("campo-token").addEventListener("keydown", (e) => {
    if (e.key === "Enter") entrar();
  });
  $("btn-salvar").addEventListener("click", publicar);
  $("btn-sair").addEventListener("click", () => {
    if (dirty && !confirm("Há alterações não publicadas. Sair mesmo assim?")) return;
    dirty = false;
    clearToken();
    location.reload();
  });

  // Se já existe token salvo, tenta entrar direto
  (async function auto() {
    if (!getToken()) {
      $("tela-login").hidden = false;
      return;
    }
    try {
      await iniciar();
    } catch (e) {
      clearToken();
      $("tela-login").hidden = false;
      $("erro-login").textContent = msgErro(e);
    }
  })();
})();
