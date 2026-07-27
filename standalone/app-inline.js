// ============================================================================
// THREAD PRINCIPAL — UI, dashboard e exportação. Script clássico (sem
// import/export), tudo em um escopo só. Os dados de configuração (tipos de
// comparação, entidades e regras De/Para) são injetados logo acima deste
// script como constantes (COMPARISON_TYPES, ENTITIES, RULES_DATA) — nada é
// buscado via fetch(), então funciona também em file://.
// ============================================================================

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------
const logger = {
  debug: (...a) => console.debug('[Validador]', ...a),
  info: (...a) => console.info('[Validador]', ...a),
  warn: (...a) => console.warn('[Validador]', ...a),
  error: (...a) => console.error('[Validador]', ...a),
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n) {
  return Number(n).toLocaleString('pt-BR');
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function showFatalError(message, { hint } = {}) {
  let el = document.getElementById('fatalError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatalError';
    document.body.prepend(el);
  }
  el.className = 'fatal-error';
  el.innerHTML = `
    <strong>Não foi possível carregar o Validador de Dados</strong>
    <p>${escapeHtml(message)}</p>
    ${hint ? `<p class="fatal-error__hint">${hint}</p>` : ''}
  `;
  el.style.display = 'block';
}

// ---------------------------------------------------------------------------
// tag input (filtro de campos)
// ---------------------------------------------------------------------------
function createTagInput(container) {
  let values = [];
  container.innerHTML = `
    <div class="tag-input">
      <div class="tag-input__chips" data-role="chips"></div>
      <input type="text" data-role="input" placeholder="Digite o nome do campo e pressione Enter (ex: NAME1, STREET, CITY)" />
    </div>
  `;
  const chipsEl = container.querySelector('[data-role="chips"]');
  const inputEl = container.querySelector('[data-role="input"]');

  function render() {
    chipsEl.innerHTML = values
      .map((v, i) => `<span class="tag-chip">${escapeHtml(v)}<button type="button" data-index="${i}" aria-label="Remover ${escapeHtml(v)}">×</button></span>`)
      .join('');
  }
  function addValue(raw) {
    const clean = raw.trim();
    if (!clean) return;
    if (!values.some((v) => v.toUpperCase() === clean.toUpperCase())) values.push(clean);
    render();
  }
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addValue(inputEl.value);
      inputEl.value = '';
    } else if (e.key === 'Backspace' && !inputEl.value && values.length) {
      values.pop();
      render();
    }
  });
  inputEl.addEventListener('blur', () => {
    if (inputEl.value.trim()) {
      addValue(inputEl.value);
      inputEl.value = '';
    }
  });
  chipsEl.addEventListener('click', (e) => {
    const idx = e.target?.dataset?.index;
    if (idx !== undefined) {
      values.splice(Number(idx), 1);
      render();
    }
  });
  return { getValues: () => [...values], setValues: (v) => { values = [...v]; render(); } };
}

// ---------------------------------------------------------------------------
// upload controller
// ---------------------------------------------------------------------------
let fieldFilterInputRef = null;

function initUploadController({ onStart }) {
  populateSelect('comparisonType', COMPARISON_TYPES, (key, cfg) => cfg.label);
  populateSelect('entityName', ENTITIES, (key, cfg) => `${key} — ${cfg.label}`, { extra: { CUSTOM: 'Outra entidade (configurar manualmente)' } });

  buildSourceForm('origin', 'Origem');
  buildSourceForm('dest', 'Destino');
  fieldFilterInputRef = createTagInput(document.getElementById('fieldFilterContainer'));
  document.getElementById('clearFieldFilterBtn').addEventListener('click', () => fieldFilterInputRef.setValues([]));

  document.getElementById('comparisonType').addEventListener('change', updateRulesHint);
  document.getElementById('entityName').addEventListener('change', toggleCustomKeyFields);
  document.getElementById('startBtn').addEventListener('click', () => handleStart(onStart));

  updateRulesHint();
  toggleCustomKeyFields();
}

function populateSelect(id, dict, labelFn, { extra } = {}) {
  const select = document.getElementById(id);
  select.innerHTML = '';
  for (const [key, cfg] of Object.entries(dict)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = labelFn(key, cfg);
    select.appendChild(opt);
  }
  if (extra) {
    for (const [key, label] of Object.entries(extra)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      select.appendChild(opt);
    }
  }
}

function updateRulesHint() {
  const type = COMPARISON_TYPES[document.getElementById('comparisonType').value];
  const hint = document.getElementById('rulesHint');
  hint.textContent = type?.useRules
    ? '✓ Este tipo de comparação carrega automaticamente as regras De/Para (DexPara) da entidade selecionada.'
    : '— Comparação literal: nenhuma regra De/Para será carregada.';
  hint.className = type?.useRules ? 'hint hint--active' : 'hint';
}

function toggleCustomKeyFields() {
  const isCustom = document.getElementById('entityName').value === 'CUSTOM';
  document.getElementById('customKeyRow').style.display = isCustom ? 'flex' : 'none';
}

function buildSourceForm(prefix, label) {
  const container = document.getElementById(`${prefix}Source`);
  container.innerHTML = `
    <h3>${label}</h3>
    <label>Tipo de origem
      <select id="${prefix}Type">
        <option value="excel">Arquivo Excel (.xlsx)</option>
        <option value="csv">Arquivo CSV</option>
        <option value="api">API REST (GET)</option>
      </select>
    </label>
    <div id="${prefix}Fields"></div>
  `;
  const typeSelect = container.querySelector(`#${prefix}Type`);
  typeSelect.addEventListener('change', () => renderSourceFields(prefix));
  renderSourceFields(prefix);
}

function renderSourceFields(prefix) {
  const type = document.getElementById(`${prefix}Type`).value;
  const fieldsContainer = document.getElementById(`${prefix}Fields`);
  if (type === 'excel' || type === 'csv') {
    fieldsContainer.innerHTML = `
      <label>Arquivo
        <input type="file" id="${prefix}File" accept="${type === 'excel' ? '.xls,.xlsx' : '.csv'}" />
      </label>
      <label>Coluna de identificador (ID)
        <input type="text" id="${prefix}IdField" placeholder="ex: KUNNR" value="KUNNR" />
      </label>
    `;
  } else {
    fieldsContainer.innerHTML = `
      <label>URL do endpoint (GET)
        <input type="url" id="${prefix}Url" placeholder="https://api.exemplo.com/customers" />
      </label>
      <label>Propriedade do identificador (ID)
        <input type="text" id="${prefix}IdField" placeholder="ex: id ou KUNNR" value="id" />
      </label>
      <label>Caminho do array na resposta (opcional)
        <input type="text" id="${prefix}ArrayPath" placeholder="ex: data.items (deixe vazio se a resposta já é um array)" />
      </label>
    `;
  }
}

function readSource(prefix) {
  const type = document.getElementById(`${prefix}Type`).value;
  const idField = document.getElementById(`${prefix}IdField`).value.trim();
  if (!idField) throw new Error(`Informe a coluna/propriedade de identificador para a ${prefix === 'origin' ? 'origem' : 'destino'}.`);
  if (type === 'excel' || type === 'csv') {
    const file = document.getElementById(`${prefix}File`).files[0];
    if (!file) throw new Error(`Selecione o arquivo de ${prefix === 'origin' ? 'origem' : 'destino'}.`);
    return { type, file, idField };
  }
  const url = document.getElementById(`${prefix}Url`).value.trim();
  if (!url) throw new Error(`Informe a URL da API de ${prefix === 'origin' ? 'origem' : 'destino'}.`);
  const arrayPath = document.getElementById(`${prefix}ArrayPath`).value.trim();
  return { type, url, idField, options: arrayPath ? { arrayPath } : {} };
}

function handleStart(onStart) {
  try {
    const comparisonTypeKey = document.getElementById('comparisonType').value;
    const comparisonType = COMPARISON_TYPES[comparisonTypeKey];
    const entityName = document.getElementById('entityName').value;

    let entityConfig = ENTITIES[entityName] || null;
    if (entityName === 'CUSTOM') {
      const raw = document.getElementById('customKeyFields').value.trim();
      entityConfig = raw ? { primaryKey: raw.split(',').map((s) => s.trim()).filter(Boolean) } : null;
    }

    const rules = comparisonType.useRules ? (RULES_DATA[entityName.toUpperCase()] || { table: entityName, fieldMappings: {} }) : null;

    const originSource = readSource('origin');
    const destSource = readSource('dest');
    const fieldFilter = fieldFilterInputRef.getValues();

    onStart({ originSource, destSource, entityName, rules, entityConfig, fieldFilter: fieldFilter.length ? fieldFilter : null });
  } catch (err) {
    logger.warn(err.message);
    alert(err.message);
  }
}

// ---------------------------------------------------------------------------
// progress controller
// ---------------------------------------------------------------------------
const STAGE_LABELS = {
  import: 'Lendo arquivos/origens...',
  indexing: 'Indexando registros (Map)...',
  comparing: 'Comparando registros...',
  summarizing: 'Gerando resultados...',
  done: 'Concluído',
};
const STAGE_ORDER = ['import', 'indexing', 'comparing', 'summarizing'];
let progressStartedAt = null;

function resetProgress() {
  progressStartedAt = performance.now();
  document.querySelectorAll('.pipeline li').forEach((li) => li.classList.remove('is-active', 'is-done'));
  updateProgress({ stage: 'import', percent: 0 });
}

function updateProgress({ stage, percent }) {
  const bar = document.getElementById('progressBar');
  const label = document.getElementById('progressLabel');
  const eta = document.getElementById('progressEta');
  bar.style.width = `${percent}%`;
  bar.setAttribute('aria-valuenow', String(percent));
  label.textContent = `${STAGE_LABELS[stage] || stage} (${percent}%)`;
  updatePipeline(stage);
  if (percent > 0 && percent < 100 && progressStartedAt) {
    const elapsed = performance.now() - progressStartedAt;
    const estimatedTotal = (elapsed / percent) * 100;
    eta.textContent = `Tempo estimado restante: ${formatSeconds(Math.max(0, estimatedTotal - elapsed))}`;
  } else if (percent >= 100) {
    eta.textContent = `Concluído em ${formatSeconds(performance.now() - progressStartedAt)}`;
  }
}

function updatePipeline(stage) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  document.querySelectorAll('.pipeline li').forEach((li) => {
    const idx = STAGE_ORDER.indexOf(li.dataset.stage);
    li.classList.toggle('is-done', idx < currentIndex || stage === 'done');
    li.classList.toggle('is-active', idx === currentIndex && stage !== 'done');
  });
}

function formatSeconds(ms) {
  const s = ms / 1000;
  return s < 1 ? '< 1s' : `${s.toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// dashboard: cards
// ---------------------------------------------------------------------------
function renderHeroBanner(container, result) {
  const { summary } = result;
  const rate = summary.clientSuccessRate;
  const comparedClients = summary.clientsValid + summary.clientsWithError;
  let tone, icon, verdict;
  if (rate >= 98) { tone = 'ok'; icon = '✓'; verdict = 'Migração consistente'; }
  else if (rate >= 85) { tone = 'warn'; icon = '!'; verdict = 'Atenção — divergências pontuais'; }
  else { tone = 'error'; icon = '✕'; verdict = 'Revisão necessária — divergências relevantes'; }

  const unmatchedNote = summary.clientsUnmatched
    ? ` · ${fmt(summary.clientsUnmatched)} cliente(s) sem correspondência (fora desse cálculo)`
    : '';

  container.className = `hero-banner hero-banner--${tone}`;
  container.innerHTML = `
    <span class="hero-banner__icon">${icon}</span>
    <div class="hero-banner__text">
      <strong>${verdict}</strong>
      <span>${fmt(summary.clientsValid)} de ${fmt(comparedClients)} clientes comparados são válidos (${rate}%)${unmatchedNote}</span>
    </div>
  `;
}

function renderFieldFilterBanner(container, result) {
  if (result.appliedFieldFilter?.length) {
    container.innerHTML = `<strong>Campos analisados (filtro aplicado):</strong> ${result.appliedFieldFilter.join(', ')}`;
  } else {
    container.innerHTML = `<strong>Campos analisados:</strong> todos os campos comuns entre origem e destino (${result.fieldsAnalyzed.length})`;
  }
  container.style.display = 'block';
}

function renderCoverageCards(container, result) {
  const { summary } = result;
  renderCards(container, [
    { label: 'Registros na origem', value: fmt(summary.originRecordCount) },
    { label: 'Registros no destino', value: fmt(summary.destRecordCount) },
    { label: 'Registros comparados', value: fmt(summary.comparedPairs) },
    { label: 'Sem correspondência', value: fmt(summary.unmatchedOriginCount + summary.unmatchedDestCount), tone: summary.unmatchedOriginCount + summary.unmatchedDestCount ? 'warn' : 'ok' },
    { label: 'Total de campos comparados', value: fmt(summary.totalFieldsAnalyzed) },
  ]);
}

function renderQualityCards(container, result) {
  const { summary } = result;
  renderCards(container, [
    { label: 'Clientes válidos', value: fmt(summary.clientsValid), tone: 'ok' },
    { label: 'Clientes com divergência', value: fmt(summary.clientsWithError), tone: summary.clientsWithError ? 'error' : 'ok' },
    { label: 'Clientes sem correspondência', value: fmt(summary.clientsUnmatched), tone: summary.clientsUnmatched ? 'warn' : 'ok' },
    { label: 'Quantidade de campos validados', value: fmt(summary.validFields), tone: 'ok' },
    { label: 'Quantidade de campos divergentes', value: fmt(summary.invalidFields), tone: summary.invalidFields ? 'error' : 'ok' },
    { label: 'Taxa de sucesso dos clientes', value: `${summary.clientSuccessRate}%`, tone: summary.clientSuccessRate >= 95 ? 'ok' : summary.clientSuccessRate >= 80 ? 'warn' : 'error', big: true },
  ]);
}

function renderPerformanceCards(container, result) {
  const { summary, dexPara } = result;
  renderCards(container, [
    { label: 'Tempo de processamento', value: formatDuration(summary.elapsedMs) },
    { label: 'Resolvido via DexPara', value: dexPara.used ? `${dexPara.percentResolvedByDexPara}%` : 'não aplicável' },
  ]);
}

function renderCards(container, cards) {
  container.innerHTML = cards
    .map((c) => `
      <div class="card card--${c.tone || 'neutral'} ${c.big ? 'card--big' : ''}">
        <span class="card__value">${c.value}</span>
        <span class="card__label">${c.label}</span>
      </div>`)
    .join('');
}

// ---------------------------------------------------------------------------
// dashboard: charts
// ---------------------------------------------------------------------------
const chartPalette = { ok: '#34C77B', error: '#F2545B', text: '#8FA3B3' };
const chartInstances = new Map();

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (chartInstances.has(canvasId)) chartInstances.get(canvasId).destroy();
  const chart = new Chart(canvas, { ...config, plugins: [ChartDataLabels] });
  chartInstances.set(canvasId, chart);
  return chart;
}

/** Único gráfico do dashboard: clientes válidos x clientes com divergência. */
function renderClientsChart(canvasId, summary) {
  const total = summary.clientsValid + summary.clientsWithError;
  return renderChart(canvasId, {
    type: 'doughnut',
    data: {
      labels: ['Clientes válidos', 'Clientes com divergência'],
      datasets: [{ data: [summary.clientsValid, summary.clientsWithError], backgroundColor: [chartPalette.ok, chartPalette.error], borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { color: chartPalette.text, font: { family: 'Inter, sans-serif', size: 13 }, padding: 14 } },
        datalabels: {
          color: '#0E1620',
          font: { weight: '700', size: 15 },
          formatter: (value) => {
            if (!value) return '';
            const pct = total ? Math.round((value / total) * 100) : 0;
            return [value.toLocaleString('pt-BR'), `(${pct}%)`];
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// dashboard: tabela de divergências (busca + filtro por tipo + paginação)
// ---------------------------------------------------------------------------
const DIVERGENCE_TYPE_FILTERS = {
  all: () => true,
  dexpara: (d) => d.status === 'dexpara',
  error: (d) => d.status === 'error',
  empty: (d) => d.isEmpty,
  valueDiff: (d) => d.status === 'error' && !d.isEmpty,
};

function initDivergenceTable({ searchInput, typeFilterSelect, tableBody, pagination, divergences }) {
  const PAGE_SIZE = 50;
  let filtered = divergences;
  let page = 1;

  function apply() {
    const term = searchInput.value.trim().toUpperCase();
    const typeKey = typeFilterSelect ? typeFilterSelect.value : 'all';
    const typePredicate = DIVERGENCE_TYPE_FILTERS[typeKey] || DIVERGENCE_TYPE_FILTERS.all;

    filtered = divergences.filter((d) => {
      if (!typePredicate(d)) return false;
      if (!term) return true;
      return d.id.toUpperCase().includes(term) || d.field.toUpperCase().includes(term) || String(d.origin).toUpperCase().includes(term) || String(d.dest).toUpperCase().includes(term);
    });
    page = 1;
    render();
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML = pageItems.map((d) => `
        <tr>
          <td class="mono">${escapeHtml(d.id)}</td>
          <td>${escapeHtml(d.field)}</td>
          <td>${escapeHtml(String(d.origin ?? ''))}</td>
          <td>${escapeHtml(String(d.dest ?? ''))}</td>
          <td><span class="status-pill status-pill--${d.status}">${d.status === 'dexpara' ? 'DexPara' : 'Erro'}</span></td>
        </tr>`).join('') || `<tr><td colspan="5" class="empty-row">Nenhuma divergência encontrada com esse filtro.</td></tr>`;

    pagination.innerHTML = `
      <button data-action="prev" ${page <= 1 ? 'disabled' : ''}>&larr; Anterior</button>
      <span>Página ${page} de ${totalPages} · ${filtered.length.toLocaleString('pt-BR')} de ${divergences.length.toLocaleString('pt-BR')} registros</span>
      <button data-action="next" ${page >= totalPages ? 'disabled' : ''}>Próxima &rarr;</button>
    `;
  }

  searchInput.addEventListener('input', apply);
  if (typeFilterSelect) typeFilterSelect.addEventListener('change', apply);
  pagination.addEventListener('click', (e) => {
    const action = e.target?.dataset?.action;
    if (action === 'prev') page--;
    if (action === 'next') page++;
    render();
  });
  render();
}

// ---------------------------------------------------------------------------
// dashboard: plano de ação
// ---------------------------------------------------------------------------
function buildActionPlan(result) {
  const { summary, dexPara, topCriticalFields } = result;
  const actions = [];

  if (summary.unmatchedOriginCount > 0) {
    actions.push({ severity: 'high', title: `${fmt(summary.unmatchedOriginCount)} registro(s) de origem sem correspondência no destino`,
      description: 'Verifique se esses registros realmente deveriam existir no destino (podem não ter sido migrados/carregados ainda) ou se o campo/chave usado para identificar o registro está divergente entre origem e destino.' });
  }
  if (summary.unmatchedDestCount > 0) {
    actions.push({ severity: 'medium', title: `${fmt(summary.unmatchedDestCount)} registro(s) no destino sem correspondência na origem`,
      description: 'Confirme se são registros criados diretamente no destino (esperado) ou se indicam duplicidade/erro de carga. Se inesperados, revisar o processo de migração desses registros.' });
  }

  const criticalWithErrors = topCriticalFields.filter((f) => f.error > 0);
  for (const field of criticalWithErrors.slice(0, 5)) {
    actions.push({
      severity: field.successRate < 70 ? 'high' : field.successRate < 90 ? 'medium' : 'low',
      title: `Campo "${field.field}": ${fmt(field.error)} divergência(s) em ${fmt(field.affectedRecords)} registro(s)`,
      description: dexPara.used
        ? `Taxa de sucesso do campo: ${field.successRate}%. Revise se falta uma regra De/Para para os valores divergentes, ou se é uma inconsistência real de dados que precisa ser corrigida na origem.`
        : `Taxa de sucesso do campo: ${field.successRate}%. Como esta comparação é literal (sem regras De/Para), confirme com o time funcional se esse campo deveria mesmo ser idêntico entre origem e destino, ou se precisa de uma regra de conversão.`,
    });
  }

  if (dexPara.used && dexPara.dexParaMatches > 0 && criticalWithErrors.length > 0) {
    actions.push({ severity: 'low', title: 'Revisar completude das regras De/Para',
      description: `${dexPara.percentResolvedByDexPara}% das divergências de valor foram resolvidas automaticamente por regras De/Para. Os campos com erro acima podem precisar de novas entradas nesse mapeamento.` });
  }

  if (actions.length === 0) {
    actions.push({ severity: 'info', title: 'Nenhuma divergência crítica identificada',
      description: `${summary.clientsValid} de ${summary.clientsTotal} clientes (${summary.clientSuccessRate}%) passaram em todas as validações. Recomenda-se uma revisão amostral antes de finalizar a migração.` });
  } else {
    actions.push({ severity: 'info', title: 'Próximo passo sugerido',
      description: 'Exporte a planilha de divergências e encaminhe para os responsáveis por cada campo/área corrigirem a origem, ajustarem o mapeamento De/Para ou confirmarem que a diferença é esperada.' });
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 };
  return actions.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---------------------------------------------------------------------------
// exporters (ExcelJS)
// ---------------------------------------------------------------------------
const XLSX_COLORS = { headerDivergencias: 'FFB3261E', headerValidos: 'FF1E7A45', headerResumo: 'FF12405C', headerUnmatched: 'FF8A6D1D', dexpara: 'FFFFF3CD', erro: 'FFFCE0E1', parcial: 'FFFFF3CD' };

async function exportDivergences(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);

  const sheet = wb.addWorksheet('Divergencias por campo');
  sheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 }, { header: 'ID', key: 'id', width: 16 },
    { header: 'Campo', key: 'campo', width: 20 }, { header: 'Valor Origem', key: 'origem', width: 22 },
    { header: 'Valor Destino', key: 'destino', width: 22 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Mensagem', key: 'mensagem', width: 46 },
  ];
  styleHeader(sheet, XLSX_COLORS.headerDivergencias);
  result.divergences.forEach((d) => {
    const row = sheet.addRow({
      tabela: result.entityName, id: d.id, campo: d.field, origem: d.origin, destino: d.dest,
      status: d.status === 'dexpara' ? 'Divergência convertida (DexPara)' : 'Erro',
      mensagem: d.status === 'dexpara' ? 'Divergência esperada, resolvida por regra De/Para.' : (d.isEmpty ? 'Campo vazio em um dos lados.' : 'Valores incompatíveis entre origem e destino.'),
    });
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: d.status === 'dexpara' ? XLSX_COLORS.dexpara : XLSX_COLORS.erro } };
  });
  if (!result.divergences.length) addEmptyNotice(sheet, 7, 'Nenhuma divergência de campo encontrada — todos os registros pareados bateram integralmente.');
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };

  const recordSheet = wb.addWorksheet('Registros com divergencia');
  recordSheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 }, { header: 'ID', key: 'id', width: 16 },
    { header: 'Campos verificados', key: 'checked', width: 18 }, { header: 'Campos OK', key: 'ok', width: 14 },
    { header: 'Campos DexPara', key: 'dexpara', width: 16 }, { header: 'Campos com erro', key: 'error', width: 16 },
  ];
  styleHeader(recordSheet, XLSX_COLORS.headerDivergencias);
  result.invalidRecords.forEach((r) => {
    const row = recordSheet.addRow({ tabela: result.entityName, id: r.id, checked: r.fieldsChecked, ok: r.okFields, dexpara: r.dexparaFields, error: r.errorFields });
    row.getCell('error').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.erro } };
  });
  if (!result.invalidRecords.length) addEmptyNotice(recordSheet, 6, 'Nenhum registro com divergência — todos os registros pareados são válidos.');

  await downloadWorkbook(wb, fileName(result, 'divergencias'));
}

async function exportValid(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);
  const sheet = wb.addWorksheet('Registros validos');
  sheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 }, { header: 'ID', key: 'id', width: 16 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Campos validados', key: 'validados', width: 18 },
    { header: 'Campos via DexPara', key: 'dexpara', width: 18 }, { header: 'Data/Hora', key: 'data', width: 20 },
  ];
  styleHeader(sheet, XLSX_COLORS.headerValidos);
  const now = new Date().toLocaleString('pt-BR');
  result.validRecords.forEach((r) => sheet.addRow({ tabela: result.entityName, id: r.id, status: 'Válido', validados: r.fieldsValidated, dexpara: r.dexparaFields || 0, data: now }));
  if (!result.validRecords.length) {
    addEmptyNotice(sheet, 6, `Nenhum registro ficou 100% válido nesta validação (${result.summary.recordsInvalid} de ${result.summary.comparedPairs} registros comparados têm ao menos 1 campo divergente). Veja o arquivo de divergências para o detalhe.`);
  }
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };
  await downloadWorkbook(wb, fileName(result, 'validos'));
}

async function exportUnmatched(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);
  const sheet = wb.addWorksheet('Clientes sem correspondencia');
  sheet.columns = [
    { header: 'Cliente', key: 'id', width: 16 },
    { header: 'Tabela', key: 'tabela', width: 14 },
    { header: 'Arquivo encontrado', key: 'foundIn', width: 20 },
    { header: 'Arquivo ausente', key: 'missingFrom', width: 20 },
    { header: 'Motivo', key: 'reason', width: 60 },
  ];
  styleHeader(sheet, XLSX_COLORS.headerUnmatched);
  result.unmatchedClients.forEach((c) => {
    const row = sheet.addRow({ id: c.id, tabela: result.entityName, foundIn: c.foundIn, missingFrom: c.missingFrom, reason: c.reason });
    if (c.missingFrom === 'Parcial') row.getCell('missingFrom').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.parcial } };
  });
  if (!result.unmatchedClients.length) {
    addEmptyNotice(sheet, 5, 'Nenhum cliente sem correspondência — todos os clientes foram encontrados nos dois arquivos.');
  }
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };
  await downloadWorkbook(wb, fileName(result, 'sem_correspondencia'));
}

async function exportSummary(result) {
  const { summary, dexPara, topCriticalFields } = result;
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);
  const sheet = wb.addWorksheet('Resumo');
  sheet.columns = [{ header: 'Indicador', key: 'k', width: 38 }, { header: 'Valor', key: 'v', width: 20 }];
  styleHeader(sheet, XLSX_COLORS.headerResumo);
  const rows = [
    ['Entidade', result.entityName], ['Campos analisados (filtro)', result.appliedFieldFilter ? result.appliedFieldFilter.join(', ') : 'Todos'],
    ['Registros na origem', summary.originRecordCount], ['Registros no destino', summary.destRecordCount],
    ['Registros comparados', summary.comparedPairs], ['Registros sem correspondência (origem)', summary.unmatchedOriginCount],
    ['Registros sem correspondência (destino)', summary.unmatchedDestCount], ['Clientes totais', summary.clientsTotal],
    ['Clientes válidos', summary.clientsValid], ['Clientes com divergência', summary.clientsWithError],
    ['Clientes sem correspondência', summary.clientsUnmatched], ['Taxa de sucesso por cliente (%)', summary.clientSuccessRate],
    ['Registros válidos', summary.recordsValid], ['Registros com divergência', summary.recordsInvalid],
    ['Taxa de sucesso por registro (%)', summary.recordSuccessRate], ['Tempo de processamento (ms)', summary.elapsedMs],
    ['Usou regras De/Para', dexPara.used ? 'Sim' : 'Não'], ['Comparações resolvidas por DexPara', dexPara.dexParaMatches],
    ['% resolvido por DexPara', dexPara.percentResolvedByDexPara],
  ];
  rows.forEach(([k, v]) => sheet.addRow({ k, v }));

  const criticalSheet = wb.addWorksheet('Campos criticos');
  criticalSheet.columns = [
    { header: 'Campo', key: 'field', width: 22 }, { header: 'Erros', key: 'error', width: 12 },
    { header: 'DexPara', key: 'dexpara', width: 12 }, { header: 'OK', key: 'ok', width: 12 },
    { header: 'Clientes afetados', key: 'affected', width: 16 }, { header: '% sucesso', key: 'rate', width: 12 },
  ];
  styleHeader(criticalSheet, XLSX_COLORS.headerResumo);
  topCriticalFields.forEach((f) => {
    const row = criticalSheet.addRow({ field: f.field, error: f.error, dexpara: f.dexpara, ok: f.ok, affected: f.affectedRecords, rate: f.successRate });
    if (f.error > 0) row.getCell('error').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.erro } };
  });

  await downloadWorkbook(wb, fileName(result, 'resumo'));
}

function setupWorkbookMeta(wb) {
  wb.creator = 'Validador de Dados V2';
  wb.created = new Date();
}
function styleHeader(sheet, argbColor) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor } };
    cell.alignment = { vertical: 'middle' };
  });
  header.height = 20;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
function addEmptyNotice(sheet, colSpan, message) {
  const row = sheet.addRow([message]);
  sheet.mergeCells(row.number, 1, row.number, colSpan);
  row.getCell(1).font = { italic: true, color: { argb: 'FF5C7284' } };
  row.getCell(1).alignment = { wrapText: true };
}
async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function fileName(result, prefix) {
  return `${prefix}_${result.entityName}_${result.generatedAt.replace(/[:.]/g, '-')}.xlsx`;
}

// ---------------------------------------------------------------------------
// results controller
// ---------------------------------------------------------------------------
function renderResults(result) {
  document.getElementById('resultEntity').textContent = result.entityName;
  renderHeroBanner(document.getElementById('heroBanner'), result);
  renderFieldFilterBanner(document.getElementById('fieldFilterBanner'), result);
  renderCoverageCards(document.getElementById('coverageCards'), result);
  renderQualityCards(document.getElementById('qualityCards'), result);
  renderPerformanceCards(document.getElementById('performanceCards'), result);
  renderClientsChart('clientsChart', result.summary);
  renderActionPlanUI(document.getElementById('actionPlanList'), result);
  initDivergenceTable({
    searchInput: document.getElementById('divergenceSearch'),
    typeFilterSelect: document.getElementById('divergenceTypeFilter'),
    tableBody: document.getElementById('divergenceTableBody'),
    pagination: document.getElementById('divergencePagination'),
    divergences: result.divergences,
  });
  document.getElementById('exportDivergences').onclick = () => exportDivergences(result).catch(reportExportError);
  document.getElementById('exportValid').onclick = () => exportValid(result).catch(reportExportError);
  document.getElementById('exportUnmatched').onclick = () => exportUnmatched(result).catch(reportExportError);
  document.getElementById('exportSummary').onclick = () => exportSummary(result).catch(reportExportError);
}

function renderActionPlanUI(container, result) {
  const actions = buildActionPlan(result);
  const badgeLabel = (s) => ({ high: 'Crítico', medium: 'Atenção', low: 'Melhoria', info: 'Info' }[s] || s);
  container.innerHTML = actions.map((a) => `
      <li class="action-item action-item--${a.severity}">
        <span class="action-item__badge">${badgeLabel(a.severity)}</span>
        <div class="action-item__body">
          <strong>${escapeHtml(a.title)}</strong>
          <p>${escapeHtml(a.description)}</p>
        </div>
      </li>`).join('');
}

function reportExportError(err) {
  logger.error('Erro ao exportar planilha:', err);
  alert(`Erro ao gerar o arquivo: ${err.message}`);
}

// ---------------------------------------------------------------------------
// bootstrap / app
// ---------------------------------------------------------------------------
const APP_VIEWS = ['view-upload', 'view-progress', 'view-results'];
function showView(id) {
  for (const v of APP_VIEWS) document.getElementById(v).classList.toggle('is-active', v === id);
}

let activeWorker = null;

function startValidation(payload) {
  showView('view-progress');
  resetProgress();

  // Worker via Blob URL: funciona mesmo com a página aberta via file://,
  // diferente de um Worker apontando para um arquivo .js separado.
  const workerSourceText = document.getElementById('workerSource').textContent;
  const blob = new Blob([workerSourceText], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  activeWorker = new Worker(blobUrl);

  activeWorker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      updateProgress(msg);
    } else if (msg.type === 'done') {
      logger.info('Resultado recebido do worker', msg.result.summary);
      renderResults(msg.result);
      showView('view-results');
      activeWorker.terminate();
      URL.revokeObjectURL(blobUrl);
    } else if (msg.type === 'error') {
      alert(`Erro na validação: ${msg.message}`);
      showView('view-upload');
      activeWorker.terminate();
      URL.revokeObjectURL(blobUrl);
    }
  };

  activeWorker.onerror = (err) => {
    logger.error('Erro fatal no worker', err);
    alert(`Erro inesperado ao processar: ${err.message}`);
    showView('view-upload');
  };

  activeWorker.postMessage(payload);
}

document.getElementById('backToUpload').addEventListener('click', () => showView('view-upload'));

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Promise rejeitada sem tratamento:', event.reason);
  showFatalError(event.reason?.message || String(event.reason), { hint: buildHint() });
});
window.addEventListener('error', (event) => {
  logger.error('Erro não tratado:', event.error || event.message);
  showFatalError(event.error?.message || event.message, { hint: buildHint() });
});

function buildHint() {
  return 'Verifique sua conexão com a internet — este app carrega Chart.js, ExcelJS e as bibliotecas de leitura de Excel/CSV via CDN na primeira vez que são usadas.';
}

try {
  initUploadController({ onStart: startValidation });
} catch (err) {
  logger.error('Falha ao inicializar a tela de upload:', err);
  showFatalError(err.message, { hint: buildHint() });
}
