const stringSimilarity = require('string-similarity');
const db = require('../config/db');

const SYNONYMS = {
  spool: 'line',
  laid: 'laying',
  termination: 'termination',
  poured: 'pour',
  cast: 'pour',
  megger: 'testing',
};

function normalize(text) {
  let t = (text || '').toLowerCase();
  Object.entries(SYNONYMS).forEach(([field, plan]) => {
    t = t.replace(new RegExp(`\\b${field}\\b`, 'g'), plan);
  });
  return t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Finds top-N candidate activities from MySQL database
 */
async function findCandidates(extractedDescription, discipline, topN = 3) {
  const [pool] = await db.query(
    `SELECT id, wbs_code, description FROM activities WHERE LOWER(discipline) = LOWER(?) AND level >= 5`,
    [discipline]
  );

  if (!pool.length) return [];

  const target = normalize(extractedDescription);
  const scored = pool.map(a => ({
    activity_id: a.id,
    wbs_code: a.wbs_code,
    description: a.description,
    score: stringSimilarity.compareTwoStrings(target, normalize(a.description)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

const THRESHOLDS = { AUTO: 0.75, FLAG_NEW: 0.35 };

module.exports = { findCandidates, THRESHOLDS, normalize };
