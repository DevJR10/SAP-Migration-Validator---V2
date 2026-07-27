// core/matchingEngine.js
// -----------------------------------------------------------------------------
// Resolve o problema conhecido do V1: comparação de tabelas com múltiplos
// registros por identificador (ex.: KNVV — um Business Partner com vários
// registros de organização de vendas/canal/setor).
//
// V1 comparava por POSIÇÃO da linha na tabela HTML → falso positivo sempre que
// havia mais de um registro por cliente.
//
// V2 nunca compara por posição. A estratégia é:
//   1) Indexar por ID (Map<id, Record[]>)      → O(1), nunca varre o arquivo inteiro
//   2) Para cada ID, agrupar registros de origem e destino
//   3) Rodar um matching (1:1 / 1:N / N:1 / N:N) usando a CHAVE COMPOSTA
//      configurável (config/entities.json), respeitando que um código da
//      chave composta pode ele mesmo ter sido convertido via De/Para
//      (ex.: VKORG "3000" → "BR10")
//   4) Cada registro só pode ser usado em UMA correspondência
//   5) Só é divergência quando não existe NENHUMA combinação válida
// -----------------------------------------------------------------------------

import { normalizeValue } from './normalization.js';
import { resolveMapping, acceptableTargets } from './ruleEngine.js';

const SEP = '\u241F'; // separador de unidade — não aparece em dados reais

/**
 * Indexa registros por identificador em O(n). Nunca faz busca linear.
 * @param {{id: string, fields: object}[]} records
 * @returns {Map<string, object[]>}
 */
export function indexById(records) {
  const map = new Map();
  for (const record of records) {
    const id = normalizeValue(record.id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(record);
  }
  return map;
}

/**
 * Faz o matching entre dois grupos de registros que pertencem ao MESMO identificador.
 * Suporta 1:1, 1:N, N:1 e N:N.
 *
 * @param {object[]} originGroup
 * @param {object[]} destGroup
 * @param {{ keyFields?: string[], rules?: object|null }} options
 * @returns {{ pairs: {origin:object, dest:object}[], unmatchedOrigin: object[], unmatchedDest: object[] }}
 */
export function matchGroups(originGroup, destGroup, { keyFields, rules } = {}) {
  // Pool de destino com controle de "já usado" — cada registro serve para 1 correspondência
  const destPool = destGroup.map((record) => ({ record, used: false }));

  if (keyFields && keyFields.length) {
    return matchByCompositeKey(originGroup, destPool, keyFields, rules);
  }
  return matchGeneric(originGroup, destPool, rules);
}

// ---------------------------------------------------------------------------
// Estratégia com chave composta configurada (ex.: KNVV: KUNNR+VKORG+VTWEG+SPART)
// ---------------------------------------------------------------------------
function matchByCompositeKey(originGroup, destPool, keyFields, rules) {
  const destIndex = new Map();
  destPool.forEach((entry) => {
    const sig = buildSignature(entry.record, keyFields);
    if (!destIndex.has(sig)) destIndex.set(sig, []);
    destIndex.get(sig).push(entry);
  });

  const pairs = [];
  const unmatchedOrigin = [];

  for (const origin of originGroup) {
    const literalSig = buildSignature(origin, keyFields);

    // Gera assinaturas alternativas considerando De/Para em CADA campo da chave
    // (ex.: VKORG "3000" pode virar "BR10" no destino)
    const alternativesPerField = keyFields.map((field) => {
      const norm = normalizeValue(origin.fields[field]);
      const mapping = resolveMapping(rules, field);
      const targets = acceptableTargets(mapping, norm);
      return targets ? uniq([norm, ...targets.map((t) => t ?? '')]) : [norm];
    });

    const candidateSignatures = uniq([literalSig, ...cartesianJoin(alternativesPerField)]);

    let matchedEntry = null;
    for (const sig of candidateSignatures) {
      const bucket = destIndex.get(sig);
      if (!bucket) continue;
      matchedEntry = bucket.find((e) => !e.used);
      if (matchedEntry) break;
    }

    if (matchedEntry) {
      matchedEntry.used = true;
      pairs.push({ origin, dest: matchedEntry.record });
    } else {
      unmatchedOrigin.push(origin);
    }
  }

  const unmatchedDest = destPool.filter((e) => !e.used).map((e) => e.record);
  return { pairs, unmatchedOrigin, unmatchedDest };
}

// ---------------------------------------------------------------------------
// Estratégia genérica (entidade sem chave composta configurada): matching
// guloso maximizando a quantidade de campos coincidentes. Ainda O(n*m) dentro
// do grupo do mesmo ID (grupos costumam ser pequenos — poucos registros por
// cliente), nunca O(n*m) no dataset inteiro.
// ---------------------------------------------------------------------------
function matchGeneric(originGroup, destPool, rules) {
  const pairs = [];
  const unmatchedOrigin = [];

  for (const origin of originGroup) {
    let best = null;
    let bestScore = -1;

    for (const entry of destPool) {
      if (entry.used) continue;
      const score = scoreFieldAgreement(origin, entry.record, rules);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    if (best && bestScore > 0) {
      best.used = true;
      pairs.push({ origin, dest: best.record });
    } else {
      unmatchedOrigin.push(origin);
    }
  }

  const unmatchedDest = destPool.filter((e) => !e.used).map((e) => e.record);
  return { pairs, unmatchedOrigin, unmatchedDest };
}

function scoreFieldAgreement(origin, dest, rules) {
  const fields = new Set([...Object.keys(origin.fields), ...Object.keys(dest.fields)]);
  let score = 0;
  for (const field of fields) {
    const a = normalizeValue(origin.fields[field]);
    const b = normalizeValue(dest.fields[field]);
    if (a === b) {
      score++;
      continue;
    }
    const targets = acceptableTargets(resolveMapping(rules, field), a);
    if (targets && targets.includes(b)) score++;
  }
  return score;
}

function buildSignature(record, keyFields) {
  return keyFields.map((f) => normalizeValue(record.fields[f])).join(SEP);
}

function cartesianJoin(arrays) {
  return arrays.reduce((acc, curr) => acc.flatMap((a) => curr.map((c) => (a ? `${a}${SEP}${c}` : c))), ['']);
}

function uniq(arr) {
  return [...new Set(arr)];
}
