import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

// Cenário com os 3 tipos de divergência que o filtro precisa distinguir:
// - CEP: De/Para aplicado (dexpara)
// - NAME1: valor realmente diferente (error, não vazio)
// - CITY: vazio no destino (error, vazio)
const originRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'JOAO SILVA', CITY: 'SAO PAULO', CEP: '01000-000' } }];
const destRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'JOAO S.', CITY: '', CEP: '01000000' } }];

const rules = { table: 'GENERIC', fieldMappings: { CEP: { map: { '01000-000': '01000000' } } } };
globalThis.fetch = async () => ({ ok: true, json: async () => rules });

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'GENERIC',
  comparisonType: { useRules: true },
  entityConfig: null,
  fieldFilter: null,
});

const byField = Object.fromEntries(result.divergences.map((d) => [d.field, d]));

assert.strictEqual(byField.CEP.status, 'dexpara');
assert.strictEqual(byField.CEP.isEmpty, false, 'CEP não está vazio, só convertido via De/Para');

assert.strictEqual(byField.NAME1.status, 'error');
assert.strictEqual(byField.NAME1.isEmpty, false, 'NAME1 é uma diferença de valor real, não campo vazio');

assert.strictEqual(byField.CITY.status, 'error');
assert.strictEqual(byField.CITY.isEmpty, true, 'CITY está vazio no destino -> deve cair no filtro "apenas campos vazios"');

console.log('✅ Classificação de divergências (De/Para, diferença de valor, campo vazio) está correta para o novo filtro do relatório.');
