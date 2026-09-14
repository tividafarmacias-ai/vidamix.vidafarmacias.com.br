# VidaMix Studio

Plataforma local para organizar produtos e criar artes comerciais. A aplicação
começa com Stories, mas sua estrutura permite incluir novos formatos, documentos
de frente e verso, exportações e integrações de publicação sem concentrar toda
a lógica em uma única página ou arquivo.

## Identidade visual

A identidade compartilhada está em `public/brand.css`: Poppins, azul `#084F98`,
vermelho `#F21E26`, superfícies claras e tokens de bordas, cantos e sombras.
As três páginas carregam essa base antes dos estilos de cada tela; o tour também
usa os mesmos tokens. A fonte é servida localmente por `public/fonts/`, com sua
licença SIL, sem depender do Google Fonts em tempo de execução.
O tema da interface é independente da composição e das fontes das artes exportadas.

## Rotas

| Endereço | Uso |
| --- | --- |
| `/` | Central do VidaMix Studio e formatos disponíveis |
| `/catalogo` | Gestão de produtos |
| `/artes/stories` | Editor de artes para Stories |
| `/api/*` | API JSON interna |

Os caminhos antigos de arquivos continuam funcionando como compatibilidade, mas
novas telas devem ser registradas por rota semântica.

## Preços de Stories

Os campos de preço usam entrada automática em centavos: `1` vira `0,01`,
`1234` vira `12,34` e `123456` vira `1.234,56`. Não é necessário digitar
vírgula. A máscara vale para ambos os preços e para o preço único do combo,
aceita valores colados com formatação e atualiza a prévia durante a digitação.
Apagar o conteúdo deixa o campo vazio novamente.

## Ajuste automático de Stories

No editor, o botão **Ajuste automático**, abaixo de **Oferta**, dimensiona e
posiciona as imagens e os cartões de descrição/preço conforme a composição.
Um produto recebe uma oferta central; dois produtos mantêm ofertas independentes;
o combo agrupa as imagens com um único cartão e preço. O ajuste compara disposições
laterais e empilhadas, respeita a proporção das imagens, as margens da arte e o
espaço do texto livre existente.

O botão fica disponível quando todas as imagens necessárias estão carregadas,
mesmo antes de preencher os preços. Depois do ajuste, os controles de tamanho
partem de 100% e os elementos continuam editáveis. Se não houver espaço, a
composição atual é preservada. A prévia e o PNG usam as mesmas posições.

A geometria fica em `public/js/features/stories/auto-layout.js`, com testes em
`scripts/stories-auto-layout.test.mjs` executados por `npm run test:stories-layout`
e incluídos em `npm run verify`.

## Tour guiado

A central, o catálogo e o editor de Stories apresentam um tour contextual na
primeira visita a cada seção. O guia destaca os controles, acompanha a rolagem e
permite avançar, voltar ou sair sem modificar os produtos ou a arte. O botão
**Tour guiado**, disponível nas três telas, permite começar novamente.

A preferência e o progresso são salvos na chave `vidamix:tour` do `localStorage`
do navegador, sem cookies nem envio ao servidor. Assim, recarregar a página pode
retomar o passo atual; uma seção concluída não repete o tour automaticamente.
Pular o tour, fechá-lo ou usar Escape antes da conclusão dispensa os tours
automáticos de todas as seções; o botão **Tour guiado** continua disponível.
Esse estado pertence ao navegador e à origem da aplicação: limpar os
dados do site, usar outro navegador ou acessar por outra origem reinicia a
experiência. Se o armazenamento estiver indisponível, o guia continua utilizável,
mas a preferência não será preservada ao recarregar a página.

Os textos e alvos ficam em `public/js/features/tour/steps.js`, identificados pelos
atributos `data-tour` das páginas. `TOUR_VERSION` controla a versão da experiência;
incremente-o quando uma mudança relevante justificar apresentar o tour novamente.

## Executar

```powershell
npm.cmd run start
```

Abra `http://localhost:3333`. Para desenvolvimento com reinício automático:

```powershell
npm.cmd run dev
```

Use `.env.example` como referência para a porta e os diretórios de origem. As
variáveis também podem ser definidas no ambiente do processo.

## Verificar

```powershell
npm.cmd run verify
```

Esse comando valida a sintaxe dos módulos, testa a persistência do tour,
o ajuste automático e a máscara dos preços, e executa um teste de fumaça
das rotas de páginas, API e arquivos estáticos.

## Publicação

O projeto está preparado para ser executado no Plesk com Node.js 22.13+.
Antes de publicar, mantenha o SQLite, o catálogo de importação e as imagens em
um caminho persistente fora da aplicação, ative a autenticação administrativa e
execute npm.cmd run check:production.

O procedimento completo, com caminhos, variáveis e rollback, está em
[docs/deployment-plesk.md](docs/deployment-plesk.md).

## Estrutura

```text
src/
  config.mjs             configuração centralizada
  database/              persistência e inicialização do SQLite
  http/                  router, respostas, erros e arquivos estáticos
  modules/               regras por domínio (produtos, stories, ...)
  routes/                rotas de página e API

public/
  index.html             central de criação
  catalogo.html          catálogo
  stories.html           editor de Stories
  js/features/stories/   estado, DOM e comportamento do editor
  js/features/tour/      tour contextual e progresso no navegador

docs/                    decisões e convenções de arquitetura
scripts/                 verificações locais
```

Leia [a arquitetura detalhada](docs/architecture.md) antes de criar um novo
formato ou integração.

## Crescer sem acoplamento

Para um formato novo, crie o módulo em `public/js/features/<formato>/`,
registre `/artes/<formato>` e mantenha regras ou dados próprios em
`src/modules/<formato>/`. Uma arte de frente e verso deve ser modelada como um
documento com páginas ordenadas, cada uma com seu canvas e elementos.

Segredos de integração, tokens de redes sociais e tarefas de publicação devem
permanecer exclusivamente no servidor. O banco local em `data/` não é
versionado.
