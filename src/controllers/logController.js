const { v4: uuid } = require('uuid');
const db = require('../config/db');
const { extractFromText } = require('../services/extractionService');
const { findCandidates, THRESHOLDS } = require('../services/matchingService');

async function submitLog(req, res, next) {
  const { text, discipline, report_date } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const effectiveDiscipline = (req.user.role === 'supervisor' && req.user.discipline)
    ? req.user.discipline
    : (discipline || req.user.discipline || 'civil');
  const rawEntryId = uuid();
  const results = [];
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO raw_entries (id, batch_id, source_type, raw_text, discipline, submitted_by, report_date)
       VALUES (?, NULL, 'text', ?, ?, ?, ?)`,
      [rawEntryId, text, effectiveDiscipline, req.user.id, report_date || null]
    );

    const events = extractFromText(text, { discipline: effectiveDiscipline, reportDate: report_date });

    for (const ev of events) {
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
        [uuid(), matchId, best ? best.activity_id : null, req.user.id, `Logged via /log by ${req.user.name}`]
      );

      results.push({
        match_id: matchId,
        event: ev,
        candidates,
        status,
        auto_confident: best ? best.score >= THRESHOLDS.AUTO : false,
      });
    }

    await connection.commit();
    res.status(201).json({ raw_entry_id: rawEntryId, results });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
}

module.exports = { submitLog };
