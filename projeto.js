// =========================================================================
// PROJETO.JS — Monta projeto.html?p=<slug> a partir do content.json
// =========================================================================
// Mesma marcação de ênfase do restante do site:
//   {p}texto{/p} roxo | {s}texto{/s} laranja | {t}texto{/t} roxo claro
//   **texto** laranja (ênfase padrão dos textos da página)
// Nos blocos de texto: linha em branco separa parágrafos e linhas que
// começam com "- " viram lista. Todo texto é escapado antes da marcação.
// =========================================================================

(function () {
  "use strict";

  const CLASSES = {
    p: "enfaseprimaria",
    s: "enfasesecundaria",
    t: "enfaseterciaria",
  };

  function esc(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function rich(texto, padrao) {
    let s = esc(texto);
    s = s.replace(
      /\{(p|s|t)\}([\s\S]*?)\{\/\1\}/g,
      (_, k, t) => `<span class="${CLASSES[k]}">${t}</span>`
    );
    if (padrao) {
      s = s.replace(
        /\*\*([\s\S]+?)\*\*/g,
        `<span class="${padrao}">$1</span>`
      );
    }
    return s;
  }

  function safeUrl(url) {
    try {
      const u = new URL(url, location.href);
      return ["http:", "https:", "mailto:"].includes(u.protocol) ? url : "#";
    } catch (e) {
      return "#";
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function temPagina(p) {
    return !!(p.pagina && Array.isArray(p.pagina.blocos) && p.pagina.blocos.length);
  }

  function linkProjeto(p) {
    return "projeto.html?p=" + encodeURIComponent(p.slug);
  }

  // ---------- Blocos ----------
  function paragrafos(texto) {
    return String(texto == null ? "" : texto)
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((bloco) => {
        const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
        if (linhas.every((l) => l.startsWith("- "))) {
          return `<ul>${linhas
            .map((l) => `<li>${rich(l.slice(2), CLASSES.s)}</li>`)
            .join("")}</ul>`;
        }
        return `<p>${linhas.map((l) => rich(l, CLASSES.s)).join("<br>")}</p>`;
      })
      .join("");
  }

  function figura(src, alt, legenda, classe) {
    if (!src) return "";
    return `
      <figure class="pj-figura ${classe || ""}">
        <button type="button" class="pj-zoom" data-src="${esc(src)}" data-alt="${esc(alt)}" aria-label="Ampliar imagem">
          <img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">
        </button>
        ${legenda ? `<figcaption>${rich(legenda)}</figcaption>` : ""}
      </figure>`;
  }

  function bloco(b) {
    switch (b.tipo) {
      case "titulo":
        return `<h2 class="pj-h2">${rich(b.texto)}</h2>`;
      case "texto":
        return `<div class="pj-texto">${paragrafos(b.conteudo)}</div>`;
      case "destaque":
        return `<blockquote class="pj-destaque">${rich(b.conteudo, CLASSES.s)}</blockquote>`;
      case "imagem":
        return figura(b.src, b.alt, b.legenda, b.modo === "recortada" ? "pj-recortada" : "");
      case "galeria":
        return `<div class="pj-galeria">${(b.imagens || [])
          .map((i) => figura(i.src, i.alt, i.legenda))
          .join("")}</div>`;
      default:
        return "";
    }
  }

  // ---------- Página ----------
  function renderPagina(c, slug) {
    const projetos = c.projetos || [];
    const p = projetos.find((x) => x.slug === slug);
    const main = $("projeto");

    if (!p) {
      document.title = "Projeto não encontrado · Luma Minikel";
      main.innerHTML = `
        <div class="pj-vazio">
          <p>Não encontrei esse projeto.</p>
          <a class="primary" href="index.html#projects">Ver todos os projetos</a>
        </div>`;
      return;
    }

    const pagina = p.pagina || {};
    const subtitulo = pagina.subtitulo || p.descricao || "";

    document.title = `${p.titulo} · Luma Minikel`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && subtitulo) meta.setAttribute("content", subtitulo);

    const detalhes = (pagina.detalhes || []).filter((d) => d.rotulo && d.valor);

    // Navegação entre os projetos que têm página
    const lista = projetos.filter(temPagina);
    const i = lista.findIndex((x) => x.slug === slug);
    const anterior = i > 0 ? lista[i - 1] : null;
    const proximo = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;

    main.innerHTML = `
      <article class="pj">
        <a class="pj-voltar" href="index.html#projects">← Voltar aos projetos</a>

        <div class="pj-cabecalho">
          <p class="pj-tec">${esc((p.tecnologias || []).join(" | "))}</p>
          <h1>${esc(p.titulo)}</h1>
          ${subtitulo ? `<p class="pj-subtitulo">${rich(subtitulo, CLASSES.s)}</p>` : ""}
          ${
            detalhes.length
              ? `<dl class="pj-detalhes">${detalhes
                  .map((d) => `<div><dt>${esc(d.rotulo)}</dt><dd>${esc(d.valor)}</dd></div>`)
                  .join("")}</dl>`
              : ""
          }
          ${
            (p.botoes || []).length
              ? `<div class="pj-botoes">${p.botoes
                  .map(
                    (b) =>
                      `<a class="primary" href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener noreferrer">${esc(b.texto)}</a>`
                  )
                  .join("")}</div>`
              : ""
          }
        </div>

        ${
          p.imagem
            ? `<div class="pj-capa"><img src="${esc(p.imagem)}" alt="${esc(p.imagemAlt || p.titulo)}"></div>`
            : ""
        }

        <div class="pj-corpo">${(pagina.blocos || []).map(bloco).join("")}</div>

        ${
          anterior || proximo
            ? `<nav class="pj-navegacao" aria-label="Outros projetos">
                ${anterior ? `<a class="outline" href="${esc(linkProjeto(anterior))}">← ${esc(anterior.titulo)}</a>` : ""}
                ${proximo ? `<a class="outline" href="${esc(linkProjeto(proximo))}">${esc(proximo.titulo)} →</a>` : ""}
              </nav>`
            : ""
        }
      </article>`;

    if (c.rodape) {
      $("rodape-texto").textContent = String(c.rodape).replace("{ano}", new Date().getFullYear());
    }
  }

  // ---------- Imagem ampliada ----------
  function abrirZoom(src, alt) {
    const fundo = document.createElement("div");
    fundo.className = "pj-lightbox";
    fundo.setAttribute("role", "dialog");
    fundo.setAttribute("aria-label", "Imagem ampliada");
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    fundo.append(img);

    const tecla = (e) => {
      if (e.key === "Escape") fechar();
    };
    function fechar() {
      fundo.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", tecla);
    }
    fundo.addEventListener("click", fechar);
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    document.body.append(fundo);
  }

  $("projeto").addEventListener("click", (e) => {
    const botao = e.target.closest(".pj-zoom");
    if (botao) abrirZoom(botao.dataset.src, botao.dataset.alt);
  });

  // ---------- Início ----------
  const slug = new URLSearchParams(location.search).get("p") || "";

  fetch("content.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((c) => renderPagina(c, slug))
    .catch((err) => {
      console.error("Não foi possível carregar o content.json:", err);
      $("projeto").innerHTML =
        '<div class="pj-vazio"><p>Não foi possível carregar o projeto.</p><a class="primary" href="index.html#projects">Voltar aos projetos</a></div>';
    });
})();
