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
 * Finds top-N candidate activities using the Render IPT AI Model.
 * Resolves activity_id against local MySQL activities table by WBS code or Description.
 * Falls back to local MySQL string similarity if Render service is unavailable.
 */
async function findCandidates(extractedDescription, discipline, topN = 3, projectId = null) {
  const modelUrl = process.env.IPT_MODEL_URL;
  const apiKey = process.env.IPT_API_KEY;

  // 1. Attempt to query Render-deployed IPT AI Model
  if (modelUrl) {
    try {
      const response = await fetch(`${modelUrl.replace(/\/$/, '')}/api/v1/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          query_text: extractedDescription,
          project_id: projectId || undefined,
          top_k: topN
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const candidates = [];

          // Parse top match from model
          if (result.data.top_match) {
            const tm = result.data.top_match;

            // Resolve activity_id from local MySQL activities table
            let dbActivityId = tm.activity_id || tm.Activity_ID;
            try {
              const [dbAct] = await db.query(
                `SELECT id FROM activities WHERE (wbs_code IS NOT NULL AND wbs_code = ?) OR (description IS NOT NULL AND LOWER(description) = LOWER(?)) LIMIT 1`,
                [tm.wbs_code || '', tm.activity_name || '']
              );
              if (dbAct && dbAct.length > 0) {
                dbActivityId = dbAct[0].id;
              }
            } catch (err) {
              console.warn('[DB Lookup Warning]', err.message);
            }

            candidates.push({
              activity_id: dbActivityId,
              wbs_code: tm.wbs_code || tm.WBS_Code || '',
              description: tm.activity_name || tm.Activity_Name || '',
              score: parseFloat(tm['AI Confidence Score'] || tm.score || 0.9),
              schedule_status: tm['Schedule Status'],
              delay_duration: tm['Delay/Early Duration'],
              completion_percentage: tm['Activity Completion Percentage']
            });
          }

          // Parse additional candidate matches
          if (Array.isArray(result.data.candidates)) {
            for (const c of result.data.candidates) {
              let actId = c.activity_id || c.Activity_ID;
              if (!candidates.some(existing => existing.activity_id === actId)) {
                try {
                  const [dbAct] = await db.query(
                    `SELECT id FROM activities WHERE (wbs_code IS NOT NULL AND wbs_code = ?) OR (description IS NOT NULL AND LOWER(description) = LOWER(?)) LIMIT 1`,
                    [c.wbs_code || '', c.activity_name || c.description || '']
                  );
                  if (dbAct && dbAct.length > 0) {
                    actId = dbAct[0].id;
                  }
                } catch (err) {
                  // ignore lookup error
                }

                candidates.push({
                  activity_id: actId,
                  wbs_code: c.wbs_code || c.WBS_Code || '',
                  description: c.activity_name || c.Activity_Name || c.description || '',
                  score: parseFloat(c['AI Confidence Score'] || c.score || 0.75),
                  schedule_status: c['Schedule Status'],
                  delay_duration: c['Delay/Early Duration'],
                  completion_percentage: c['Activity Completion Percentage']
                });
              }
            }
          }

          if (candidates.length > 0) {
            return candidates.slice(0, topN);
          }
        }
      }
    } catch (err) {
      console.warn(`[IPT Model Warning] Render model request failed (${err.message}). Falling back to local matcher.`);
    }
  }

  // 2. Fallback: Query local MySQL DB if Render API is unreachable
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

// Example helper for batch matching multiple reports at once
async function batchMatchWithModel(items, apiKey = '') {
  const modelUrl = process.env.IPT_MODEL_URL;
  if (!modelUrl) return null;

  const response = await fetch(`${modelUrl.replace(/\/$/, '')}/api/v1/batch-match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      items: items.map(text => ({ query_text: text, top_k: 3 }))
    })
  });

  if (response.ok) {
    return await response.json();
  }
  return null;
}

const THRESHOLDS = { AUTO: 0.75, FLAG_NEW: 0.35 };

module.exports = { findCandidates, THRESHOLDS, normalize, batchMatchWithModel };
