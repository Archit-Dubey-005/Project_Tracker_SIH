const { randomUUID: uuid } = require('crypto');
const XLSX = require('xlsx');
const db = require('../config/db');
const scheduleImportService = require('../services/scheduleImportService');

async function listActivities(req, res, next) {
  const { discipline, project_id } = req.query;
  const effectiveProjectId = project_id || (req.user && req.user.role === 'supervisor' ? req.user.project_id : null);
  try {
    let query = 'SELECT * FROM activities WHERE 1=1';
    const params = [];
    if (effectiveProjectId) {
      query += ' AND (UPPER(project_id) = UPPER(?) OR (project_id IS NULL AND UPPER(wbs_code) LIKE CONCAT(?, "%")))';
      params.push(effectiveProjectId, effectiveProjectId);
    }
    if (discipline) {
      query += ' AND (LOWER(discipline) = LOWER(?) OR level < 3)';
      params.push(discipline);
    }
    query += ' ORDER BY wbs_code';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getActivity(req, res, next) {
  try {
    const [activities] = await db.query('SELECT * FROM activities WHERE id = ?', [req.params.id]);
    if (!activities.length) return res.status(404).json({ error: 'Not found' });
    const activity = activities[0];

    const [linkedEvents] = await db.query(`
      SELECT m.id as match_id, m.status, m.similarity_score, ee.activity_description, ee.event_type,
             ee.extracted_date, re.source_type, re.submitted_by, u.name as submitted_by_name, m.created_at
      FROM matches m
      JOIN extracted_events ee ON ee.id = m.extracted_event_id
      JOIN raw_entries re ON re.id = ee.raw_entry_id
      LEFT JOIN users u ON u.id = re.submitted_by
      WHERE m.activity_id = ?
      ORDER BY m.created_at`, [activity.id]);

    const [auditTrail] = await db.query('SELECT * FROM audit_log WHERE activity_id = ? ORDER BY created_at', [activity.id]);

    res.json({ ...activity, linked_events: linkedEvents, audit_trail: auditTrail });
  } catch (err) {
    next(err);
  }
}

async function downloadTemplate(req, res) {
  const csvContent = `id,wbs_code,level,parent_id,discipline,description,planned_start,planned_end,project_id
proj-p1,P1,1,,project,Refinery Debottlenecking Master Schedule,2026-01-01,2026-12-31,P1
area-civil,P1.CIV,3,proj-p1,civil,Civil - Main Civil & Substructure Foundations,2026-01-15,2026-04-30,P1
act-civ-001,P1.CIV.001,5,area-civil,civil,Excavation for Foundation F-12,2026-01-20,2026-01-25,P1
act-civ-002,P1.CIV.002,5,area-civil,civil,Rebar Fixing Foundation F-12,2026-01-26,2026-01-30,P1
act-civ-003,P1.CIV.003,5,area-civil,civil,Concrete Pour Foundation F-12,2026-02-01,2026-02-03,P1
area-piping,P1.PIP,3,proj-p1,piping,Piping - Unit 24 Process Lines & Headers,2026-02-01,2026-06-30,P1
act-pip-001,P1.PIP.001,5,area-piping,piping,Erect Line 24"-XX Header Spools,2026-03-10,2026-03-14,P1
act-pip-002,P1.PIP.002,5,area-piping,piping,Weld Line 24"-XX Joints 3 to 7,2026-03-15,2026-03-18,P1
act-pip-003,P1.PIP.003,5,area-piping,piping,Hydro Test Line 24"-XX,2026-03-19,2026-03-21,P1
area-elec,P1.ELE,3,proj-p1,electrical,Electrical - Substation 3 Cabling & Panels,2026-03-01,2026-07-31,P1
act-ele-001,P1.ELE.001,5,area-elec,electrical,Cable Laying Substation 3 Panel A,2026-04-01,2026-04-05,P1
act-ele-002,P1.ELE.002,5,area-elec,electrical,Cable Termination Substation 3 Panel A,2026-04-06,2026-04-08,P1
act-ele-003,P1.ELE.003,5,area-elec,electrical,Megger Testing Substation 3 Panel A,2026-04-09,2026-04-10,P1`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="master_schedule_template.csv"');
  res.send(csvContent);
}

async function importBaseline(req, res, next) {
  if (!req.file) return res.status(400).json({ error: 'file is required (field name: file)' });

  const targetProjId = String(req.body.project_id || (req.user && req.user.project_id) || 'P1').trim().toUpperCase();

  try {
    const result = await scheduleImportService.importScheduleFromBuffer(req.file.buffer, targetProjId);
    res.status(201).json({
      ...result,
      message: `Schedule processed: ${result.activities_created} created, ${result.activities_updated} updated in database activities table.`
    });
  } catch (err) {
    next(err);
  }
}

async function seedMasterSchedule(req, res, next) {
  try {
    const defaultMasterRows = [
      { id: 'proj-p1', wbs_code: 'P1', level: 1, parent_id: null, discipline: 'project', description: 'Refinery Debottlenecking Project Baseline', planned_start: '2026-01-01', planned_end: '2026-12-31' },
      { id: 'area-piping', wbs_code: 'P1.PIP', level: 3, parent_id: 'proj-p1', discipline: 'piping', description: 'Piping — Unit 24 Header Lines', planned_start: '2026-02-01', planned_end: '2026-06-30' },
      { id: 'area-civil', wbs_code: 'P1.CIV', level: 3, parent_id: 'proj-p1', discipline: 'civil', description: 'Civil — Foundations Block B', planned_start: '2026-01-15', planned_end: '2026-04-30' },
      { id: 'area-elec', wbs_code: 'P1.ELE', level: 3, parent_id: 'proj-p1', discipline: 'electrical', description: 'Electrical — Substation 3 Cabling', planned_start: '2026-03-01', planned_end: '2026-07-31' },
      { id: 'act-pip-001', wbs_code: 'P1.PIP.001', level: 5, parent_id: 'area-piping', discipline: 'piping', description: 'Erect Line 24"-XX', planned_start: '2026-03-10', planned_end: '2026-03-14' },
      { id: 'act-pip-002', wbs_code: 'P1.PIP.002', level: 5, parent_id: 'area-piping', discipline: 'piping', description: 'Weld Line 24"-XX Joint 3-7', planned_start: '2026-03-15', planned_end: '2026-03-18' },
      { id: 'act-pip-003', wbs_code: 'P1.PIP.003', level: 5, parent_id: 'area-piping', discipline: 'piping', description: 'Hydro Test Line 24"-XX', planned_start: '2026-03-19', planned_end: '2026-03-21' },
      { id: 'act-pip-004', wbs_code: 'P1.PIP.004', level: 5, parent_id: 'area-piping', discipline: 'piping', description: 'Erect Line 18"-YY North Header', planned_start: '2026-03-20', planned_end: '2026-03-24' },
      { id: 'act-civ-001', wbs_code: 'P1.CIV.001', level: 5, parent_id: 'area-civil', discipline: 'civil', description: 'Excavation for Foundation F-12', planned_start: '2026-01-20', planned_end: '2026-01-25' },
      { id: 'act-civ-002', wbs_code: 'P1.CIV.002', level: 5, parent_id: 'area-civil', discipline: 'civil', description: 'Rebar Fixing Foundation F-12', planned_start: '2026-01-26', planned_end: '2026-01-30' },
      { id: 'act-civ-003', wbs_code: 'P1.CIV.003', level: 5, parent_id: 'area-civil', discipline: 'civil', description: 'Concrete Pour Foundation F-12', planned_start: '2026-02-01', planned_end: '2026-02-03' },
      { id: 'act-civ-004', wbs_code: 'P1.CIV.004', level: 5, parent_id: 'area-civil', discipline: 'civil', description: 'Formwork Removal Foundation F-12', planned_start: '2026-02-08', planned_end: '2026-02-09' },
      { id: 'act-ele-001', wbs_code: 'P1.ELE.001', level: 5, parent_id: 'area-elec', discipline: 'electrical', description: 'Cable Laying Substation 3 Panel A', planned_start: '2026-04-01', planned_end: '2026-04-05' },
      { id: 'act-ele-002', wbs_code: 'P1.ELE.002', level: 5, parent_id: 'area-elec', discipline: 'electrical', description: 'Cable Termination Substation 3 Panel A', planned_start: '2026-04-06', planned_end: '2026-04-08' },
      { id: 'act-ele-003', wbs_code: 'P1.ELE.003', level: 5, parent_id: 'area-elec', discipline: 'electrical', description: 'Megger Testing Substation 3 Panel A', planned_start: '2026-04-09', planned_end: '2026-04-10' }
    ];

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      for (const a of defaultMasterRows) {
        await connection.query(
          `INSERT INTO activities (id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end, status, source)
           VALUES (?,?,?,?,?,?,?,?,'not_started','master_seed')
           ON DUPLICATE KEY UPDATE description=VALUES(description), discipline=VALUES(discipline), planned_start=VALUES(planned_start), planned_end=VALUES(planned_end)`,
          [a.id, a.wbs_code, a.level, a.parent_id, a.discipline, a.description, a.planned_start, a.planned_end]
        );
      }

      await connection.commit();
      res.json({ message: 'Master schedule template restored across all disciplines', activities_count: defaultMasterRows.length });
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

module.exports = { listActivities, getActivity, downloadTemplate, importBaseline, seedMasterSchedule };
