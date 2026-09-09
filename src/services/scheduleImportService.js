const { randomUUID: uuid } = require('crypto');
const XLSX = require('xlsx');
const db = require('../config/db');

/**
 * Format any date input (JS Date, Excel serial number, or date string) into YYYY-MM-DD
 */
function formatDateToYMD(val) {
  if (val === null || val === undefined || val === '') return null;

  // If already a JS Date object
  if (val instanceof Date && !isNaN(val.getTime())) {
    const year = val.getUTCFullYear();
    const month = String(val.getUTCMonth() + 1).padStart(2, '0');
    const day = String(val.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // If Excel serial date number (e.g. 45321)
  if (typeof val === 'number' && !isNaN(val) && val > 0) {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getUTCFullYear();
      const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  const str = String(val).trim();
  if (!str) return null;

  // Match ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Match DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY, or MM-DD-YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    const y = slashMatch[3];

    let m = p2;
    let d = p1;
    if (p1 > 12 && p2 <= 12) {
      // p1 must be day, p2 must be month (DD/MM/YYYY)
      d = p1;
      m = p2;
    } else if (p2 > 12 && p1 <= 12) {
      // p2 must be day, p1 must be month (MM/DD/YYYY)
      m = p1;
      d = p2;
    }

    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Fallback to Date parser
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Infer level if missing or invalid
 */
function inferLevel(wbsCode, parentId, explicitLevel) {
  if (explicitLevel && !isNaN(Number(explicitLevel))) {
    return Number(explicitLevel);
  }
  if (!wbsCode) return 5;
  const parts = wbsCode.split('.');
  if (parts.length === 1) return 1;
  if (parts.length === 2) return 3;
  if (parts.length >= 3) return 5;
  return parentId ? 5 : 1;
}

/**
 * Parse spreadsheet buffer and extract:
 * id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end
 */
function parseScheduleSpreadsheet(buffer, defaultProjectId = 'P1') {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (!workbook.SheetNames || !workbook.SheetNames.length) {
    throw new Error('Spreadsheet does not contain any sheets.');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows || !rawRows.length) {
    throw new Error('The uploaded spreadsheet contains no data rows.');
  }

  const extractedRows = [];

  for (let idx = 0; idx < rawRows.length; idx++) {
    const raw = rawRows[idx];

    // Helper to find value from row with case-insensitive / trimmed keys
    const getVal = (aliases) => {
      const lowerAliases = aliases.map(a => a.toLowerCase().replace(/[\s_-]+/g, ''));
      for (const [key, value] of Object.entries(raw)) {
        const cleanKey = String(key).toLowerCase().replace(/[\s_-]+/g, '');
        if (lowerAliases.includes(cleanKey) && value !== undefined && value !== null) {
          return value;
        }
      }
      return '';
    };

    // Extract requested fields
    const rawId = getVal(['id', 'activity_id', 'activity id', 'task_id', 'act_id']);
    const rawWbs = getVal(['wbs_code', 'wbs code', 'wbs', 'wbs_id', 'wbscode']);
    const rawLevel = getVal(['level', 'lvl', 'l', 'wbs_level']);
    const rawParentId = getVal(['parent_id', 'parent id', 'parent_wbs', 'parent wbs', 'parent', 'parentid']);
    const rawDiscipline = getVal(['discipline', 'disc', 'discipline_code', 'department']);
    const rawDescription = getVal(['description', 'task', 'activity', 'activity_description', 'task_name', 'name', 'activity name']);
    const rawPlannedStart = getVal(['planned_start', 'planned start', 'start_date', 'start date', 'start', 'planned start date', 'early start']);
    const rawPlannedEnd = getVal(['planned_end', 'planned end', 'end_date', 'end date', 'finish', 'end', 'planned end date', 'early finish']);
    const rawProjectId = getVal(['project_id', 'project id', 'project', 'proj_id']);

    const wbsCode = String(rawWbs || '').trim();
    const id = String(rawId || '').trim() || (wbsCode ? `act-${wbsCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : `act-${uuid().slice(0, 8)}`);

    // Skip completely blank rows
    if (!id && !wbsCode && !rawDescription) {
      continue;
    }

    const parentId = String(rawParentId || '').trim() || null;
    const level = inferLevel(wbsCode, parentId, rawLevel);
    let discipline = String(rawDiscipline || '').trim().toLowerCase();
    if (!discipline) {
      if (wbsCode.includes('.CIV')) discipline = 'civil';
      else if (wbsCode.includes('.PIP')) discipline = 'piping';
      else if (wbsCode.includes('.ELE')) discipline = 'electrical';
      else if (wbsCode.includes('.MEC')) discipline = 'mechanical';
      else discipline = level === 1 ? 'project' : 'general';
    }

    const description = String(rawDescription || '').trim() || (wbsCode ? `Activity ${wbsCode}` : `Activity ${id}`);
    const plannedStart = formatDateToYMD(rawPlannedStart);
    const plannedEnd = formatDateToYMD(rawPlannedEnd);
    const projectId = String(rawProjectId || defaultProjectId || 'P1').trim().toUpperCase();

    extractedRows.push({
      id,
      wbs_code: wbsCode || null,
      level,
      parent_id: parentId === id ? null : parentId, // avoid self-referencing parent
      discipline,
      description,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      project_id: projectId
    });
  }

  if (!extractedRows.length) {
    throw new Error('No valid activity rows could be extracted from the uploaded spreadsheet.');
  }

  return extractedRows;
}

/**
 * Write extracted activity records into the MySQL `activities` database table.
 * Each time admin uploads the schedule in spreadsheet file, writes:
 * id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end
 */
async function writeActivitiesToDatabase(extractedRows, targetProjectId = 'P1') {
  const connection = await db.getConnection();
  let created = 0;
  let updated = 0;

  try {
    await connection.beginTransaction();

    // Disable foreign key checks temporarily during batch insert to allow arbitrary parent/child row ordering
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // Fetch existing activities for mapping parent_id & duplicate detection
    const [existingRows] = await connection.query(
      'SELECT id, wbs_code, project_id FROM activities WHERE UPPER(project_id) = ? OR project_id IS NULL',
      [targetProjectId.toUpperCase()]
    );

    const existingIdSet = new Set(existingRows.map(r => r.id));
    const wbsToIdMap = {};
    existingRows.forEach(r => {
      if (r.wbs_code) wbsToIdMap[r.wbs_code.toUpperCase()] = r.id;
    });

    // Also populate wbsToIdMap with newly extracted rows in this batch
    extractedRows.forEach(r => {
      if (r.wbs_code) {
        wbsToIdMap[r.wbs_code.toUpperCase()] = r.id;
      }
    });

    for (const act of extractedRows) {
      // Resolve parent_id: if parent_id is given as a WBS code, map it to the corresponding ID
      let resolvedParentId = act.parent_id;
      if (resolvedParentId) {
        const cleanParent = resolvedParentId.trim().toUpperCase();
        if (wbsToIdMap[cleanParent]) {
          resolvedParentId = wbsToIdMap[cleanParent];
        }
      }

      // Check if this id already exists in database
      const idExists = existingIdSet.has(act.id);

      // Check if this (project_id, wbs_code) already exists under a different id
      let existingByWbs = null;
      if (!idExists && act.wbs_code) {
        const found = existingRows.find(r => r.wbs_code && r.wbs_code.toUpperCase() === act.wbs_code.toUpperCase());
        if (found) existingByWbs = found.id;
      }

      if (idExists) {
        // UPDATE existing record with extracted fields
        await connection.query(
          `UPDATE activities
           SET project_id = ?,
               wbs_code = ?,
               level = ?,
               parent_id = ?,
               discipline = ?,
               description = ?,
               planned_start = ?,
               planned_end = ?,
               source = 'admin_schedule_upload'
           WHERE id = ?`,
          [
            act.project_id,
            act.wbs_code,
            act.level,
            resolvedParentId,
            act.discipline,
            act.description,
            act.planned_start,
            act.planned_end,
            act.id
          ]
        );
        updated++;
      } else if (existingByWbs) {
        // Update existing record that had this WBS code
        await connection.query(
          `UPDATE activities
           SET id = ?,
               project_id = ?,
               level = ?,
               parent_id = ?,
               discipline = ?,
               description = ?,
               planned_start = ?,
               planned_end = ?,
               source = 'admin_schedule_upload'
           WHERE id = ?`,
          [
            act.id,
            act.project_id,
            act.level,
            resolvedParentId,
            act.discipline,
            act.description,
            act.planned_start,
            act.planned_end,
            existingByWbs
          ]
        );
        existingIdSet.delete(existingByWbs);
        existingIdSet.add(act.id);
        updated++;
      } else {
        // INSERT brand new record with extracted fields
        await connection.query(
          `INSERT INTO activities (
             id,
             project_id,
             wbs_code,
             level,
             parent_id,
             discipline,
             description,
             planned_start,
             planned_end,
             status,
             source
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 'admin_schedule_upload')`,
          [
            act.id,
            act.project_id,
            act.wbs_code,
            act.level,
            resolvedParentId,
            act.discipline,
            act.description,
            act.planned_start,
            act.planned_end
          ]
        );
        existingIdSet.add(act.id);
        created++;
      }
    }

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();

    return {
      ok: true,
      project_id: targetProjectId,
      rows_processed: extractedRows.length,
      activities_created: created,
      activities_updated: updated,
      sample_activities: extractedRows.slice(0, 5).map(a => ({
        id: a.id,
        wbs_code: a.wbs_code,
        level: a.level,
        parent_id: a.parent_id,
        discipline: a.discipline,
        description: a.description,
        planned_start: a.planned_start,
        planned_end: a.planned_end
      }))
    };
  } catch (err) {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {}
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * High-level helper to process an uploaded schedule buffer and write to the database
 */
async function importScheduleFromBuffer(buffer, defaultProjectId = 'P1') {
  const extractedRows = parseScheduleSpreadsheet(buffer, defaultProjectId);
  return await writeActivitiesToDatabase(extractedRows, defaultProjectId);
}

module.exports = {
  formatDateToYMD,
  parseScheduleSpreadsheet,
  writeActivitiesToDatabase,
  importScheduleFromBuffer
};
