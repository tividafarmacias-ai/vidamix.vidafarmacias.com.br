# Bibliotecas locais

`mp4-muxer-5.2.2.js` é a distribuição ES module, sem alterações, do pacote
[`mp4-muxer` 5.2.2](https://www.npmjs.com/package/mp4-muxer/v/5.2.2), de Vanilagy.
Somente a extensão foi alterada de `.mjs` para `.js`, para usar o MIME JavaScript
do servidor. A licença MIT está em `mp4-muxer-LICENSE.txt`.

- Origem: https://unpkg.com/mp4-muxer@5.2.2/build/mp4-muxer.mjs
- Repositório: https://github.com/Vanilagy/mp4-muxer/tree/v5.2.2
- API: https://github.com/Vanilagy/mp4-muxer/blob/2c611c5932d3b8054c8968320cf9b6b7db094d30/README.md
- SHA-256 do módulo: `d2c4c782f180c86ed30b1f5d9487a34a0d370bf9b4535285734ea187d38f9bb5`

A versão fica fixa e é servida localmente, sem CDN durante a exportação.
O projeto upstream foi descontinuado em favor do Mediabunny. Este módulo pequeno
é usado apenas para empacotar os quadros H.264 codificados pelo WebCodecs em MP4,
sem dependência de instalação ou etapa de build.
