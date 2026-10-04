# EPA Viewer — editor web de arquivos `.INP`

Editor em página única para os arquivos de entrada (`.inp`) do **EPANET** e do **SWMM**.
Roda inteiramente no navegador: nenhum arquivo é enviado a servidor, e não há dependências nem etapa de build.

Feito para as tarefas repetitivas de preparação de modelos, como distribuir as demandas de todos os nós de uma rede ou montar um hietograma de blocos alternados.

## Recursos

**Geral**
- Abre arquivos EPANET e SWMM (detecção automática), por seleção ou arrastando o arquivo para a página.
- Edição fiel: ao salvar, só mudam as linhas que você editou; comentários, cabeçalhos, ordem e fim de linha (CRLF/LF) são preservados.
- Desfazer (Ctrl+Z), baixar com Ctrl+S, localizar/substituir no arquivo inteiro.
- Modelos novos (EPANET ou SWMM) já vêm com todas as seções padrão. Em um arquivo aberto, as seções ausentes aparecem na barra lateral e podem ser adicionadas com um clique (se ficarem vazias, não são gravadas).

**Visões de edição**
- **Tabela**: qualquer seção tabular, com filtro, paginação, seleção, duplicar/excluir linhas e colar do Excel.
- **Formulário**: seções chave/valor (`OPTIONS`, `TIMES`, `REPORT`, `EVAPORATION`, `ENERGY`, `REACTIONS`, ...) com campos, listas de opções e dicas.
- **Séries**: `TIMESERIES`, `CURVES` e `PATTERNS` com lista de séries, gráfico e escala de valores.
- **Por objeto**: `VERTICES`, `POLYGONS`, `COVERAGES`, `LID_USAGE`, `DEMANDS` etc., em que várias linhas pertencem ao mesmo ID. Vértices e polígonos têm pré-visualização geométrica.
- **Texto**: edição livre de qualquer seção.

**Ferramentas**
- **Operação em lote** (qualquer tabela): definir, multiplicar, somar, substituir texto ou usar expressão JavaScript, com condição e escopo (todas, filtradas, selecionadas).
- **Demandas em lote (EPANET)**: definir/multiplicar/somar, ou distribuir uma vazão total igualmente, proporcional à demanda atual ou ao comprimento dos trechos conectados; taxa por metro de rede; atribuição de padrão.
- **Hietograma (SWMM)**: blocos alternados, Chicago ou retangular a partir da IDF `i = K·T^a / (t + b)^c`; cria a série em `[TIMESERIES]` e o pluviômetro em `[RAINGAGES]`.

## Como usar

Abra o `public/index.html` no navegador (duplo clique) ou sirva a pasta `public/`:

```bash
npm start        # npx serve public
```

Fluxo típico: **Abrir .inp…** → editar → **Baixar .inp** (o arquivo sai como `nome_editado.inp`).

> Os parâmetros K, a, b, c que vêm preenchidos no gerador de hietogramas são apenas um exemplo. Use os da sua localidade. Em modelos SWMM com unidades US (CFS, GPM, MGD), a chuva deve estar em polegadas.

## Estrutura

```
public/             site estático (é a pasta publicada no Render)
  index.html        página única
  css/style.css     estilos (claro/escuro automático)
  js/core.js        parser/serializador, esquemas, formulários e ferramentas (sem DOM)
  js/app.js         interface
  assets/           logo e favicon
tests/              testes automatizados (node:test) e fixtures
render.yaml         blueprint do Render (site estático)
```

`public/js/core.js` não depende do DOM e funciona tanto no navegador (`window.Inp`) quanto no Node (`require`).

## Testes

Requer Node 20+ (sem pacotes externos):

```bash
npm test
```

Cobrem o round-trip byte a byte dos modelos em `tests/fixtures/`, edição de células, séries, operação em lote, demandas, hietogramas, formulários chave/valor, seções ausentes e visão por objeto.

## Publicação no Render

1. Envie o repositório ao GitHub.
2. No Render: **New → Static Site** e selecione o repositório.
3. **Build Command**: vazio (ou `echo "sem build"`). **Publish Directory**: `public`
4. Alternativamente, use o `render.yaml` incluso (**New → Blueprint**).

## Limitações conhecidas

- Células vazias no meio de uma linha podem deslocar colunas ao ser relidas pelo EPANET/SWMM, como nos próprios arquivos originais.
- Renomear um objeto ou série não atualiza referências em outras seções (use *Localizar/substituir*).
- Seções muito irregulares (`CONTROLS`, `RULES`, `TRANSECTS`, `LID_CONTROLS`, ...) são editadas como texto.

## Aviso

Projeto independente, sem vínculo com a U.S. EPA. EPANET e SWMM são softwares da Agência de Proteção Ambiental dos EUA.
Os modelos em `tests/fixtures/` são exemplos distribuídos com esses programas.

## Licença

[MIT](LICENSE) © 2026 Everton Jhons — [github.com/ejhons](https://github.com/ejhons)
