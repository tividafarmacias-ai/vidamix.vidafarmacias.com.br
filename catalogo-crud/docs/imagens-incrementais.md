# Imagens do catálogo de referência

O script `../../baixar-imagens-faltantes.mjs` compara `catalogo base.json`,
o SQLite `catalogo-crud/data/catalogo.sqlite`, o manifesto existente e os
arquivos em `imagens-produtos/imagens`. A sincronização dos produtos no SQLite
é uma etapa separada: este script abre o banco somente para leitura.

Requer Node 22.13 ou superior, dentro da versão suportada pela aplicação,
e as dependências de `catalogo-crud` instaladas, incluindo `sharp`.
Não carrega `.env`, não acessa MySQL e não consulta a API de produtos.

Execute na raiz `vidamix`:

```powershell
# Compara e grava relatórios, sem rede.
node baixar-imagens-faltantes.mjs

# Baixa apenas imagens que não têm correspondência local.
node baixar-imagens-faltantes.mjs --baixar

# Opcional: processa somente as primeiras 20 imagens faltantes.
node baixar-imagens-faltantes.mjs --baixar --limit 20
```

Os caminhos padrão são relativos ao próprio script. Opções de caminho
explicitamente informadas são relativas ao diretório de execução.
Veja todas as opções com `--help`.

## Correspondência e preservação

- O campo principal é `imagem_url`. Usa `imagem_url_exibicao` apenas quando
  o principal está vazio. Uma URL principal que retorna erro não é trocada
  silenciosamente pela imagem genérica.
- Cada URL normalizada é baixada uma única vez, mesmo quando vários produtos
  a utilizam. Por isso, não se deve tentar igualar a quantidade de arquivos à
  quantidade de produtos.
- A correspondência considera o nome com hash da URL utilizado pelo downloader
  antigo e os caminhos associados à mesma URL no manifesto ou SQLite.
  Não reutiliza uma foto apenas porque o ID, EAN ou nome do produto coincide:
  a URL pode ter mudado.
- Reconhece PNG/JPEG originais e conversões WebP, incluindo `_resultado.webp`.
  Confere existência, tamanho e decodificação da imagem; o status antigo do
  manifesto não prevalece sobre o arquivo físico.
- Preserva todos os arquivos existentes, inclusive os sem referência no novo
  catálogo. Se um arquivo inválido ocupa o destino, registra erro e preserva
  esse arquivo para revisão.
- Valida tipo, tamanho e decodificação dos novos downloads, utiliza timeout e
  novas tentativas para falhas transitórias. Publica o arquivo completo sem
  sobrescrever um destino criado por outra execução.
- Pode interromper e executar novamente: a próxima comparação reconhece os
  arquivos concluídos. Arquivos `.part-*` de uma interrupção abrupta não contam
  como imagens concluídas.

## Relatórios

São escritos em `comparacao-catalogo` e atualizados a cada execução:

| Arquivo | Conteúdo |
|---|---|
| `resumo.md` | Contagens da comparação e resultado da execução |
| `comparacao.json` | Produtos, imagens e diferenças do SQLite antes dos downloads |
| `imagens-faltantes.json` | URLs faltantes antes dos downloads, com IDs relacionados |
| `produtos-sem-url.json` | Produtos sem URL disponível ou com URL inválida |
| `manifesto-catalogo-base.json` | Mapa final produto → URL → arquivo/status, para a próxima sincronização |

O manifesto antigo `imagens-produtos/manifesto-imagens.json` é preservado.
Uma execução só de comparação também atualiza o novo manifesto, com status
`existente`, `faltante`, `sem_imagem` ou `url_invalida`. Depois de downloads, pode
conter `baixado` e `erro`. O campo `arquivo` só aponta para uma imagem disponível;
`arquivo_previsto` é apenas uma previsão para itens pendentes.

Códigos de saída: `0` execução concluída, `1` erro de configuração/leitura,
`2` um ou mais downloads falharam. Uma comparação pode terminar normalmente
mesmo com imagens faltantes; as contagens ficam no relatório.

## Próxima etapa: SQLite

Não execute uma reimportação destrutiva. Compare por `id`, pois há EANs
duplicados. Antes da sincronização, faça backup consistente do SQLite,
revise IDs exclusivos e mudanças de ID para o mesmo EAN, e preserve as
tabelas de revistas e autenticação. O novo manifesto permitirá associar
as imagens reaproveitadas e baixadas sem outra rodada de downloads.

## Sincronizar o manifesto principal com o catálogo atual

Depois de baixar imagens ou alterar os produtos, execute em `catalogo-crud`:

```powershell
# Apenas confere arquivos e vínculos; não grava alterações.
node scripts/sync-image-manifest.mjs

# Faz backup e atualiza o manifesto principal e os vínculos de imagens no SQLite.
node scripts/sync-image-manifest.mjs --apply
```

O script considera os produtos efetivamente presentes no SQLite. Valida as
imagens locais, reaproveita os manifestos de download e preserva imagens
manuais. Atualiza somente `imagem_arquivo` e `imagem_status` quando necessário.
Não baixa imagens nem altera os demais campos dos produtos.

O `manifesto-imagens.json` passa a conter `produtos` para todos os registros do
catálogo e `arquivos` para todos os arquivos locais, inclusive aqueles sem
produto associado. Arquivos sem referência não são excluídos. Os backups do
SQLite e do manifesto anterior ficam em `backups/sync-imagens-*`, com relatório.
A validação completa das imagens pode levar alguns minutos.

Um produto pode estar cadastrado corretamente e continuar sem foto: quando o
arquivo não existe localmente, a sincronização registra a ausência. Se a URL
remota retorna 404, é necessário obter uma URL válida ou cadastrar a imagem
manualmente; reconstruir o manifesto não recupera um arquivo inexistente.

Testes sem rede:

```powershell
cd catalogo-crud
npm run test:images-sync
```
