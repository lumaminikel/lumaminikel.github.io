# Portfólio pessoal
Este é o repositório do meu portfólio pessoal, uma vitrine dos meus projetos, habilidades e jornada profissional. O site foi desenvolvido para ser uma apresentação completa do meu trabalho, unindo design, comunicação e tecnologia.

Acesse em: https://lumaminikel.github.io/

## Visão Geral

O site é uma página única (single-page) com as seguintes seções:

-   **Início:** Uma apresentação impactante, com meu título profissional e um convite para conhecer meu trabalho.
-   **Sobre Mim:** Um pouco da minha história, formação e paixão por comunicação e tecnologia.
-   **Experiência:** Uma linha do tempo com minha trajetória profissional.
-   **Skills:** Minhas competências divididas em Tecnologia, Comunicação & Marketing, Ferramentas e Soft Skills.
-   **Projetos:** Uma galeria com alguns dos meus principais projetos, com links para visualização e para os repositórios. Cada projeto pode ter uma página própria (`projeto.html`) com a linha de pensamento, imagens e galeria.

## Funcionalidades

-   **Design Responsivo:** Totalmente adaptável para diferentes tamanhos de tela, de desktops a smartphones.
-   **Menu de Navegação Fixo:** O menu de navegação acompanha o scroll do usuário, facilitando a navegação entre as seções.
-   **Destaque de Seção Ativa:** A seção que o usuário está visualizando é destacada no menu de navegação.
-   **Menu Hambúrguer:** Em dispositivos móveis, o menu se transforma em um menu hambúrguer para otimizar o espaço.
-   **Botão de Contato Flutuante:** Um botão do WhatsApp sempre visível para facilitar o contato. O número só é colocado no link quando alguém interage com o botão, para evitar spam.
-   **Conteúdo Editável:** Todo o conteúdo (textos, experiência, skills e projetos) fica no `content.json` e é montado na página pelo JavaScript.
-   **Painel Admin:** A página `admin.html` permite editar o conteúdo, trocar a foto e cadastrar projetos sem mexer no código (veja a seção abaixo).
-   **Página de Projeto:** Estudo de caso com título, informações rápidas, textos, imagens e galeria, com ampliação de imagem.

## Tecnologias Utilizadas

-   **HTML5:** Para a estrutura semântica do site.
-   **CSS3:** Para a estilização, utilizando Flexbox e Grid Layout para um design moderno e responsivo.
-   **JavaScript:** Para a interatividade do site, como o menu de navegação dinâmico e o menu hambúrguer, e para montar o conteúdo a partir do `content.json`.
-   **API do GitHub:** Usada pelo painel admin para publicar as alterações direto no repositório.
-   **Google Fonts:** Para a tipografia do site.

## Estrutura do Projeto

```
/
├── index.html
├── projeto.html
├── admin.html
├── styles.css
├── projeto.css
├── main.js
├── render.js
├── projeto.js
├── admin.js
├── content.json
├── README.md
└── assets/
```

-   `index.html`: O arquivo principal que contém a estrutura do site.
-   `projeto.html`: A página de detalhes de um projeto (`projeto.html?p=identificador-do-projeto`).
-   `admin.html`: O painel de edição do conteúdo.
-   `styles.css`: A folha de estilos que define a aparência do site.
-   `projeto.css`: Os estilos específicos da página de projeto.
-   `main.js`: O arquivo JavaScript que controla a interatividade do site.
-   `render.js`: Lê o `content.json` e monta as seções da página inicial.
-   `projeto.js`: Lê o `content.json` e monta a página de um projeto.
-   `admin.js`: A lógica do painel admin e da publicação pela API do GitHub.
-   `content.json`: Todo o conteúdo do site (textos, experiência, skills e projetos).
-   `assets/`: A pasta que contém as imagens e ícones utilizados no site.

## Como Executar

Para visualizar o site, acesse o link: https://lumaminikel.github.io em seu navegador de preferência.

Como o conteúdo é carregado do `content.json`, abrir o `index.html` direto do computador não funciona. Para testar localmente, rode um servidor simples na pasta do projeto, por exemplo `python -m http.server`, e acesse `http://localhost:8000`.

## Painel Admin

O painel fica em `admin.html` e publica as alterações direto neste repositório, em um único commit (o `content.json` e as imagens novas).

1.  Crie um token do GitHub do tipo *fine-grained*, só para este repositório, com a permissão **Contents: Read and write**.
2.  Abra `admin.html` e cole o token. Ele fica salvo apenas no navegador e nunca vai para o código.
3.  Edite as abas Geral, Início, Sobre, Experiência, Skills e Projetos e clique em **Publicar alterações**. O site atualiza em cerca de 1 minuto.

As imagens enviadas pelo painel são convertidas para WebP automaticamente. Se o `content.json` for editado fora do painel, recarregue a página do admin antes de publicar.

## Autora

-   **Luma Minikel** - [LinkedIn](https://www.linkedin.com/in/lumaminikel/)
