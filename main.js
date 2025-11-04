// =========================================================================
// 1. CONFIGURAÇÃO INICIAL E SELETORES
// =========================================================================

// Links de Navegação do Header (seleciona apenas os links dentro do <ul>, excluindo o logo)
const navLinks = document.querySelectorAll("header nav ul li a");

// Seções para Ativar o Menu (TODAS as tags <section> com um 'id' para navegação)
const navSections = document.querySelectorAll("section[id]");

// =========================================================================
// 2. FUNÇÃO DE CLIQUE (Ativa o link instantaneamente ao clicar)
// =========================================================================
navLinks.forEach((link) => {
  link.addEventListener("click", function (e) {
    // Remove a classe 'active' de TODOS os links
    navLinks.forEach((nav) => nav.classList.remove("active"));

    // Adiciona a classe 'active' APENAS ao link clicado
    this.classList.add("active");
  });
});

// =========================================================================
// 3. INTERSECTION OBSERVER PARA O MENU ATIVO (Mantém a cor no scroll)
// =========================================================================

const navObserverOptions = {
  root: null,
  rootMargin: "-150px 0px -50% 0px",
  threshold: 0,
};

const navObserverCallback = (entries) => {
  let mostVisibleSectionId = null;
  let maxRatio = 0;

  entries.forEach((entry) => {
    if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
      maxRatio = entry.intersectionRatio;
      mostVisibleSectionId = entry.target.id;
    }
  });

  navLinks.forEach((link) => link.classList.remove("active"));

  if (mostVisibleSectionId) {
    const correspondingLink = document.querySelector(
      `header nav ul li a[href="#${mostVisibleSectionId}"]`
    );
    if (correspondingLink) {
      correspondingLink.classList.add("active");
    }
  }
};

// Cria o observador e monitora as seções de navegação
const navObserver = new IntersectionObserver(
  navObserverCallback,
  navObserverOptions
);

navSections.forEach((section) => {
  navObserver.observe(section);
});

// =========================================================================
// 4. FUNCIONALIDADE DO MENU HAMBÚRGUER
// =========================================================================

const hamburger = document.querySelector(".menu-hamburger");
const nav = document.querySelector("header nav");

hamburger.addEventListener("click", () => {
  nav.classList.toggle("nav-active");
});

// Fecha o menu ao clicar em um link
navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("nav-active");
  });
});
