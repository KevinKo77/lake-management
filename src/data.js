import {dateEpoch} from './finance.js';
const properties = {name: 'label/en', birthDate: 'P569', country: 'P27', sport: 'P641', atpId: 'P536'};
export function validateSnapshot(data, asOf = new Date().toISOString().slice(0, 10)) {
  const today = dateEpoch(asOf);
  if (!data || data.schemaVersion !== 2 || data.license !== 'CC0-1.0' || data.licenseUrl !== 'https://www.wikidata.org/wiki/Wikidata:Licensing' || !Array.isArray(data.athletes) || !data.athletes.length) throw Error('Invalid snapshot schema or license');
  if (dateEpoch(data.retrievedAt) > today || dateEpoch(data.reviewedAt) > today) throw Error('Snapshot date is in the future');
  const ids = new Set();
  for (const a of data.athletes) {
    if (!/^Q\d+$/.test(a.id) || ids.has(a.id)) throw Error('Invalid or duplicate source identifier');
    ids.add(a.id);
    if (a.sourceUrl !== `https://www.wikidata.org/wiki/${a.id}` || !/^\d+$/.test(a.sourceRevision) || a.revisionUrl !== `https://www.wikidata.org/w/index.php?oldid=${a.sourceRevision}&title=${a.id}`) throw Error('Invalid source provenance');
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 100 || typeof a.country !== 'string' || !a.country.trim() || a.country.length > 100 || a.sport !== 'Tennis' || !/^[A-Z0-9]{4}$/.test(a.atpId)) throw Error('Invalid sporting identity');
    const birth = dateEpoch(a.birthDate);
    const adultDate = new Date(birth); adultDate.setUTCFullYear(adultDate.getUTCFullYear() + 18);
    if (adultDate.getTime() > today || birth < Date.UTC(1900, 0, 1)) throw Error('Adult profile required');
    for (const [field, property] of Object.entries(properties)) if (a.properties?.[field] !== property) throw Error('Missing property mapping');
    for (const field of ['birthDate', 'country', 'sport', 'atpId']) if (!Number.isInteger(a.referenceCounts?.[field]) || a.referenceCounts[field] < 0) throw Error('Missing reference count');
    const rank = a.historicalSinglesRanking;
    if (rank && (!Number.isInteger(rank.rank) || rank.rank < 1 || dateEpoch(rank.asOf) > today || rank.property !== 'P1352' || rank.qualifiers?.pointInTime !== 'P585' || rank.qualifiers?.sport !== 'tennis singles' || rank.sourceUrl !== a.revisionUrl || !Number.isInteger(rank.underlyingReferences) || rank.underlyingReferences < 0)) throw Error('Invalid historical ranking');
  }
  return data;
}
export function auditSnapshot(data, asOf = new Date().toISOString().slice(0, 10)) {
  validateSnapshot(data, asOf);
  const today = dateEpoch(asOf);
  return data.athletes.map(a => ({
    id: a.id, name: a.name, revision: a.sourceRevision, revisionUrl: a.revisionUrl,
    snapshotAgeDays: Math.floor((today - dateEpoch(data.retrievedAt)) / 86400000),
    historicalRankAgeDays: a.historicalSinglesRanking ? Math.floor((today - dateEpoch(a.historicalSinglesRanking.asOf)) / 86400000) : null,
    unreferencedFields: Object.entries(a.referenceCounts).filter(([, count]) => count === 0).map(([field]) => field),
    currentPerformance: 'missing', financialEvidence: 'missing',
  }));
}
export async function verifyDigest(text, expected, subtle = globalThis.crypto?.subtle) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid expected digest');
  if (!subtle) return {verified: false, reason: 'Web Crypto unavailable; integrity not verified'};
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  const actual = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw Error('Snapshot digest differs from manifest');
  return {verified: true, digest: actual};
}

