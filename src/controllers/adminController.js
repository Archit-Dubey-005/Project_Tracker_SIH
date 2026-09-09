const { randomUUID: uuid } = require('crypto');
const XLSX = require('xlsx');
const db = require('../config/db');
const scheduleImportService = require('../services/scheduleImportService');

/**
 * List all users with project_id and role metadata
 */
async function listUsers(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, discipline, project_id, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

/**
 * Add a new user into database with email, password, role, discipline, and project_id
 */
async function addUser(req, res, next) {
  const { email, password, project_id, name, role, discipline } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim();
  const cleanProjectId = (project_id || '').trim().toUpperCase();
  const cleanRole = (role || 'supervisor').trim().toLowerCase();
  const cleanDiscipline = (discipline || '').trim().toLowerCase() || null;
  const cleanName = (name || '').trim() || (cleanEmail.includes('@') ? cleanEmail.split('@')[0] : 'User');

  if (!cleanEmail) {
    return res.status(400).json({ error: 'Email address is required.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (!cleanPassword || cleanPassword.length < 3) {
    return res.status(400).json({ error: 'Password is required (minimum 3 characters).' });
  }

  if (!cleanProjectId) {
    return res.status(400).json({ error: 'Project ID is required. Every supervisor/user must be assigned to a Project ID (e.g. P1).' });
  }

  if (!['supervisor', 'planner', 'admin'].includes(cleanRole)) {
    return res.status(400).json({ error: 'Role must be supervisor, planner, or admin.' });
  }

  try {
    // Check if email already exists
    const [existing] = await db.query('SELECT id, name, email FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing.length) {
      return res.status(400).json({ error: `A user with email "${cleanEmail}" already exists in the database.` });
    }

    const newId = 'u-' + uuid().slice(0, 8);
    await db.query(
      `INSERT INTO users (id, name, email, password, role, discipline, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, cleanName, cleanEmail, cleanPassword, cleanRole, cleanDiscipline, cleanProjectId]
    );

    res.status(201).json({
      ok: true,
      message: `User ${cleanName} (${cleanEmail}) added to Project ${cleanProjectId} successfully.`,
      user: {
        id: newId,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        discipline: cleanDiscipline,
        project_id: cleanProjectId,
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a user from the database
 */
async function deleteUser(req, res, next) {
  const { id } = req.params;
  if (req.user && req.user.id === id) {
    return res.status(400).json({ error: 'Cannot delete your own active administrator account.' });
  }

  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found in database.' });
    }
    res.json({ ok: true, message: 'User removed from database successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * List all unique project IDs currently present in activities or users
 */
async function listProjects(req, res, next) {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT project_id FROM (
        SELECT project_id FROM activities WHERE project_id IS NOT NULL AND project_id != ''
        UNION
        SELECT project_id FROM users WHERE project_id IS NOT NULL AND project_id != ''
      ) p
      ORDER BY project_id ASC
    `);
    const projectIds = rows.map(r => r.project_id).filter(Boolean);
    if (!projectIds.includes('P1')) projectIds.unshift('P1');
    res.json(projectIds);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Get all tasks status by writing down the project ID
 */
async function getProjectTasks(req, res, next) {
  const rawProjId = (req.params.projectId || req.query.project_id || '').trim();
  if (!rawProjId) {
    return res.status(400).json({ error: 'Please specify a Project ID to inspect tasks status.' });
  }
  const cleanProjId = rawProjId.toUpperCase();

  try {
    // Search activities matching this project_id, or root wbs_code matching
    const [activities] = await db.query(
      `SELECT a.id, a.project_id, a.wbs_code, a.level, a.parent_id, a.discipline, a.description,
              a.planned_start, a.planned_end, a.actual_start, a.actual_end, a.status, a.source, a.created_at,
              (SELECT COUNT(*) FROM matches m WHERE m.activity_id = a.id) as match_count,
              (SELECT COUNT(*) FROM matches m WHERE m.activity_id = a.id AND m.status = 'pending') as pending_count
       FROM activities a
       WHERE UPPER(a.project_id) = ? OR (a.project_id IS NULL AND UPPER(a.wbs_code) LIKE CONCAT(?, '%'))
       ORDER BY a.wbs_code ASC`,
      [cleanProjId, cleanProjId]
    );

    // Compute stats
    const totalActivities = activities.length;
    const leafActivities = activities.filter(a => a.level >= 5);
    const countTarget = leafActivities.length > 0 ? leafActivities : activities;

    const completed = countTarget.filter(a => a.status === 'completed').length;
    const inProgress = countTarget.filter(a => a.status === 'in_progress').length;
    const notStarted = countTarget.filter(a => a.status === 'not_started' || !a.status).length;
    const pendingApprovals = activities.reduce((acc, a) => acc + (Number(a.pending_count) || 0), 0);
    const progressPct = countTarget.length ? Math.round((completed / countTarget.length) * 100) : 0;

    // Get recent matched/extracted events for this project
    const [recentEvents] = await db.query(`
      SELECT m.id as match_id, m.status, m.similarity_score, ee.activity_description, ee.event_type,
             ee.extracted_date, re.discipline, re.source_type, u.name as submitted_by_name,
             a.wbs_code, a.description as activity_description_matched, m.created_at
      FROM matches m
      JOIN extracted_events ee ON ee.id = m.extracted_event_id
      JOIN raw_entries re ON re.id = ee.raw_entry_id
      LEFT JOIN users u ON u.id = re.submitted_by
      LEFT JOIN activities a ON a.id = m.activity_id
      WHERE (UPPER(a.project_id) = ? OR (a.project_id IS NULL AND UPPER(a.wbs_code) LIKE CONCAT(?, '%')))
      ORDER BY m.created_at DESC LIMIT 15`,
      [cleanProjId, cleanProjId]
    );

    // Find assigned supervisors for this project
    const [assignedSupervisors] = await db.query(
      `SELECT id, name, email, role, discipline, project_id FROM users
       WHERE UPPER(project_id) = ? AND role = 'supervisor'`,
      [cleanProjId]
    );

    res.json({
      project_id: cleanProjId,
      summary: {
        total_tasks: totalActivities,
        executable_tasks: countTarget.length,
        completed,
        in_progress: inProgress,
        not_started: notStarted,
        pending_approvals: pendingApprovals,
        progress_pct: progressPct,
        assigned_supervisors_count: assignedSupervisors.length,
      },
      tasks: activities,
      recent_events: recentEvents,
      assigned_supervisors: assignedSupervisors,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Upload and import master schedule for a specific project.
 * Extracts: id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end
 * and writes directly to the activities database table.
 */
async function uploadSchedule(req, res, next) {
  if (!req.file) return res.status(400).json({ error: 'Spreadsheet file (.xlsx or .csv) is required.' });
  const rawProjId = (req.params.projectId || req.body.project_id || 'P1').trim();
  const targetProjId = rawProjId.toUpperCase();

  try {
    const result = await scheduleImportService.importScheduleFromBuffer(req.file.buffer, targetProjId);
    res.status(201).json({
      ...result,
      message: `Schedule for Project ${targetProjId} processed: ${result.activities_created} created, ${result.activities_updated} updated.`
    });
  } catch (err) {
    next(err);
  }
}


/**
 * Admin: Seed or restore default multi-discipline baseline for a project
 */
async function seedDefaultProject(req, res, next) {
  const rawProjId = (req.params.projectId || req.body.project_id || 'P1').trim();
  const proj = rawProjId.toUpperCase();

  const defaultMasterRows = [
    { wbs_code: `${proj}`, level: 1, parent_wbs: null, discipline: 'project', description: `Master Project Baseline (${proj})`, planned_start: '2026-01-01', planned_end: '2026-12-31' },
    { wbs_code: `${proj}.PIP`, level: 3, parent_wbs: `${proj}`, discipline: 'piping', description: 'Piping — Unit 24 Header Lines', planned_start: '2026-02-01', planned_end: '2026-06-30' },
    { wbs_code: `${proj}.CIV`, level: 3, parent_wbs: `${proj}`, discipline: 'civil', description: 'Civil — Foundations Block B', planned_start: '2026-01-15', planned_end: '2026-04-30' },
    { wbs_code: `${proj}.ELE`, level: 3, parent_wbs: `${proj}`, discipline: 'electrical', description: 'Electrical — Substation 3 Cabling', planned_start: '2026-03-01', planned_end: '2026-07-31' },
    { wbs_code: `${proj}.PIP.001`, level: 5, parent_wbs: `${proj}.PIP`, discipline: 'piping', description: 'Erect Line 24"-XX', planned_start: '2026-03-10', planned_end: '2026-03-14' },
    { wbs_code: `${proj}.PIP.002`, level: 5, parent_wbs: `${proj}.PIP`, discipline: 'piping', description: 'Weld Line 24"-XX Joint 3-7', planned_start: '2026-03-15', planned_end: '2026-03-18' },
    { wbs_code: `${proj}.PIP.003`, level: 5, parent_wbs: `${proj}.PIP`, discipline: 'piping', description: 'Hydro Test Line 24"-XX', planned_start: '2026-03-19', planned_end: '2026-03-21' },
    { wbs_code: `${proj}.PIP.004`, level: 5, parent_wbs: `${proj}.PIP`, discipline: 'piping', description: 'Erect Line 18"-YY North Header', planned_start: '2026-03-20', planned_end: '2026-03-24' },
    { wbs_code: `${proj}.CIV.001`, level: 5, parent_wbs: `${proj}.CIV`, discipline: 'civil', description: 'Excavation for Foundation F-12', planned_start: '2026-01-20', planned_end: '2026-01-25' },
    { wbs_code: `${proj}.CIV.002`, level: 5, parent_wbs: `${proj}.CIV`, discipline: 'civil', description: 'Rebar Fixing Foundation F-12', planned_start: '2026-01-26', planned_end: '2026-01-30' },
    { wbs_code: `${proj}.CIV.003`, level: 5, parent_wbs: `${proj}.CIV`, discipline: 'civil', description: 'Concrete Pour Foundation F-12', planned_start: '2026-02-01', planned_end: '2026-02-03' },
    { wbs_code: `${proj}.CIV.004`, level: 5, parent_wbs: `${proj}.CIV`, discipline: 'civil', description: 'Formwork Removal Foundation F-12', planned_start: '2026-02-08', planned_end: '2026-02-09' },
    { wbs_code: `${proj}.ELE.001`, level: 5, parent_wbs: `${proj}.ELE`, discipline: 'electrical', description: 'Cable Laying Substation 3 Panel A', planned_start: '2026-04-01', planned_end: '2026-04-05' },
    { wbs_code: `${proj}.ELE.002`, level: 5, parent_wbs: `${proj}.ELE`, discipline: 'electrical', description: 'Cable Termination Substation 3 Panel A', planned_start: '2026-04-06', planned_end: '2026-04-08' },
    { wbs_code: `${proj}.ELE.003`, level: 5, parent_wbs: `${proj}.ELE`, discipline: 'electrical', description: 'Megger Testing Substation 3 Panel A', planned_start: '2026-04-09', planned_end: '2026-04-10' },
  ];

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const wbsToId = {};
    for (const a of defaultMasterRows) {
      const parentId = a.parent_wbs ? wbsToId[a.parent_wbs] || null : null;
      const actId = 'act-' + proj.toLowerCase() + '-' + uuid().slice(0, 6);

      const [existing] = await connection.query('SELECT id FROM activities WHERE wbs_code = ?', [a.wbs_code]);
      if (existing.length) {
        wbsToId[a.wbs_code] = existing[0].id;
        await connection.query(
          `UPDATE activities
           SET project_id=?, description=?, discipline=?, planned_start=?, planned_end=?
           WHERE id=?`,
          [proj, a.description, a.discipline, a.planned_start, a.planned_end, existing[0].id]
        );
      } else {
        await connection.query(
          `INSERT INTO activities (id, project_id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end, status, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 'admin_default_seed')`,
          [actId, proj, a.wbs_code, a.level, parentId, a.discipline, a.description, a.planned_start, a.planned_end]
        );
        wbsToId[a.wbs_code] = actId;
      }
    }

    await connection.commit();
    res.json({
      ok: true,
      project_id: proj,
      message: `Standard baseline activities created/restored for Project ${proj}.`,
      activities_count: defaultMasterRows.length
    });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
}

module.exports = {
  listUsers,
  addUser,
  deleteUser,
  listProjects,
  getProjectTasks,
  uploadSchedule,
  seedDefaultProject,
};
