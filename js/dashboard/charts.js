// dashboard/charts.js
// -----------------------------------------------------------------------------
// Dashboard simplificado: um único gráfico circular (rosca), mostrando só
// Clientes válidos x Clientes com divergência — cores intuitivas (verde/
// vermelho) e valores sempre visíveis direto na fatia (chartjs-plugin-
// datalabels), sem precisar passar o mouse em cima.
// -----------------------------------------------------------------------------

const palette = {
  ok: '#34C77B',
  error: '#F2545B',
  text: '#8FA3B3',
};

const instances = new Map();

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (instances.has(canvasId)) instances.get(canvasId).destroy();
  const chart = new Chart(canvas, { ...config, plugins: [ChartDataLabels] });
  instances.set(canvasId, chart);
  return chart;
}

/** Único gráfico do dashboard: clientes válidos x clientes com divergência. */
export function renderClientsChart(canvasId, summary) {
  const total = summary.clientsValid + summary.clientsWithError;
  return renderChart(canvasId, {
    type: 'doughnut',
    data: {
      labels: ['Clientes válidos', 'Clientes com divergência'],
      datasets: [
        {
          data: [summary.clientsValid, summary.clientsWithError],
          backgroundColor: [palette.ok, palette.error],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { color: palette.text, font: { family: 'Inter, sans-serif', size: 13 }, padding: 14 } },
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
