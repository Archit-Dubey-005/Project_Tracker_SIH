/**
 * In a production build this function is a single LLM call with a structured-output
 * (JSON schema) prompt: "Extract {activity_description, event_type, date, discipline}
 * from this field report." We stub that here with light heuristics so the
 * ingestion -> matching -> review pipeline can be demoed without an external API key.
 * Swapping this module for a real Anthropic API call does not change any downstream
 * contract (extracted_events schema stays identical).
 */

const START_WORDS = ['start', 'started', 'begin', 'began', 'commenced', 'erect', 'erected'];
const END_WORDS = ['end', 'ended', 'complete', 'completed', 'finished', 'done', 'closed out'];

function guessEventType(text) {
  const t = text.toLowerCase();
  if (END_WORDS.some(w => t.includes(w))) return 'end';
  if (START_WORDS.some(w => t.includes(w))) return 'start';
  return 'progress';
}

function guessDate(text, fallback) {
  if (!text && fallback) text = String(fallback);
  if (!text) return new Date().toISOString().slice(0, 10);
  const str = String(text).trim();
  const iso = str.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const mdy = str.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (mdy) {
    const p1 = mdy[1].padStart(2, '0');
    const p2 = mdy[2].padStart(2, '0');
    const p3 = mdy[3];
    // if first part > 12, assume DD/MM/YYYY
    if (parseInt(p1, 10) > 12) return `${p3}-${p2}-${p1}`;
    return `${p3}-${p1}-${p2}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return fallback ? guessDate(String(fallback)) : new Date().toISOString().slice(0, 10);
}

/**
 * Extracts one or more structured events from a free-text field report.
 * Splits on sentence boundaries / line breaks so one report can log multiple activities.
 */
function extractFromText(rawText, { discipline, reportDate } = {}) {
  const segments = rawText
    .split(/\n|(?<=[.;])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 4);

  return segments.map(seg => ({
    activity_description: seg.replace(/\s+/g, ' ').trim(),
    event_type: guessEventType(seg),
    extracted_date: guessDate(seg, reportDate),
    extraction_confidence: 0.75, // stub: heuristic extraction is inherently less confident than LLM
  }));
}

/**
 * Extracts events from a parsed spreadsheet row. Assumes caller has already
 * mapped columns to these canonical keys (activity/date/status/remarks).
 */
function extractFromRow(row, { discipline } = {}) {
  const desc = row.activity || row.task || row.description || '';
  const remarks = row.remarks || row.status || '';
  const combined = `${desc} ${remarks}`.trim();
  return {
    activity_description: desc || combined,
    event_type: guessEventType(combined),
    extracted_date: guessDate(String(row.date || ''), row.date),
    extraction_confidence: desc ? 0.9 : 0.6, // higher confidence: structured column vs free text
  };
}

module.exports = { extractFromText, extractFromRow };
