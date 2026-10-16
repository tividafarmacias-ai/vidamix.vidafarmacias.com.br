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
Envie também `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`,
`public/pwa.css`, `public/js/pwa.js`, `public/branding/` e `public/icons/`.
O Node serve o manifesto como `application/manifest+json` e o worker como
`text/javascript`, sem cache HTTP. Se nginx/Apache servir esses arquivos
diretamente, preserve esses tipos MIME e não aplique cache longo a `/sw.js`.

Após autenticar, confira o manifesto e o service worker nas ferramentas do
navegador e use **Instalar aplicativo** na central. Abra o ícone instalado e
confirme que o VidaMix inicia na central em uma janela standalone. Em iOS,
use o Safari e **Compartilhar > Adicionar à Tela de Início**.
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
