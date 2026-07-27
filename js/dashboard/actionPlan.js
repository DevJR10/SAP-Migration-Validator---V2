// dashboard/actionPlan.js
// -----------------------------------------------------------------------------
// Gera recomendações objetivas a partir do resultado da validação. Tudo
// determinístico (sem chamada externa), baseado nos próprios números do
// resultado — então funciona para qualquer entidade, não só SAP.
// -----------------------------------------------------------------------------

/**
 * @param {object} result resultado de core/validationEngine.js
 * @returns {{severity:'high'|'medium'|'low'|'info', title:string, description:string}[]}
 */
export function buildActionPlan(result) {
  const { summary, dexPara, topCriticalFields } = result;
  const actions = [];

  if (summary.unmatchedOriginCount > 0) {
    actions.push({
      severity: 'high',
      title: `${fmt(summary.unmatchedOriginCount)} registro(s) de origem sem correspondência no destino`,
      description:
        'Verifique se esses registros realmente deveriam existir no destino (podem não ter sido migrados/carregados ainda) ou se o campo/chave usado para identificar o registro está divergente entre origem e destino.',
    });
  }

  if (summary.unmatchedDestCount > 0) {
    actions.push({
      severity: 'medium',
      title: `${fmt(summary.unmatchedDestCount)} registro(s) no destino sem correspondência na origem`,
      description:
        'Confirme se são registros criados diretamente no destino (esperado) ou se indicam duplicidade/erro de carga. Se inesperados, revisar o processo de migração desses registros.',
    });
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
    actions.push({
      severity: 'low',
      title: 'Revisar completude das regras De/Para',
      description: `${dexPara.percentResolvedByDexPara}% das divergências de valor foram resolvidas automaticamente por regras De/Para. Os campos com erro acima podem precisar de novas entradas nesse mapeamento.`,
    });
  }

  if (actions.length === 0) {
    actions.push({
      severity: 'info',
      title: 'Nenhuma divergência crítica identificada',
      description: `${summary.clientsValid} de ${summary.clientsTotal} clientes (${summary.clientSuccessRate}%) passaram em todas as validações. Recomenda-se uma revisão amostral antes de finalizar a migração.`,
    });
  } else {
    actions.push({
      severity: 'info',
      title: 'Próximo passo sugerido',
      description:
        'Exporte a planilha de divergências e encaminhe para os responsáveis por cada campo/área corrigirem a origem, ajustarem o mapeamento De/Para ou confirmarem que a diferença é esperada.',
    });
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 };
  return actions.sort((a, b) => order[a.severity] - order[b.severity]);
}

function fmt(n) {
  return Number(n).toLocaleString('pt-BR');
}
