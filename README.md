# Validador de Dados — V2

Motor de validação de dados genérico (Excel, CSV ou API, qualquer entidade),
para migrações SAP ECC → S/4HANA (ou qualquer outra comparação de dados).

## Como executar (recomendado — sem servidor, sem Node, sem Python)

Abra o arquivo **`Validador-de-Dados-V2.html`** direto no navegador (duplo
clique). Não precisa instalar nada, não precisa terminal.

Esse arquivo é 100% autocontido: HTML + CSS + todo o motor de validação num
único arquivo. As únicas coisas buscadas pela internet são bibliotecas
públicas via CDN (Chart.js, ExcelJS, leitor de Excel/CSV, fontes) — o
processamento pesado roda local, num Web Worker criado via Blob (técnica que
funciona mesmo com a página aberta por `file://`, sem precisar de servidor).

## Como executar (alternativa — via servidor, para quem for editar o código)

A pasta `js/` (módulos ES separados: `core/`, `importers/`, `ui/`,
`dashboard/`, `exporters/`) é a fonte organizada do projeto, mais fácil de
manter e estender. Ela precisa de um servidor por causa dos ES Modules:

```bash
npm start       # http://localhost:5500
npm run dev     # mesma coisa, sem cache e com log de cada requisição
```

Não precisa `npm install` — `server.js` usa só módulos nativos do Node.

**Importante:** os dois modos (arquivo único e pasta modular) implementam a
mesma lógica, mas são gerados/mantidos separadamente. Uma alteração em `js/`
não aparece automaticamente no `Validador-de-Dados-V2.html`.

---

## Changelog

### v2.4 — Exportação de Clientes sem Correspondência

Novo botão **"Exportar sem correspondência"** ao lado dos demais. A planilha
traz: Cliente, Tabela, Arquivo encontrado, Arquivo ausente, Motivo — cabeçalho
destacado, cor por linha, filtro automático e largura de coluna ajustada, no
mesmo padrão das outras exportações.

A contagem da planilha é **garantidamente idêntica** à do card "Clientes sem
correspondência" do dashboard, porque os dois vêm da mesma lista
(`result.unmatchedClients`), montada uma única vez dentro do motor de
validação — não há dois lugares calculando esse número separadamente, então
não tem como divergir. Testado em `test/unmatchedClients.test.mjs`.

A planilha distingue 3 motivos possíveis:
- Cliente só existe na origem (ECC) → "Cliente não encontrado no arquivo de destino"
- Cliente só existe no destino (S/4) → "Cliente não encontrado no arquivo de origem"
- Cliente existe nos dois arquivos, mas parte das linhas não encontrou par
  (comum em entidades com chave composta, como KNVV, quando um cliente tem
  mais organizações de vendas de um lado que do outro) → marcado como
  "Parcial", já que não se encaixa no caso binário "só num arquivo".

### v2.3 — Correção crítica: erro ao importar arquivo no modo standalone

Se você tentou abrir `Validador-de-Dados-V2.html` direto (sem servidor) e
recebeu erro na hora de importar/ler o arquivo Excel: a causa era uma URL de
CDN errada. O worker carregava o SheetJS via
`cdn.jsdelivr.net/npm/xlsx@0.20.3/...`, mas o **jsDelivr não hospeda essa
versão** — o SheetJS parou de publicar versões recentes no registro npm
padrão; elas só existem no CDN oficial deles. Corrigido para
`https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (a URL
documentada oficialmente em docs.sheetjs.com). Testei a leitura de Excel de
ponta a ponta depois da correção.

Também nesta versão:

1. **Regra `0 = null`** — `0` na origem e vazio/`null` no destino (ou
   vice-versa) agora são considerados válidos, em qualquer comparação.
   Testado em `test/nullZeroRule.test.mjs`.
2. **Card "Total de campos comparados"** na seção Cobertura.
3. **Seção Qualidade reestruturada** — Clientes válidos / com divergência /
   sem correspondência, Campos validados / divergentes, e Taxa de sucesso
   dos clientes com a fórmula corrigida: `válidos / (válidos + com
   divergência)`, excluindo "sem correspondência" do denominador (testado).
4. **Dashboard com um único gráfico** — rosca de Clientes válidos × com
   divergência, cores verde/vermelho, valores sempre visíveis nas fatias.
   Removidos os gráficos de registros, campos críticos e DexPara (a
   informação continua nos cards e no plano de ação, só não é mais gráfico).
5. **Botão "Limpar filtros"** ao lado do filtro de campos na tela de upload.

### v2.2 — organizado pelas prioridades do documento de requisitos

**Alta prioridade**

**Exportação corrigida.** O dashboard mostrava ~11 mil "campos válidos", mas
o arquivo de válidos vinha vazio. Causa raiz: o dashboard antigo contava
**campos**, não **registros** — um único campo divergente já invalida o
registro inteiro, então é perfeitamente possível ter milhares de campos OK e
zero registros 100% válidos ao mesmo tempo. Testei isso com 200 mil
registros: 98,3% dos campos batem, mas só 95% dos registros são 100% válidos
(`test/perf.test.mjs`). A exportação agora usa a mesma contagem por registro
que o dashboard mostra, e quando realmente não há nenhum registro válido, o
arquivo explica isso numa nota em vez de vir vazio sem explicação.

**Métricas do dashboard por cliente/registro.** Substituí "campos válidos x
inválidos" por dois indicadores separados: **Clientes** (válidos / com
divergência / sem correspondência) e **Registros** (válidos / com
divergência) — com um banner no topo já resumindo o veredito geral.

**Filtro de campos de análise.** Nova seção "3. Campos a analisar" na tela de
upload — chips de texto (Enter para adicionar). Vazio = analisa todos os
campos, igual antes. O dashboard mostra quais campos entraram na análise.

**Funcionamento sem Python/Node.** Resolvido com o
`Validador-de-Dados-V2.html` — motor de validação, importadores, dashboard e
exportação, tudo embutido, Worker via Blob (não bloqueado por `file://`).
`npm start` continua disponível como alternativa para quem for mexer no
código-fonte modular.

**Média prioridade**

**Visual do dashboard.** Cards agrupados em 3 seções (Cobertura / Qualidade /
Performance) em vez de uma lista única, com cores por status (borda colorida
verde/âmbar/vermelho) e um banner-resumo no topo. Gráficos passaram a usar
`chartjs-plugin-datalabels`: os valores aparecem direto no gráfico, sem
precisar passar o mouse em cima.

**Filtro de divergências no relatório.** A tabela de divergências ganhou um
segundo controle além da busca por texto: um seletor com 5 categorias — Todos
/ Apenas De/Para aplicado / Apenas erros de validação / Apenas campos vazios
/ Apenas diferenças de valor (origem × destino real, excluindo campos
vazios). Testado em `test/divergenceTypeFilter.test.mjs`.

**Formatação profissional da planilha.** Trocada a biblioteca de escrita de
SheetJS para **ExcelJS** — a versão gratuita do SheetJS não escreve estilo de
célula (isso é recurso pago, SheetJS Pro). Todas as planilhas agora têm:
coluna "Tabela" com o nome da entidade comparada, cabeçalho colorido e em
negrito, primeira linha congelada, filtro automático habilitado, largura de
coluna ajustada, e cor por status nas linhas de divergência.

**Baixa prioridade**

**Plano de ação automático.** Nova seção no dashboard
(`js/dashboard/actionPlan.js`) que gera recomendações a partir dos próprios
números do resultado — sem nenhuma chamada externa. Prioriza nesta ordem:
registros sem correspondência, campos mais críticos (por volume de erro),
depois sugestões sobre completude das regras De/Para.

---

## Arquitetura

```
Validador-de-Dados-V2.html   ARQUIVO ÚNICO — abrir direto, sem servidor (recomendado)
standalone/
  worker-source.js            fonte do worker embutido no HTML (sem import/export)
  app-inline.js                fonte do script principal embutido no HTML

--- versão modular (fonte organizada, para manutenção — precisa de npm start) ---
index.html
server.js                     servidor estático zero-dependências
package.json
css/styles.css
js/
  app.js                       bootstrap + captura de erros fatais
  core/
    normalization.js
    ruleEngine.js
    matchingEngine.js          matching 1:1/1:N/N:N por Map (corrige o bug de KNVV do V1)
    validationEngine.js        orquestra tudo; rastreia status por campo/registro/cliente
  importers/                   Excel, CSV, API — todos devolvem {id, fields}
  exporters/excelExporter.js   ExcelJS: 4 relatórios estilizados (divergências, válidos, sem correspondência, resumo)
  dashboard/
    cards.js, charts.js, divergenceTable.js, actionPlan.js
  ui/
    uploadController.js, tagInput.js, progressController.js, resultsController.js
  worker/validation.worker.js
  utils/logger.js, errorBanner.js
config/
  comparisonTypes.json         define quais comparações usam regras De/Para
  entities.json                chave composta (primaryKey) por entidade
rules/
  KNA1.json, KNB1.json, KNVV.json
test/
  knvv.test.mjs                 prova a correção do bug de N:N
  fieldFilter.test.mjs           prova o filtro de campos
  divergenceTypeFilter.test.mjs  prova a classificação De/Para × erro × vazio
  nullZeroRule.test.mjs          prova a regra 0 = null e a taxa de sucesso dos clientes
  unmatchedClients.test.mjs      prova que a exportação bate 100% com o card do dashboard
  perf.test.mjs                  200.000 registros/lado — e reproduz o bug de campos x registros
```

## ⚠️ Pontos que precisam da sua validação

- `config/entities.json`: as chaves compostas de `KNB5`, `KNVI`, `KNVP`,
  `ARDC`, `ARD6` são um melhor-esforço meu (não vieram de arquivos de regras
  originais para essas 5 tabelas) — valide com o time funcional antes de usar
  em produção.
- O filtro "Apenas diferenças de valor" no relatório de divergências exclui
  casos onde um dos lados está vazio (esses caem em "Apenas campos vazios").
  Se o entendimento do time for outro, é só ajustar `DIVERGENCE_TYPE_FILTERS`
  em `js/dashboard/divergenceTable.js` (ou a constante equivalente dentro do
  `Validador-de-Dados-V2.html`).

## Rodando os testes

```bash
node test/knvv.test.mjs
node test/fieldFilter.test.mjs
node test/divergenceTypeFilter.test.mjs
node test/perf.test.mjs
```
