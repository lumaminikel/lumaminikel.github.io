// =========================================================================
// RENDER.JS — Monta o conteúdo do site a partir do content.json
// =========================================================================
// Marcação de ênfase usada nos textos do content.json:
//   {p}texto{/p}  -> cor primária (roxo)
//   {s}texto{/s}  -> cor secundária (laranja)
//   {t}texto{/t}  -> cor terciária (roxo claro)
//   **texto**     -> ênfase padrão da seção (laranja no "Sobre", roxo claro na "Experiência")
// Todo texto é escapado antes de aplicar a marcação, então HTML digitado
// no JSON nunca é interpretado.
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

  // Converte a marcação de ênfase em <span>. "padrao" é a classe usada por **...**
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

  // Só aceita links http(s), mailto ou relativos (bloqueia javascript: etc.)
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

  // O número do WhatsApp NÃO fica no HTML nem nos links da página: o href só
  // recebe o número quando alguém interage (passa o mouse, toca, foca ou clica).
  // Assim robôs que apenas leem a página não encontram o número.
  function renderContato(c) {
    const numero = String(c.whatsapp || "").replace(/\D/g, "");
    const montar = (a) => {
      if (numero) a.href = "https://wa.me/" + numero;
    };
    document.querySelectorAll("[data-whatsapp]").forEach((a) => {
      a.href = "#";
      ["pointerdown", "mouseenter", "focus", "touchstart", "click"].forEach((ev) =>
        a.addEventListener(ev, () => montar(a), { passive: true })
      );
    });
  }

  function renderHero(h) {
    $("hero-saudacao").innerHTML = rich(h.saudacao);
    $("hero-titulo").innerHTML = rich(h.titulo);
    $("hero-texto").innerHTML = rich(h.texto);
    const foto = $("hero-foto");
    foto.src = h.foto;
    foto.alt = h.fotoAlt || "";
  }

  function renderSobre(s) {
    $("sobre-texto").innerHTML = s.paragrafos
      .map((p) => `<p>${rich(p, CLASSES.s)}</p>`)
      .join("");
  }

  function renderExperiencia(lista) {
    $("lista-experiencia").innerHTML = lista
      .map(
        (e) => `
        <article class="item-experiencia">
          <div class="data-e-ponto">
            <span class="data">${esc(e.periodo)}</span>
            <div class="ponto-timeline"></div>
          </div>
          <div class="conteudo-experiencia">
            <h3>${esc(e.empresa)}</h3>
            <p class="cargo">${esc(e.cargo)}</p>
            ${(e.descricao || [])
              .map((d) => `<p class="descricao">${rich(d, CLASSES.t)}</p>`)
              .join("")}
          </div>
        </article>`
      )
      .join("");
  }

  function renderSkills(grupos) {
    $("lista-skills").innerHTML = grupos
      .map(
        (g) => `
        <div class="skillGroup">
          <h3 class="skillTitle">${esc(g.titulo)}</h3>
          <ul>${(g.itens || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
        </div>`
      )
      .join("");
  }

  function renderProjetos(lista) {
    $("lista-projetos").innerHTML = lista
      .map(
        (p) => `
        <article class="projeto-card">
          <img src="${esc(p.imagem)}" alt="${esc(p.imagemAlt || p.titulo)}" loading="lazy">
          <div class="card-conteudo">
            <h3>${esc(p.titulo)}</h3>
            <p class="tecnologias">${esc((p.tecnologias || []).join(" | "))}</p>
            <p class="descricao">${esc(p.descricao)}</p>
            <div class="card-botoes">
              ${
                p.slug && p.pagina && Array.isArray(p.pagina.blocos) && p.pagina.blocos.length
                  ? `<a href="projeto.html?p=${encodeURIComponent(p.slug)}" class="outline">Ver detalhes</a>`
                  : ""
              }
              ${(p.botoes || [])
                .map(
                  (b) =>
                    `<a href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener noreferrer" class="primary">${esc(b.texto)}</a>`
                )
                .join("")}
            </div>
          </div>
        </article>`
      )
      .join("");
  }

  function renderRodape(texto) {
    $("rodape-texto").textContent = String(texto).replace(
      "{ano}",
      new Date().getFullYear()
    );
  }

  function render(c) {
    renderContato(c.contato);
    renderHero(c.hero);
    renderSobre(c.sobre);
    renderExperiencia(c.experiencia);
    renderSkills(c.skills);
    renderProjetos(c.projetos);
    renderRodape(c.rodape);

    // Como o conteúdo chega depois do carregamento, reposiciona em links como /#projects
    if (location.hash.length > 1) {
      const alvo = document.getElementById(location.hash.slice(1));
      if (alvo) alvo.scrollIntoView();
    }
  }

  // "no-cache" faz o navegador revalidar com o servidor, então edições
  // feitas pelo admin aparecem sem esperar o cache do GitHub Pages expirar.
  fetch("content.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(render)
    .catch((err) => {
      console.error("Não foi possível carregar o content.json:", err);
      const lista = $("lista-projetos");
      if (lista) lista.textContent = "Não foi possível carregar o conteúdo.";
    });
})();
