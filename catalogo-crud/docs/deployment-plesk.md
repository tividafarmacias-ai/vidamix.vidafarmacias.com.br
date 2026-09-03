# Publicacao no Plesk

Este projeto e uma aplicacao Node.js com SQLite. O codigo deve ser entregue por
Git, enquanto o banco, o catalogo de importacao e as imagens devem ficar fora
da arvore do release.

## Requisitos

- Plesk para Linux com Node.js Toolkit habilitado.
- Node.js 22.13 ou superior e inferior ao 25.
- Um dominio ou subdominio dedicado, com certificado SSL ativo.
- Acesso ao File Manager ou SSH para criar armazenamento privado.

O projeto usa node:sqlite. A partir da linha 22.13, esse modulo nao precisa da
flag experimental.

## 1. Criar o repositorio local

Execute uma unica vez na raiz do projeto:

    git init
    git add .
    git commit -m "chore: preparar publicacao no Plesk"
    git branch -M main

Crie um repositorio privado no provedor Git e conecte-o:

    git remote add origin URL-DO-REPOSITORIO
    git push -u origin main

Antes de cada envio, execute:

    npm.cmd ci
    npm.cmd run verify

Dados, senhas, node_modules e arquivos legados ja estao no .gitignore.

## 2. Criar dados persistentes

Nao coloque dados dentro da pasta que recebera deploy por Git. No servidor,
crie uma area privada, fora de httpdocs e fora da Application Root:

    /var/www/vhosts/seudominio.com/
      vidamix-app/                 aplicacao clonada pelo Git
      private/vidamix/
        storage/catalogo.sqlite     banco persistente
        catalogo/produtos.json      importacao do primeiro boot
        assets/
          manifesto-imagens.json
          imagens/                  arquivos referidos como imagens/...

Copie para essa area privada o catalogo, o manifesto e a pasta imagens
completa. IMAGES_ROOT deve apontar para o diretorio pai de imagens/, e nao para
a propria pasta imagens/. Conceda leitura para os assets e escrita somente em
storage/ ao usuario da assinatura Plesk. Nunca use permissao 777.

## 3. Configurar no painel Plesk

Em Websites and Domains > Node.js:

1. Selecione Node.js 22.13+; use 24.x LTS se estiver disponivel.
2. Application Root: a pasta com package.json e server.mjs, por exemplo
   vidamix-app.
3. Document Root: vidamix-app/public.
4. Application Startup File: server.mjs.
5. Application Mode: Production.
6. Package Manager: npm.
7. Em Custom Environment Variables, informe caminhos absolutos reais:

    NODE_ENV=production
    CATALOG_DATABASE_PATH=/var/www/vhosts/seudominio.com/private/vidamix/storage/catalogo.sqlite
    CATALOG_SOURCE=/var/www/vhosts/seudominio.com/private/vidamix/catalogo/produtos.json
    MANIFEST_SOURCE=/var/www/vhosts/seudominio.com/private/vidamix/assets/manifesto-imagens.json
    IMAGES_ROOT=/var/www/vhosts/seudominio.com/private/vidamix/assets
    STORY_BACKGROUNDS_ROOT=/var/www/vhosts/seudominio.com/vidamix-app/camas-stories
    APP_AUTH_ENABLED=true
    APP_AUTH_USERNAME=usuario-administrativo
    APP_AUTH_PASSWORD=senha-longa-e-unica

Nao configure CATALOGO_PORT. O Plesk fornece PORT para a aplicacao.

Em modo Production, a autenticacao HTTP Basic e obrigatoria. Guarde a senha em
um gerenciador de senhas. Ela nunca deve entrar no Git, HTML ou JavaScript.

## 4. Instalar e validar

1. Clique em NPM Install.
2. Se tiver SSH, na Application Root execute:

       npm run check:production

3. Clique em Enable Node.js ou Restart App.
4. Abra https://studio.seudominio.com.br/api/health, autentique-se e confirme
   a resposta {"status":"ok"}.
5. Verifique tambem /, /catalogo e /artes/stories.

Quando o banco ainda nao existe, o primeiro boot cria o SQLite e importa o
catalogo e o manifesto. Depois disso, os proximos starts usam o banco
persistente e nao reimportam os arquivos.

## 5. HTTPS, atualizacoes e rollback

1. Instale ou renove o certificado Let’s Encrypt e force HTTP para HTTPS.
2. Se o sistema for interno, complemente o login com restricao de IP ou VPN.
3. Consulte os logs no Plesk se o health check falhar.
4. Para cada release, valide localmente, envie a branch main, use a extensao
   Git do Plesk para fazer deploy, reinicie a aplicacao e teste as rotas.
5. Use tags, por exemplo v1.1.0, antes de cada publicacao. Para rollback,
   publique a tag anterior e reinicie a aplicacao.

O banco fica fora do release, portanto rollback de codigo nao apaga produtos.
Antes de qualquer mudanca de dados, faca backup consistente do SQLite: pare a
aplicacao e copie catalogo.sqlite, catalogo.sqlite-wal e catalogo.sqlite-shm
juntos, ou use uma ferramenta SQLite com backup online.

## Checklist

- [ ] Node 22.13+ selecionado.
- [ ] NODE_ENV=production e credenciais administrativas configuradas.
- [ ] Banco, catalogo, manifesto e imagens fora da aplicacao.
- [ ] npm run check:production aprovado.
- [ ] npm run verify aprovado localmente.
- [ ] HTTPS forcado e login administrativo testado.
- [ ] Backup inicial guardado fora do servidor.
