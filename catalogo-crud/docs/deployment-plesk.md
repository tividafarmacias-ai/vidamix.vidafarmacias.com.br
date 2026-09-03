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
Backgrounds:        ./camas-stories
```

## Antes de enviar

Na pasta `catalogo-crud`, execute:

```bash
npm ci
npm run verify
```

Envie todos os arquivos, inclusive `package-lock.json`, `camas-stories`,
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

Depois valide `/`, `/catalogo` e `/artes/stories`.

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