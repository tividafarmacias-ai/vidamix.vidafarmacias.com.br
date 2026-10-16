# Publicação no Plesk

Esta aplicação Node.js usa SQLite e foi preparada para ser publicada mantendo a
mesma estrutura de arquivos existente hoje. A pasta `catalogo-crud` é a
aplicação; `produtos.json` e `imagens-produtos` permanecem como pastas irmãs.

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
    ├── package.json
    └── server.mjs
```

A `Application Root` do Plesk será `vidamix/catalogo-crud`. Por isso, os
caminhos padrão da aplicação já funcionam sem configurar caminhos absolutos:

```text
Banco SQLite:       ./data/catalogo.sqlite
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
> preserve `data/catalogo.sqlite`, pois ela contém os dados persistentes.

## Configuração no Plesk

Em **Websites & Domains > Node.js**:

1. Selecione Node.js **22.13 ou superior e inferior ao 25**.
2. Defina **Application Root** como `vidamix/catalogo-crud`.
3. Defina **Document Root** como `vidamix/catalogo-crud/public`.
4. Informe `server.mjs` em **Application Startup File**.
5. Selecione o modo **Production** e o gerenciador `npm`.
6. Em **Custom Environment Variables**, cadastre apenas:

```env
NODE_ENV=production
APP_AUTH_ENABLED=true
APP_AUTH_USERNAME=administrador
APP_AUTH_PASSWORD=uma-senha-longa-e-exclusiva
```

Não defina `PORT`: o Plesk fornece esse valor ao processo Node.js. Também não
é preciso declarar variáveis de caminho se a estrutura acima foi preservada.

Clique em **NPM Install** e depois em **Restart App** (ou **Enable Node.js**).

## Validação após publicar

Abra, com as credenciais configuradas:

```text
https://seu-dominio/api/health
```

A resposta esperada é:

```json
{"status":"ok"}
```

Depois valide `/`, `/catalogo`, `/artes/stories`, `/artes/feed` e `/artes/indoor-h`.
Confira também `/api/indoor-backgrounds` para verificar a lista de fundos da TV.

### Instalação PWA

Mantenha o site na raiz do domínio/subdomínio, como nas rotas acima, e force HTTPS.
Envie também `public/manifest.json`, `public/manifest.webmanifest`, `public/sw.js`,
`public/offline.html`, `public/pwa.css`, `public/js/pwa.js`, `public/branding/`,
`public/pwa-icons/`, `public/apple-touch-icon.png` e
`public/apple-touch-icon-precomposed.png`, além das cinco páginas HTML atualizadas.
Reinicie a aplicação após atualizar o código em `src/`.

As páginas usam `/manifest.json?v=2`, servido como `application/json` também
pelo proxy. O `.webmanifest` é mantido apenas para links antigos. Os ícones
ficam em `/pwa-icons/`: **não use `/icons/`**, pois o Apache/Plesk pode resolver
esse caminho para seus próprios ícones em vez dos arquivos da aplicação.
O ícone Apple tem ainda os caminhos convencionais na raiz do site.

O Node permite GET/HEAD sem senha somente para esses manifestos e arquivos de
ícone enumerados, sem liberar páginas ou API. Se houver proteção de diretório
no próprio Plesk/nginx/Apache, esses metadados também precisam ser acessíveis
sem o desafio HTTP Basic. Não aplique cache longo a `/sw.js` e preserve seu
Content-Type JavaScript ao servi-lo diretamente pelo proxy.

Verifique a publicação, sem enviar credenciais:

```bash
npm run check:pwa -- https://vidamix.vidafarmacias.com.br
```

O comando verifica o HTML quando ele está acessível, o manifesto standalone,
o tipo MIME, os ícones PNG e suas dimensões. Ele falha se detectar referências
antigas a `/icons/`, erro HTTP (como 404/401) ou manifesto sem Content-Type JSON.
Com HTML protegido, informa que as tags da página não foram verificadas e
confere os arquivos públicos de instalação diretamente.

Após autenticar, confira o manifesto e o service worker nas ferramentas do
navegador e use **Instalar aplicativo** na central. Abra o ícone instalado e
confirme que o VidaMix inicia na central em uma janela standalone. Em iOS,
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
- Force HTTPS no domínio e mantenha a senha administrativa apenas nas
  variáveis de ambiente do Plesk.
