# YBRD — refino do R

> Registro das etapas de desenho. A seção “Identidade oficial” ao final documenta a aplicação atual e substitui as limitações de aplicação descritas nas etapas anteriores.

## Inspeção antes da edição

`git status --short --branch`: árvore limpa em `codex/vitrine-catalogo-real`.
Criada a branch `logo-refino-r`; confirmada limpa antes de editar. A etapa de desenho foi entregue sem commit; o envio ao GitHub foi autorizado pelo usuário posteriormente.

| Caminho / uso encontrado | Tipo original | Tratamento |
| --- | --- | --- |
| `src/components/Storefront.tsx` — cabeçalho | Texto, Figtree 700 / `.wordmark` | Componente vetorial A |
| `src/components/Storefront.tsx` — hero | Texto, Unbounded 500 / `.hero-brand`; ponto signal separado | Componente vetorial A, contornos próprios do hero; ponto intacto |
| `src/components/Storefront.tsx` — rodapé | Texto, Figtree 700 / `.footer-brand` | Intacto |
| `src/components/StoreMenus.tsx` — título do menu mobile | Texto, Figtree 700 | Intacto |
| `src/components/AccountFields.tsx` — cabeçalho da conta | Texto, Figtree 700 | Intacto |
| `public/favicon.ico` | Raster PNG embutido em ICO, 256 × 256; símbolo Lovable, sem YBRD | Intacto |
| `src/routes/__root.tsx` | Metadados de texto, link para favicon e CSS das fontes | Intacto; não define `og:image` |
| `src/routes/index.tsx` | Metadados de texto da marca | Intacto; não define `og:image` |
| `src/lib/account-schema.ts` e rotas de conta | Títulos de página e texto “YBRD / CONTA” | Texto editorial, intacto |
| `src/components/SceneRing.tsx`, `src/lib/scene-content.ts` | Códigos editoriais YBRD / ED, texto mono | Intacto |
| `src/lib/hybrid-editorial.ts`, `StoreMenus.tsx`, demais textos de `Storefront.tsx` | Nomes de coleção, manifesto, créditos e legendas; texto | Intacto |
| `src/styles.css` | Definições das famílias e medidas dos dois wordmarks | Regras originais intactas; regras novas isoladas |
| `src/assets/*.jpg`, `src/assets/cutouts/*.png` | Fotografias e recortes raster, sem arquivo separado da logo | Intactos; inventário visual conferido |

Não havia arquivos `.svg` ou `.webp` no código-fonte inspecionado, nem imagem do anel com COMPANY. Não foi usado arquivo de imagem de conversas anteriores como se fosse parte do projeto. Se o original do anel estiver apenas em PNG/WebP, ele precisa ser redesenhado em vetor por um designer; seus pixels não foram editados. Este trabalho refina os dois wordmarks efetivamente presentes no site e não reconstrói o anel ou COMPANY.

## Fontes e sistema de coordenadas

Unidades originais: em de 1000; linha de base y=0, topo y=700 (Figtree) ou y=750 (Unbounded). As medidas abaixo usam y ascendente; os SVGs fazem a conversão para y descendente. A fonte é convertida em contornos: nenhum texto ou fonte externa é necessário para renderizar as novas logos.

- Figtree variável, instância wght=700: `google/fonts/ofl/figtree/Figtree[wght].ttf`, blob `579e2ab5f30beb21cd0b618dd0796b0fce0eff8e`.
- Unbounded variável, instância wght=500: `google/fonts/ofl/unbounded/Unbounded[wght].ttf`, blob `e3c064ddfa3acdd3af2e0f06cd2f2288cc4fcae3`.
- Fontes já usadas no projeto; nenhum pacote ou família foi instalado. Arquivos binários de fonte não foram adicionados ao projeto.
- Y, B e D têm os mesmos contornos nas quatro opções. Apenas a posição do D pode mudar para o ajuste de espaço autorizado. O laboratório usa contornos do R anterior como referência, sem simular a logo com outra fonte.

## Medidas extraídas do B

| Regra | Cabeçalho — Figtree 700 | Hero — Unbounded 500 |
| --- | --- | --- |
| Altura total | 700 | 750 |
| Haste | x=76,001 até 209,598; espessura 133,597 | Perfil inclinado: x externo 52,600 → 111,000 → 52,600; largura horizontal na cintura 162,699; aproximadamente 162 na base e topo. Não é uma haste vertical uniforme |
| Barriga superior externa | Topo (313,200;700), extremo direito (552,599;501,000), junção (474,999;365,800) | Topo (560,399;750), extremo direito (778,899;567,700), retorno (558,499;369,600) |
| Raio / formato | Não há raio circular constante: quadráticas originais, ombro superior plano e curva assimétrica; extensão direita desde o ombro 239,399 | Não há raio circular constante: quadráticas originais; extensão direita desde o ombro 218,500 |
| Contador superior | x=209,598…413,403; y=414,999…591,002; 203,804 × 176,003; lado esquerdo reto, lado direito curvo | y=445,900…624,501; máximo x=607,201; esquerda visível x=234,760 no topo e 263,798 na base; 372,440 × 178,601 no envelope; esquerda inclinada |
| Espessuras da barriga | Topo 108,998; direita 139,197 | Topo 125,499; direita 171,698 |
| Linha média / cintura | y=365,800: 52,257% da altura desde a base; borda interna inferior y=303,201 | y=385: 51,333% desde a base; borda interna inferior y=324,100 |
| Cortes e cantos | Terminações horizontais, 0°; encontros de haste a 90°, sem raio adicionado | Terminações horizontais, 0°; cintura externa inclinada aproximadamente 8,7°/9,1° em relação à vertical; sem arredondamento artificial |
| Assinatura existente | Não há entalhe autoral no B desta fonte. Repetem-se o encontro reto e o mesmo contador; nenhum entalhe foi inventado | Cintura recuada em y=385, diagonais da haste e aparos do contador superior. Repetidos no R |

Os números são medições dos contornos, não estimativas de pixels. A barriga do R conserva as curvas superiores do B e o mesmo contador visível, sem escala. O R anterior tinha uma barriga diferente; a alteração é intencionalmente concentrada nela, na haste derivada e na perna.

## Variantes

| Variante | Cabeçalho | Hero | Construção |
| --- | --- | --- | --- |
| A — principal | `variants/ybrd-A.svg` | `variants/ybrd-A-hero.svg` | Barriga superior do B; haste com o perfil correspondente; diagonal única, terminal horizontal na base |
| B — aberta | `variants/ybrd-B.svg` | `variants/ybrd-B-hero.svg` | Mesma A, abertura diagonal de 14 / 20 unidades entre contador e encontro da perna; contorno conectado, sem máscara ou retângulo sobreposto |
| C — geométrica | `variants/ybrd-C.svg` | `variants/ybrd-C-hero.svg` | Mesma A, projeção horizontal da perna encurtada: extremo da base x=540 / 760; diagonal mais vertical, mesma linha de base |

Em A, extremo externo da perna x=577,399 / 828,899: acompanha a largura visual da barriga inferior do B. Espessura normal da perna 133,597 / 162,699, com largura horizontal do apoio compensada pela inclinação (`largura = espessura × sqrt(1 + inclinação²)`). A compensação evita uma diagonal visualmente fina; não adiciona sobreposição de polígonos.

A alternativa C encurta a **projeção** da perna, mantendo o apoio na linha de base. A abertura de B é uma alternativa experimental; os Bs originais têm contadores fechados, portanto não é apresentada como um entalhe preexistente.

### Espaçamento óptico

- Cabeçalho: origens Y=0, B=647, R=1255 (antes 1259), D=1864 (antes 1904). Vãos horizontais B–R ≈107 e R–D ≈108 unidades na comparação dos extremos. Largura do espaço de layout mantida em 2604.
- Hero: origens Y=0, B=897, R=1754 (antes 1762), D=2584 (antes 2592). Vãos ≈81 e ≈77 unidades. Largura do espaço de layout mantida em 3503.
- Espaçamento comum às três alternativas para comparar a mudança do R isoladamente. A e B compartilham o mesmo extremo externo da perna.
- Y e B não foram reposicionados. A e C mantêm o contador fechado; B une a abertura ao exterior em um único contorno, sem formas sobrepostas.

## Aplicação e comparação

`YbrdLogo` aceita `variant="wordmark"`, `className` e `title`. A versão do cabeçalho tem largura 2,604em e altura de tinta 0,7em; a do hero, 3,503em e 0,75em. As famílias, os tamanhos tipográficos e as posições das seções não mudam. Cada contexto mostra apenas seu SVG; `currentColor` herda a cor original. O ponto signal continua separado.

Somente cabeçalho principal e hero foram substituídos, conforme o escopo. Cabeçalho da conta, menu mobile e rodapé foram inventariados mas não alterados.

`/logo-lab`, sem link no menu e com `noindex, nofollow`, mostra atual/A/B/C em 16, 24, 48 e 120px de altura de tinta, em preto sobre cream e cream sobre ink, para as duas versões. Há rolagem horizontal explícita para não reduzir os desenhos no celular.

## Recomendação — cinco linhas

Recomendo A por conservar o contador fechado e leitura estável em 16 e 24px.
Sua barriga superior repete o desenho do B sem redimensionamento.
A haste acompanha o B correspondente, incluindo a cintura da versão do hero.
A perna única e os terminais retos mantêm peso e acabamento coerentes com o D.
O ajuste B–R/R–D equilibra o ritmo; B e C permanecem disponíveis para comparação.

## Verificação

- Cada SVG tem `<title>YBRD</title>`, viewBox e quatro paths com `fill="currentColor"`; sem strokes, imagens, máscaras ou formas de remendo.
- Componente React com `role="img"` e título por ID único; SVG inativo oculto por CSS. Link do cabeçalho mantém seu nome acessível “YBRD início”.
- Nenhuma mudança em favicon, fotografias, metadados existentes, anel, COMPANY, cores, fontes, `.env` ou chaves.
- `npm run build`, `npx tsc --noEmit`, 38 testes existentes e `git diff --check` passaram.
- Chromium conferiu 64 comparações, alturas exatas 16/24/48/120px, título acessível, desktop e celular sem overflow da página.
- Larguras anteriores/novas: cabeçalho 91,140625 / 91,125px; hero 217,1875 / 217,171875px (arredondamento subpixel <0,02px).
- Comparação raster dos contornos superiores B/R: 0 pixels divergentes em Figtree; 9 de 273600 em Unbounded (antialiasing na borda inclinada), tolerância de alfa 1/255.
- Contraste ink/cream: 17.54:1, superior a 4,5:1; preto/cream também adequado.
- A etapa de desenho foi validada sem commit ou push. O envio posterior ao GitHub foi autorizado pelo usuário; nenhuma configuração de segurança foi alterada.

## Aplicação posterior — HYBRD

A pedido do usuário, somente a logo do cabeçalho da coleção `/colecoes/ybrd-home` recebe um H antes de YBRD. O H usa os contornos das mesmas famílias existentes e `currentColor` por meio de `text-signal`, o mesmo token do ponto principal. Nome acessível HYBRD. Desktop e celular conferidos; demais páginas continuam com YBRD.

## Identidade oficial — correção de aplicação

- O usuário esclareceu que HYBRD deveria substituir o título grande YBRD HOME na introdução da coleção. Agora ele aparece nesse título, com H em signal; código, descrição, chamadas, menus e metadados da coleção usam HYBRD. A URL `/colecoes/ybrd-home` foi preservada.
- YBRD com ponto signal é a marca global no cabeçalho, hero, menu mobile, rodapé e cabeçalho da conta. Todos usam os mesmos contornos Unbounded A, sem alternância para Figtree. HYBRD é a variação de home, sem ponto e com H signal.
- `src/assets/fonts/ybrd-display-medium.woff` é a família local **Ybrd Display**, derivada da Unbounded 500 já usada. Somente B/R foram reconstruídos a partir dos paths aprovados; R acentuados compostos herdam o novo R. Demais glifos, avanços, kerning e métricas verticais preservados. A família Figtree do texto corrente e a fonte mono não mudaram.
- `build-display-font.py` permite reproduzir a fonte a partir do arquivo Unbounded variável indicado acima: `python design/logo/build-display-font.py /caminho/Unbounded-wght.ttf`. FontTools é uma ferramenta de design já disponível no ambiente; não faz parte das dependências do site e não é exigida pelo build.
- Licença original SIL OFL incluída em `src/assets/fonts/OFL-Unbounded.txt`; fonte modificada renomeada para Ybrd Display. O Google Fonts continua servindo somente Figtree e JetBrains Mono; a fonte dos títulos é carregada da própria aplicação.
- Novo favicon SVG utiliza o Y existente e ponto signal. O ICO anterior permanece arquivado e sem uso. Nenhuma fotografia foi trocada ou editada no site.
- A prévia gerada a partir da captura do usuário é apenas comparação visual; não é usada como código ou imagem de interface.
- Chromium validou título HYBRD, cor do H, logotipos globais, fonte local e ausência de overflow em 320/390/1440px. Comparação da fonte confirmou alteração apenas de B/R e limites dos R compostos dependentes.

## Refino exclusivo do R — revisão 2

A pedido do usuário, somente o R oficial (Unbounded A) foi refinado. Y, B, D, H, ponto, cores, dimensões externas, origem de cada letra e avanços da fonte permanecem iguais.

A diagonal anterior partia de x=558,499 / y=369,600 e abria muito. Agora a saída da barriga encontra x=645 / y=387, com uma transição quadrática curta a partir do mesmo ombro. A perna é mais vertical e se apoia no mesmo extremo de base x=828,899. Sua espessura normal continua 162,699; a largura horizontal do apoio resulta da compensação pela nova inclinação. A haste e o contador superior ficam idênticos à revisão anterior, derivados do B.

O novo desenho foi aplicado ao SVG oficial A e ao R da fonte local. Os R acentuados compostos herdam a alteração; a comparação binária dos glifos confirmou que B e todas as demais letras independentes permanecem intactos. Todos os avanços e métricas horizontais são iguais. Variantes B/C e exemplos históricos permanecem arquivados. `variants/ybrd-r-comparison.svg` compara o antes e o depois com as outras letras no mesmo lugar.
