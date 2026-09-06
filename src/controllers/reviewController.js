const { randomUUID: uuid } = require('crypto');
const db = require('../config/db');

function parseCandidates(jsonVal) {
  if (!jsonVal) return [];
  if (typeof jsonVal === 'object') return jsonVal;
  try { return JSON.parse(jsonVal); } catch { return []; }
}

async function listQueue(req, res, next) {
  const { status, batch_id, discipline, sort } = req.query;
  let query = `
    SELECT m.id as match_id, m.activity_id, m.status, m.similarity_score, m.candidates_json,
           ee.activity_description, ee.event_type, ee.extracted_date, ee.extraction_confidence,
           re.raw_text, re.source_type, re.discipline, re.submitted_by, re.batch_id, re.file_name, re.created_at as submitted_at,
           u.name as submitted_by_name,
           a.wbs_code as matched_wbs_code, a.description as matched_wbs_description
    FROM matches m
    JOIN extracted_events ee ON ee.id = m.extracted_event_id
    JOIN raw_entries re ON re.id = ee.raw_entry_id
    LEFT JOIN users u ON u.id = re.submitted_by
    LEFT JOIN activities a ON a.id = m.activity_id
    WHERE 1=1`;
  const params = [];

  if (req.user.role === 'supervisor' && req.user.discipline) {
    query += ' AND re.discipline = ?';
    params.push(req.user.discipline);
  } else if (discipline) {
    query += ' AND re.discipline = ?';
    params.push(discipline);
  }

  if (status) { query += ' AND m.status = ?'; params.push(status); }
  if (batch_id) { query += ' AND re.batch_id = ?'; params.push(batch_id); }

  if (sort === 'high_first') {
    query += ' ORDER BY ee.extraction_confidence DESC, m.similarity_score DESC, re.created_at DESC';
  } else {
    // Default low to high confidence score as requested!
    query += ' ORDER BY ee.extraction_confidence ASC, m.similarity_score ASC, re.created_at DESC';
  }

  try {
    const [rows] = await db.query(query, params);
    const result = rows.map(r => ({ ...r, candidates: parseCandidates(r.candidates_json) }));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getDetail(req, res, next) {
  try {
    const [rows] = await db.query(`
      SELECT m.*, ee.activity_description, ee.event_type, ee.extracted_date, ee.extraction_confidence,
             re.raw_text, re.source_type, re.discipline, re.file_name, re.report_date, re.submitted_by,
             u.name as submitted_by_name
      FROM matches m
      JOIN extracted_events ee ON ee.id = m.extracted_event_id
      JOIN raw_entries re ON re.id = ee.raw_entry_id
      LEFT JOIN users u ON u.id = re.submitted_by
      WHERE m.id = ?`, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const row = rows[0];

    const [auditTrail] = await db.query('SELECT * FROM audit_log WHERE match_id = ? ORDER BY created_at', [row.id]);
    res.json({ ...row, candidates: parseCandidates(row.candidates_json), audit_trail: auditTrail });
  } catch (err) {
    next(err);
  }
}

async function logAudit(conn, matchId, activityId, action, actor, details) {
  const queryFunc = conn ? conn.query.bind(conn) : db.query.bind(db);
  await queryFunc(
    `INSERT INTO audit_log (id, match_id, activity_id, action, actor, details) VALUES (?,?,?,?,?,?)`,
    [uuid(), matchId, activityId, action, actor, details]
  );
}

async function accept(req, res, next) {
  try {
    const [matches] = await db.query('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!matches.length) return res.status(404).json({ error: 'Not found' });
    const match = matches[0];
    if (!match.activity_id) return res.status(400).json({ error: 'No activity linked — reassign or flag as new instead' });

    const [events] = await db.query('SELECT * FROM extracted_events WHERE id = ?', [match.extracted_event_id]);
    const [activities] = await db.query('SELECT * FROM activities WHERE id = ?', [match.activity_id]);
    if (!activities.length) return res.status(404).json({ error: 'Linked activity not found' });

    const event = events[0];
    const activity = activities[0];

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE matches SET status='confirmed', reviewed_by=?, reviewed_at=NOW() WHERE id=?`,
        [req.user.id, match.id]
      );

      let nextStatus = activity.status;
      let actualStart = activity.actual_start;
      let actualEnd = activity.actual_end;

      if (event.event_type === 'end') {
        actualEnd = event.extracted_date;
        nextStatus = 'completed';
        if (!actualStart) actualStart = event.extracted_date;
      } else {
        if (!actualStart) actualStart = event.extracted_date;
        if (nextStatus !== 'completed') nextStatus = 'in_progress';
      }

      await connection.query(
        `UPDATE activities SET actual_start = ?, actual_end = ?, status = ? WHERE id = ?`,
        [actualStart, actualEnd, nextStatus, activity.id]
      );

      const logField = event.event_type === 'end' ? 'actual_end' : 'actual_start';
      await logAudit(connection, match.id, activity.id, 'confirmed', req.user.id, `Confirmed by ${req.user.name}; ${logField}=${event.extracted_date}`);
      await logAudit(connection, match.id, activity.id, 'schedule_updated', req.user.id, `Schedule updated: status=${nextStatus}, actual_start=${actualStart}, actual_end=${actualEnd}`);

      await connection.commit();
      res.json({ ok: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    next(err);
  }
}

async function reassign(req, res, next) {
  const { activity_id } = req.body;
  if (!activity_id) return res.status(400).json({ error: 'activity_id is required' });

  try {
    const [matches] = await db.query('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!matches.length) return res.status(404).json({ error: 'Not found' });
    const match = matches[0];

    await db.query(`UPDATE matches SET activity_id = ?, status = 'pending' WHERE id = ?`, [activity_id, match.id]);
    await logAudit(null, match.id, activity_id, 'reassigned', req.user.id, `Reassigned by ${req.user.name}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const [matches] = await db.query('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!matches.length) return res.status(404).json({ error: 'Not found' });
    const match = matches[0];

    await db.query(`UPDATE matches SET status='rejected', reviewed_by=?, reviewed_at=NOW() WHERE id=?`, [req.user.id, match.id]);
    await logAudit(null, match.id, match.activity_id, 'rejected', req.user.id, `Rejected by ${req.user.name}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function flagNew(req, res, next) {
  try {
    const [matches] = await db.query('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!matches.length) return res.status(404).json({ error: 'Not found' });
    const match = matches[0];

    await db.query(`UPDATE matches SET status='flagged_new', reviewed_by=?, reviewed_at=NOW() WHERE id=?`, [req.user.id, match.id]);
    await logAudit(null, match.id, match.activity_id, 'flagged_new', req.user.id, `Marked as new/unplanned activity by ${req.user.name}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listQueue, getDetail, accept, reassign, reject, flagNew };
