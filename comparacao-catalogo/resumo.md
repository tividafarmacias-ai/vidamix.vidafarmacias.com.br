# Comparação do catálogo

Gerado em: 2026-10-20T18:58:47.211Z. Modo: download_incremental.

| Item | Quantidade |
|---|---:|
| Produtos no catálogo de referência | 11375 |
| Produtos no SQLite | 1718 |
| IDs a incluir no SQLite | 9658 |
| IDs exclusivos do SQLite | 1 |
| Registros comuns com diferenças | 58 |
| Arquivos locais antes desta execução | 5229 |
| URLs de imagem únicas no catálogo | 11214 |
| Imagens reaproveitadas antes desta execução | 5177 |
| Imagens faltantes antes desta execução | 6037 |
| Produtos com imagem local antes desta execução | 5282 |
| Produtos com imagem faltante antes desta execução | 6088 |
| Produtos sem URL de imagem | 5 |
| Produtos usando imagem genérica de fallback | 49 |
| Arquivos locais sem referência no catálogo | 52 |
| Novas imagens baixadas nesta execução | 551 |
| Downloads com erro nesta execução | 5486 |
| Produtos com imagem após esta execução | 5833 |
| Produtos com download pendente após esta execução | 5537 |

Produtos podem compartilhar URLs: o total de imagens únicas não é igual ao total de produtos.
Usamos `imagem_url` como prioridade e o outro campo apenas quando ele está vazio.
A imagem genérica Tarjado é identificada como tal; não é uma foto individual.
Arquivos sem referência não são removidos. O SQLite e o manifesto antigo permanecem intactos.

O arquivo comparacao.json detalha a comparação anterior aos downloads.
O manifesto-catalogo-base.json contém o resultado e os caminhos locais após a execução.
imagens-faltantes.json lista as URLs selecionáveis antes da execução, e produtos-sem-url.json
lista os produtos que dependem de correção da origem.

Para comparar novamente, na raiz vidamix:

```powershell
node baixar-imagens-faltantes.mjs
```

Para baixar somente as imagens que ainda faltarem:

```powershell
node baixar-imagens-faltantes.mjs --baixar
```
