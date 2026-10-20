# Publicação no Plesk

Esta aplicação Node.js usa SQLite para catálogo e sessões, e consulta a tabela
MySQL `cliente` para autenticar usuários. A pasta `catalogo-crud` é a aplicação;
`produtos.json` e `imagens-produtos` permanecem como pastas irmãs. O login é
obrigatório, inclusive nos acessos diretos aos arquivos `.html`.

## Permissão da câmera

O leitor de códigos da central usa `getUserMedia` com câmera traseira e sem áudio.
O domínio precisa de HTTPS válido e o usuário autoriza o acesso no navegador.
O Node envia `Permissions-Policy: camera=(self), geolocation=(), microphone=(),
payment=(), usb=()` e inclui `media-src 'self' blob:` na CSP.

Se o Apache/nginx/Plesk também definir esses cabeçalhos, não mantenha
`camera=()` no proxy: uma política mais restritiva impede o uso da câmera mesmo
com o cabeçalho correto no Node. Preserve a política de câmera para a própria
origem e mantenha o microfone desabilitado. Não é necessário liberar CDN ou
`unsafe-eval` na CSP.

Publique `public/js/features/barcode/`, `public/js/vendor/zxing-library-0.23.0.js`
e sua licença, junto com os arquivos atualizados da central. Reinicie o processo
Node para aplicar a alteração dos cabeçalhos. Após publicar, teste no Safari e
no PWA instalado: tocar em **Ler com câmera** deve abrir o diálogo e iniciar a
câmera diretamente, sem campo de digitação nem opção de leitor externo. Confira
a autorização, a leitura de um produto em Stories e Feed, o fechamento e a
negação de permissão. Após uma falha ou ao voltar do segundo plano, a câmera
deve permanecer desligada até o toque em **Tentar câmera novamente**, sem abrir
o teclado. No desktop, confira também a entrada manual, o leitor conectado e
a câmera opcional pelo botão **Usar câmera**. A decodificação não envia imagens
ao servidor.

## Estrutura a manter no servidor

Envie a pasta `vidamix` inteira, preservando esta relação:

```text
vidamix/
├── produtos.json
├── imagens-produtos/
│   └── manifesto-imagens.json
└── catalogo-crud/
    ├── camas-stories/
    ├── camas-feed/
    ├── camas-indoor-h/
    ├── data/
    ├── public/
    ├── web-root/
    │   └── .gitkeep
    ├── package.json
    └── server.mjs
```

A `Application Root` do Plesk será `vidamix/catalogo-crud`. Por isso, os
caminhos padrão da aplicação já funcionam sem configurar caminhos absolutos:

```text
Banco SQLite:       ./data/catalogo.sqlite
Document Root:      ./web-root
Catálogo de origem: ../produtos.json
Manifesto:          ../imagens-produtos/manifesto-imagens.json
Imagens:            ../imagens-produtos
Backgrounds Stories: ./camas-stories
Backgrounds Feed:    ./camas-feed
Backgrounds Indoor:  ./camas-indoor-h
```

Os fundos de TV Indoor horizontal usam `camas-indoor-h`. Se estiverem em outra
pasta, configure `INDOOR_BACKGROUNDS_ROOT` nas variáveis do Plesk. O caminho pode
ser absoluto ou relativo à pasta da aplicação. A pasta pode ficar vazia durante
a preparação dos fundos; a API continuará respondendo com uma lista vazia.
Para exportar um vídeo Indoor, copie os fundos para essa pasta e selecione um
fundo no editor, além dos cinco produtos.

## Troca das imagens de produtos para WebP

Publique também `src/modules/products/product-images.mjs`, as alterações em
`product-service.mjs` e `src/app.mjs`, e reinicie o Node em **Restart App**.
Envie os arquivos convertidos para a mesma pasta `imagens-produtos/imagens/`.
Para cada referência `nome.png`, o servidor prioriza `nome.webp`, depois
`nome_resultado.webp`, e mantém o PNG quando nenhum WebP estiver disponível.
O nome deve preservar inclusive o hash original.

Não é necessário migrar manualmente `imagem_arquivo`, reimportar o manifesto
ou substituir o banco de produção. A resolução automática vale para os dados
existentes e para novas importações; o banco e o manifesto não são reescritos.
Novos lotes são reconhecidos sem reiniciar o Node novamente.

Após publicar, consulte um produto em `/api/products/ID`: `imagem_local_url`
deve terminar em `.webp` quando o arquivo convertido estiver disponível. A URL
final deve responder 200 com `Content-Type: image/webp`; a antiga URL PNG deve
redirecionar para ela. Confira o catálogo e a exportação da arte antes de remover
os PNG. Se houver uma regra própria de Apache/nginx para `/assets/`, preserve o
encaminhamento dessa rota ao Node para que a compatibilidade seja aplicada.
Os ícones PNG do PWA permanecem como estão.

## Antes de enviar

Na pasta `catalogo-crud`, execute:

```bash
npm ci
npm run verify
```

Envie todos os arquivos, inclusive `package-lock.json`, `camas-stories`, `camas-feed`, `camas-indoor-h`,
`produtos.json` e `imagens-produtos`. Não envie `node_modules`, `.env` ou a
pasta `data` de desenvolvimento.

> A pasta `data` será criada no primeiro início no servidor. Nas atualizações,
> preserve `data/catalogo.sqlite`, pois ela contém o catálogo e as sessões.
> O MySQL de usuários é consultado somente para leitura; não há migração nem
> alteração da tabela `cliente` durante a instalação.

## Configuração no Plesk

Em **Websites & Domains > Node.js**:

1. Selecione Node.js **22.13 ou superior e inferior ao 25**.
2. Defina **Application Root** como `vidamix/catalogo-crud`.
3. Defina **Document Root** como `vidamix/catalogo-crud/web-root`.
4. Informe `server.mjs` em **Application Startup File**.
5. Selecione o modo **Production** e o gerenciador `npm`.
6. Em **Custom Environment Variables**, preencha os dados da sua hospedagem.
   Os valores abaixo são exemplos:

```env
NODE_ENV=production
DB_HOST=mysql.exemplo.interno
DB_PORT=3306
DB_NAME=base_de_usuarios
DB_USER=usuario_de_leitura
DB_PASSWORD=preencher_com_a_senha_do_banco
DB_SSL=false
APP_ORIGIN=https://studio.exemplo.com
AUTH_COOKIE_SECURE=true
AUTH_TRUST_PROXY=false
```

Não defina `PORT`: o Plesk fornece esse valor ao processo Node.js. Também não
é preciso declarar variáveis de caminho se a estrutura acima foi preservada.

O servidor também carrega automaticamente o `.env` da pasta `catalogo-crud`
por `process.loadEnvFile`. O ambiente do processo, incluindo as variáveis do
painel, tem prioridade sobre o arquivo. Use `.env.example` como referência,
sem sobrescrever um `.env` já configurado nem versionar credenciais.

`DB_SSL=true` habilita TLS e exige certificado válido do servidor MySQL. O padrão
é `false`; a conexão verificada não utilizou TLS. Habilite a opção quando o
servidor disponibilizar TLS com certificado válido. Isso é independente do
HTTPS obrigatório no domínio público.

`APP_ORIGIN` é opcional e deve conter somente a origem pública da aplicação,
sem caminho, query ou fragmento. Configure-a explicitamente quando o HTTPS
terminar no proxy, como no exemplo. `AUTH_COOKIE_SECURE` é `true` por padrão em
produção e não deve ser desabilitado para contornar problemas de HTTPS.
`AUTH_TRUST_PROXY` é `false` por padrão: use `true` somente se o Node estiver
acessível exclusivamente por um proxy confiável que normalize
`X-Forwarded-Proto` e `X-Forwarded-For`. Isso afeta a identificação do protocolo
e do endereço de origem usado para limitar tentativas de login.

O login não depende mais de HTTP Basic, e `APP_AUTH_ENABLED` não tem efeito.
Remova configurações antigas de Basic da aplicação ou do diretório no Plesk
para usar a tela de login. Usuários precisam ter `ativo=1`, `deleted=0` ou `NULL`
e `role` exatamente `admin` ou `cliente`. E-mails duplicados são recusados.
As senhas MD5-crypt legadas (`$1$`) e bcrypt (`$2a$`, `$2b$`, `$2y$`) são
compatíveis; não configure senhas em texto puro.

### Encaminhamento obrigatório ao Node

Mantenha `web-root` sem conteúdo da aplicação; apenas `.gitkeep` deve estar
presente. **Não copie nem crie links de `public`, `.env`, `data` ou imagens
nesse diretório.** O Node já sabe servir os arquivos de `public` após aplicar
as regras de acesso.

No Plesk para Linux, em **Apache & nginx Settings**, mantenha **Proxy mode**
ativado e desative **Smart static files processing** e **Serve static files
directly by nginx**. Assim, o nginx encaminha as requisições ao Apache/Passenger,
que deve encaminhá-las à aplicação Node. O Plesk documenta que arquivos
servidos diretamente pelo nginx não passam pelos handlers do Apache:
[configuração oficial de arquivos estáticos](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/websites-and-domains/hosting-settings/web-server-settings/apache-and-nginx-settings.72320/).

Revise também regras adicionais `location`, `alias`, `root`, `try_files`,
cache de proxy e aliases do Apache. Nenhuma rota de HTML, API ou recursos da
aplicação deve ser atendida diretamente a partir do disco ou de cache
compartilhado. Isso inclui `/assets/`, fundos, `.html`, `.js`, `.css`,
manifestos e ícones: os recursos públicos são liberados pelo próprio Node.
Não use `public` como Document Root nem como fallback estático. Remova caches
antigos de páginas protegidas do proxy antes de validar a nova publicação.

Clique em **NPM Install** e depois em **Restart App** (ou **Enable Node.js**).

A geração de miniaturas e fundos otimizados depende do Sharp, incluído no
`package-lock.json`. Instale as dependências no próprio servidor (`npm ci` ou
**NPM Install**) para obter o binário correto. Mantenha
`CATALOG_STORAGE_ROOT/background-cache` gravável pelo usuário do Node.js.
O cache é gerado automaticamente e pode ser reconstruído a partir dos originais.

## Validação após publicar

Para verificar conectividade sem autenticação, faça um GET sem seguir
redirecionamentos:

```bash
curl -sS -o /dev/null -D - https://seu-dominio/login
```

O resultado deve ser `200`, com a tela de login. `/api/health` exige uma sessão
válida e retorna `401` quando chamado anonimamente. Após entrar como
administrador ou cliente, a resposta de `/api/health` deve ser:

```json
{"status":"ok"}
```

Confira estes resultados pelo domínio público, passando pelo proxy real:

| URL | Sem sessão | Cliente | Admin |
| --- | --- | --- | --- |
| `/` | `302` para `/login?next=...` | `302` para `/catalogo` | `200` |
| `/catalogo` e `/catalogo.html` | `302` para `/login?next=...` | `200`, somente leitura | `200` |
| `/artes/stories`, `/artes/feed`, `/artes/indoor-h` | `302` para `/login?next=...` | `200` | `200` |
| `/revista` e `/revista.html` | `302` para `/login?next=...` | `403` | `200` |
| `/backgrounds` e `/backgrounds.html` | `302` para `/login?next=...` | `403` | `200` |
| `/api/health` e `/api/products` | `401` | `200` | `200` |

Faça o teste anônimo em janela privada e inspecione a resposta inicial da
requisição; o navegador segue o `302` e termina mostrando `/login` com `200`.
Teste especialmente os aliases `.html`: se um deles abrir diretamente sem
sessão, revise o Document Root e as regras de arquivos estáticos antes de
concluir a publicação.

Com uma conta `cliente`, confira a ausência das ações de cadastro, edição e
exclusão no catálogo e a recusa `403` de chamadas diretas de escrita na API.
Com `admin`, confira essas ações e a gestão de revistas e backgrounds.
Valide também Stories, Feed, exportação de TV Indoor e `/api/indoor-backgrounds`.

As sessões ficam no SQLite durante oito horas, são revogadas por **Sair** e
revalidadas contra o MySQL em cada requisição autenticada. Alteração de senha,
inativação ou exclusão lógica da conta revogam o acesso. Confirme que, após
sair, voltar pelo histórico ou abrir um alias `.html` exige novo login.
As operações de escrita precisam do token CSRF da sessão e da origem correta;
erros `403` no login devem levar à revisão de `APP_ORIGIN` e do proxy, sem
desabilitar essas verificações. Tentativas excessivas de login retornam `429`.

### Instalação PWA

Mantenha o site na raiz do domínio/subdomínio, como nas rotas acima, e force HTTPS.
Envie também `public/manifest.json`, `public/manifest.webmanifest`, `public/sw.js`,
`public/offline.html`, `public/pwa.css`, `public/js/pwa.js`, `public/branding/`,
`public/pwa-icons/`, `public/apple-touch-icon.png` e
`public/apple-touch-icon-precomposed.png`, além das páginas HTML atualizadas,
incluindo `login.html`, `login.css` e `js/login.js`.
Reinicie a aplicação após atualizar o código em `src/`.

As páginas usam `/manifest.json?v=2`, servido como `application/json` também
pelo proxy. O `.webmanifest` é mantido apenas para links antigos. Os ícones
ficam em `/pwa-icons/`: **não use `/icons/`**, pois o Apache/Plesk pode resolver
esse caminho para seus próprios ícones em vez dos arquivos da aplicação.
O ícone Apple tem ainda os caminhos convencionais na raiz do site.

O Node permite GET/HEAD sem sessão para os manifestos, ícones, login e recursos
visuais públicos. As páginas internas e a API permanecem protegidas. Esses
recursos devem passar pelo Node, sem desafio HTTP Basic adicional. Não aplique
cache longo a `/sw.js` e preserve o Content-Type JavaScript enviado pela aplicação.

Verifique a publicação, sem enviar credenciais:

```bash
npm run check:pwa -- https://vidamix.vidafarmacias.com.br
```

O comando verifica o HTML quando ele está acessível, o manifesto standalone,
o tipo MIME, os ícones PNG e suas dimensões. Ele falha se detectar referências
antigas a `/icons/`, erro HTTP (como 404/401) ou manifesto sem Content-Type JSON.
Com HTML protegido, informa que as tags da página não foram verificadas e
confere os arquivos públicos de instalação diretamente.

Após abrir a aplicação, confira o manifesto e o service worker nas ferramentas do
navegador e use **Instalar aplicativo** na central. Abra o ícone instalado e
confirme que o VidaMix abre em uma janela standalone, exige login sem sessão
e direciona o perfil `cliente` ao catálogo e o perfil `admin` à central. Em iOS,
use o Safari e **Compartilhar > Adicionar à Tela de Início**, mantendo
**Abrir como App** ativado se essa opção aparecer. Se já existir um atalho
sem ícone criado antes desta correção, remova-o e adicione novamente após
recarregar o site. Confira o logotipo na prévia antes de tocar em Adicionar.
Depois da primeira abertura online, desconecte e navegue: a tela de reconexão
deve aparecer. Os dados e editores continuam exigindo conexão com o servidor.

## Atualizações, versionamento e backup

- Versione código, documentação e `package-lock.json`; nunca versione `.env`,
  `node_modules` ou o banco SQLite.
- Crie uma tag antes de cada publicação, por exemplo `git tag -a v1.0.0 -m "Publicação v1.0.0"`.
- Para atualizar, envie os arquivos novos sem substituir `data/` e reinicie a
  aplicação no Plesk.
- Antes de atualizar, faça backup de `data/catalogo.sqlite` junto com os
  eventuais arquivos `catalogo.sqlite-wal` e `catalogo.sqlite-shm`.
- Force HTTPS no domínio e mantenha as credenciais MySQL no ambiente do Plesk
  ou no `.env` protegido fora do Document Root. As senhas dos usuários são
  verificadas a partir dos hashes existentes em `cliente`.
- Preserve `web-root` vazio a cada atualização. Não reverta o Document Root
  para `public`, inclusive em rollback, pois o login depende do encaminhamento
  ao Node.
