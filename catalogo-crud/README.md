# VidaMix Studio

Plataforma local para organizar produtos e criar artes comerciais. A aplicação
começa com Stories, mas sua estrutura permite incluir novos formatos, documentos
de frente e verso, exportações e integrações de publicação sem concentrar toda
a lógica em uma única página ou arquivo.

## Rotas

| Endereço | Uso |
| --- | --- |
| `/` | Central do VidaMix Studio e formatos disponíveis |
| `/catalogo` | Gestão de produtos |
| `/artes/stories` | Editor de artes para Stories |
| `/api/*` | API JSON interna |

Os caminhos antigos de arquivos continuam funcionando como compatibilidade, mas
novas telas devem ser registradas por rota semântica.

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

Esse comando valida a sintaxe dos módulos e executa um teste de fumaça das
rotas de páginas, API e arquivos estáticos.

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
