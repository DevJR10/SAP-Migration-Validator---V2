// ui/resultsController.js
// -----------------------------------------------------------------------------
// Tela 3: dashboard. Recebe o resultado JÁ PRONTO do Worker — nenhuma
// comparação acontece aqui, só renderização.
// -----------------------------------------------------------------------------

import { renderHeroBanner, renderFieldFilterBanner, renderCoverageCards, renderQualityCards, renderPerformanceCards } from '../dashboard/cards.js';
import { renderClientsChart } from '../dashboard/charts.js';
import { initDivergenceTable } from '../dashboard/divergenceTable.js';
import { buildActionPlan } from '../dashboard/actionPlan.js';
import { exportDivergences, exportValid, exportUnmatched, exportSummary } from '../exporters/excelExporter.js';

export function renderResults(result) {
  document.getElementById('resultEntity').textContent = result.entityName;

  renderHeroBanner(document.getElementById('heroBanner'), result);
  renderFieldFilterBanner(document.getElementById('fieldFilterBanner'), result);

  renderCoverageCards(document.getElementById('coverageCards'), result);
  renderQualityCards(document.getElementById('qualityCards'), result);
  renderPerformanceCards(document.getElementById('performanceCards'), result);

  renderClientsChart('clientsChart', result.summary);

  renderActionPlan(document.getElementById('actionPlanList'), result);

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

function reportExportError(err) {
  console.error('[Validador] Erro ao exportar planilha:', err);
  alert(`Erro ao gerar o arquivo: ${err.message}`);
}

function renderActionPlan(container, result) {
  const actions = buildActionPlan(result);
  container.innerHTML = actions
    .map(
      (a) => `
      <li class="action-item action-item--${a.severity}">
        <span class="action-item__badge">${badgeLabel(a.severity)}</span>
        <div class="action-item__body">
          <strong>${escapeHtml(a.title)}</strong>
          <p>${escapeHtml(a.description)}</p>
        </div>
      </li>`
    )
    .join('');
}

function badgeLabel(severity) {
  return { high: 'Crítico', medium: 'Atenção', low: 'Melhoria', info: 'Info' }[severity] || severity;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
