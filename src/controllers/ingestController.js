const { randomUUID: uuid } = require('crypto');
const XLSX = require('xlsx');
const db = require('../config/db');
const { extractFromRow } = require('../services/extractionService');
const { findCandidates, THRESHOLDS } = require('../services/matchingService');

async function uploadSpreadsheet(req, res, next) {
  if (!req.file) return res.status(400).json({ error: 'file is required (field name: file)' });
  const { discipline, report_date } = req.body;
  const effectiveDiscipline = (req.user.role === 'supervisor' && req.user.discipline)
    ? req.user.discipline
    : (discipline || req.user.discipline || 'civil');

  let mapping = {};
  try { mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {}; }
  catch { return res.status(400).json({ error: 'mapping must be valid JSON' }); }

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (rows.length === 0) return res.status(400).json({ error: 'No rows found in sheet' });

  const batchId = uuid();
  const results = [];
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    for (const rawRow of rows) {
      const normRow = {};
      Object.entries(rawRow).forEach(([k, v]) => {
        normRow[k.trim().toLowerCase()] = v;
      });

      const mapped = {};
      Object.entries(mapping).forEach(([sheetCol, canonicalKey]) => {
        const val = rawRow[sheetCol] !== undefined ? rawRow[sheetCol] : normRow[sheetCol.toLowerCase()];
        if (val !== undefined) mapped[canonicalKey] = val;
      });

      if (!mapped.activity) {
        mapped.activity = normRow.activity || normRow.task || normRow.description || normRow['task desc'] || normRow['task description'] || normRow['activity description'];
      }
      if (!mapped.date) {
        mapped.date = normRow.date || normRow.finish || normRow['finish date'] || normRow.start || normRow['start date'];
      }
      if (!mapped.remarks) {
        mapped.remarks = normRow.remarks || normRow.status || normRow.notes || normRow.comments;
      }

      if (!mapped.activity || !String(mapped.activity).trim()) continue;

      const rawEntryId = uuid();
      await connection.query(
        `INSERT INTO raw_entries (id, batch_id, source_type, raw_text, file_name, discipline, submitted_by, report_date)
         VALUES (?, ?, 'spreadsheet', ?, ?, ?, ?, ?)`,
        [rawEntryId, batchId, JSON.stringify(rawRow), req.file.originalname, effectiveDiscipline, req.user.id, report_date || null]
      );

      const ev = extractFromRow(mapped, { discipline: effectiveDiscipline });

      const eventId = uuid();
      await connection.query(
        `INSERT INTO extracted_events (id, raw_entry_id, activity_description, event_type, extracted_date, extraction_confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, rawEntryId, ev.activity_description, ev.event_type, ev.extracted_date, ev.extraction_confidence]
      );

      const candidates = await findCandidates(ev.activity_description, effectiveDiscipline);
      const best = candidates[0];
      const status = !best ? 'flagged_new' : best.score < THRESHOLDS.FLAG_NEW ? 'flagged_new' : 'pending';

      const matchId = uuid();
      await connection.query(
        `INSERT INTO matches (id, extracted_event_id, activity_id, candidates_json, similarity_score, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [matchId, eventId, best ? best.activity_id : null, JSON.stringify(candidates), best ? best.score : 0, status]
      );

      await connection.query(
        `INSERT INTO audit_log (id, match_id, activity_id, action, actor, details) VALUES (?, ?, ?, 'created', ?, ?)`,
        [uuid(), matchId, best ? best.activity_id : null, req.user.id, `Ingested from ${req.file.originalname} (batch ${batchId})`]
      );

      results.push({ match_id: matchId, event: ev, candidates, status });
    }

    await connection.commit();
    res.status(201).json({ batch_id: batchId, rows_parsed: rows.length, events_created: results.length, results });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
}

module.exports = { uploadSpreadsheet };
