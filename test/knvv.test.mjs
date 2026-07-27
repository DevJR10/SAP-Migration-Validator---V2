import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

// Simula exatamente o bug relatado no toDo.txt do V1:
// mesmo cliente (KUNNR 10001) com múltiplos registros KNVV (setores/organizações
// de vendas diferentes), e VKORG sofrendo conversão De/Para (3000 -> BR10).

const originRecords = [
  { id: '10001', fields: { KUNNR: '10001', VKORG: '3000', VTWEG: '10', SPART: '00' } },
  { id: '10001', fields: { KUNNR: '10001', VKORG: '3700', VTWEG: '10', SPART: '00' } },
  { id: '10002', fields: { KUNNR: '10002', VKORG: '3000', VTWEG: '10', SPART: '00' } },
];

const destRecords = [
  { id: '10001', fields: { KUNNR: '10001', VKORG: 'BR10', VTWEG: '10', SPART: '00' } }, // veio do 3000
  { id: '10001', fields: { KUNNR: '10001', VKORG: 'BR10', VTWEG: '10', SPART: '00' } }, // veio do 3700 (mesmo VKORG destino!)
  { id: '10002', fields: { KUNNR: '10002', VKORG: 'XX99', VTWEG: '10', SPART: '00' } }, // sem correspondência real
];

const rules = {
  table: 'KNVV',
  fieldMappings: {
    VKORG: { eccField: 'VKORG', s4Field: 'VKORG', map: { '3000': 'BR10', '3700': 'BR10' } },
  },
};

// stub de fetch usado pelo ruleEngine (loadRules faz fetch(`${base}/${entity}.json`))
globalThis.fetch = async () => ({ ok: true, json: async () => rules });

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'KNVV',
  comparisonType: { useRules: true },
  entityConfig: { primaryKey: ['KUNNR', 'VKORG', 'VTWEG', 'SPART'] },
});

console.log('--- Resumo ---');
console.log(result.summary);
console.log('--- Divergências ---');
console.log(result.divergences);

// Os DOIS registros do cliente 10001 devem casar (1:N -> N:N resolvido), cada um usado uma vez.
assert.strictEqual(result.summary.comparedPairs, 2, 'deveria casar os 2 registros do cliente 10001 (bug do V1 corrigido)');

// O registro do cliente 10002 não deveria casar (VKORG 3000 não mapeia para XX99)
assert.strictEqual(result.summary.unmatchedOriginCount, 1, 'cliente 10002 origem deveria ficar sem correspondência');
assert.strictEqual(result.summary.unmatchedDestCount, 1, 'cliente 10002 destino deveria ficar sem correspondência');

// Nenhuma divergência de erro para os pares do cliente 10001 (a diferença de VKORG é DexPara, não erro)
const errorsFor10001 = result.divergences.filter((d) => d.id === '10001' && d.status === 'error');
assert.strictEqual(errorsFor10001.length, 0, 'não deveria haver falso positivo de erro para o cliente 10001');

const dexParaFor10001 = result.divergences.filter((d) => d.id === '10001' && d.status === 'dexpara');
assert.strictEqual(dexParaFor10001.length, 2, 'os 2 registros do cliente 10001 devem reportar VKORG como DexPara');

console.log('\n✅ Todos os asserts passaram — bug de N:N do KNVV está corrigido.');
