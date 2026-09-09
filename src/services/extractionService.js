/**
 * Extraction service module
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
    if (parseInt(p1, 10) > 12) return `${p3}-${p2}-${p1}`;
    return `${p3}-${p1}-${p2}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return fallback ? guessDate(String(fallback)) : new Date().toISOString().slice(0, 10);
}

/**
 * Extracts one or more structured events from a free-text field report.
 */
function extractFromText(rawText, { discipline, reportDate } = {}) {
  const segments = (rawText || '')
    .split(/\n|(?<=[.;])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 4);

  return segments.map(seg => {
    let confidence = 0.72;
    if (seg.length > 25) confidence += 0.10;
    if (/\b(block|zone|floor|unit|line|pipe|rcc|pcc|rebar|foundation|slab|column|beam|wall)\b/i.test(seg)) {
      confidence += 0.10;
    }
    if (/\b(completed|started|finished|done|poured|erected|laid)\b/i.test(seg)) {
      confidence += 0.05;
    }
    confidence = Math.min(0.95, Math.max(0.60, confidence));

    return {
      activity_description: seg.replace(/\s+/g, ' ').trim(),
      event_type: guessEventType(seg),
      extracted_date: guessDate(seg, reportDate),
      extraction_confidence: parseFloat(confidence.toFixed(2)),
    };
  });
}

/**
 * Extracts events from a parsed spreadsheet row.
 */
function extractFromRow(row, { discipline } = {}) {
  const desc = row.activity || row.task || row.description || '';
  const remarks = row.remarks || row.status || '';
  const combined = `${desc} ${remarks}`.trim();
  return {
    activity_description: desc || combined,
    event_type: guessEventType(combined),
    extracted_date: guessDate(String(row.date || ''), row.date),
    extraction_confidence: desc ? 0.92 : 0.65,
  };
}

// MAKE SURE THIS EXPORT LINE IS PRESENT AT THE BOTTOM OF THE FILE
module.exports = { extractFromText, extractFromRow };

