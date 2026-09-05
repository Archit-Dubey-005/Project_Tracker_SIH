const { v4: uuid } = require('uuid');
const db = require('./db');

async function seed() {
  try {
    const conn = await db.getConnection();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    try { await conn.query('ALTER TABLE audit_log DROP FOREIGN KEY audit_log_ibfk_1'); } catch (_) {}
    try { await conn.query('ALTER TABLE audit_log DROP FOREIGN KEY audit_log_ibfk_2'); } catch (_) {}
    try { await conn.query('ALTER TABLE audit_log DROP FOREIGN KEY audit_log_ibfk_3'); } catch (_) {}
    try { await conn.query('ALTER TABLE matches DROP FOREIGN KEY matches_ibfk_1'); } catch (_) {}
    try { await conn.query('ALTER TABLE matches DROP FOREIGN KEY matches_ibfk_2'); } catch (_) {}
    try { await conn.query('ALTER TABLE matches DROP FOREIGN KEY matches_ibfk_3'); } catch (_) {}

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE DEFAULT NULL,
        password VARCHAR(255) DEFAULT 'password123',
        role VARCHAR(50) NOT NULL,
        discipline VARCHAR(50) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try { await conn.query(`ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE DEFAULT NULL`); } catch (_) {}
    try { await conn.query(`ALTER TABLE users ADD COLUMN password VARCHAR(255) DEFAULT 'password123'`); } catch (_) {}

    await conn.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id VARCHAR(64) PRIMARY KEY,
        wbs_code VARCHAR(100) DEFAULT NULL,
        level INT NOT NULL,
        parent_id VARCHAR(64) DEFAULT NULL,
        discipline VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        planned_start DATE DEFAULT NULL,
        planned_end DATE DEFAULT NULL,
        actual_start DATE DEFAULT NULL,
        actual_end DATE DEFAULT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'not_started',
        source VARCHAR(50) DEFAULT 'baseline_import',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const users = [
      { id: 'u-admin', name: 'Admin User', email: 'admin@project.com', password: 'admin123', role: 'admin', discipline: null },
      { id: 'u-planner', name: 'Rekha Iyer (Planner)', email: 'planner@project.com', password: 'planner123', role: 'planner', discipline: null },
      { id: 'u-civil', name: 'Suresh Patel', email: 'civil@project.com', password: 'civil123', role: 'supervisor', discipline: 'civil' },
      { id: 'u-piping', name: 'Alok Mehta', email: 'piping@project.com', password: 'piping123', role: 'supervisor', discipline: 'piping' },
      { id: 'u-electrical', name: 'Farhan Sheikh', email: 'electrical@project.com', password: 'electrical123', role: 'supervisor', discipline: 'electrical' },
    ];

    for (const u of users) {
      await conn.query(
        `INSERT INTO users (id, name, email, password, role, discipline)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), password=VALUES(password), role=VALUES(role), discipline=VALUES(discipline)`,
        [u.id, u.name, u.email, u.password, u.role, u.discipline]
      );
    }

    const [rows] = await conn.query('SELECT COUNT(*) as c FROM activities');
    if (rows[0].c === 0) {
      const projId = uuid();
      const areaPipingId = uuid();
      const areaCivilId = uuid();
      const areaElecId = uuid();

      const insertAct = `INSERT INTO activities (id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 'baseline_import')`;

      await conn.query(insertAct, [projId, 'P1', 1, null, 'project', 'Refinery Debottlenecking Project', '2026-01-01', '2026-12-31']);

      await conn.query(insertAct, [areaPipingId, 'P1.PIP', 3, projId, 'piping', 'Piping — Unit 24 Header', '2026-02-01', '2026-06-30']);
      await conn.query(insertAct, [areaCivilId, 'P1.CIV', 3, projId, 'civil', 'Civil — Foundations Block B', '2026-01-15', '2026-04-30']);
      await conn.query(insertAct, [areaElecId, 'P1.ELE', 3, projId, 'electrical', 'Electrical — Substation 3 Cabling', '2026-03-01', '2026-07-31']);

      const leafActivities = [
        // piping
        { wbs_code: 'P1.PIP.001', level: 5, parent_id: areaPipingId, discipline: 'piping', description: 'Erect Line 24"-XX', planned_start: '2026-03-10', planned_end: '2026-03-14' },
        { wbs_code: 'P1.PIP.002', level: 5, parent_id: areaPipingId, discipline: 'piping', description: 'Weld Line 24"-XX Joint 3-7', planned_start: '2026-03-15', planned_end: '2026-03-18' },
        { wbs_code: 'P1.PIP.003', level: 5, parent_id: areaPipingId, discipline: 'piping', description: 'Hydro Test Line 24"-XX', planned_start: '2026-03-19', planned_end: '2026-03-21' },
        { wbs_code: 'P1.PIP.004', level: 5, parent_id: areaPipingId, discipline: 'piping', description: 'Erect Line 18"-YY North Header', planned_start: '2026-03-20', planned_end: '2026-03-24' },
        // civil
        { wbs_code: 'P1.CIV.001', level: 5, parent_id: areaCivilId, discipline: 'civil', description: 'Excavation for Foundation F-12', planned_start: '2026-01-20', planned_end: '2026-01-25' },
        { wbs_code: 'P1.CIV.002', level: 5, parent_id: areaCivilId, discipline: 'civil', description: 'Rebar Fixing Foundation F-12', planned_start: '2026-01-26', planned_end: '2026-01-30' },
        { wbs_code: 'P1.CIV.003', level: 5, parent_id: areaCivilId, discipline: 'civil', description: 'Concrete Pour Foundation F-12', planned_start: '2026-02-01', planned_end: '2026-02-03' },
        { wbs_code: 'P1.CIV.004', level: 5, parent_id: areaCivilId, discipline: 'civil', description: 'Formwork Removal Foundation F-12', planned_start: '2026-02-08', planned_end: '2026-02-09' },
        // electrical
        { wbs_code: 'P1.ELE.001', level: 5, parent_id: areaElecId, discipline: 'electrical', description: 'Cable Laying Substation 3 Panel A', planned_start: '2026-04-01', planned_end: '2026-04-05' },
        { wbs_code: 'P1.ELE.002', level: 5, parent_id: areaElecId, discipline: 'electrical', description: 'Cable Termination Substation 3 Panel A', planned_start: '2026-04-06', planned_end: '2026-04-08' },
        { wbs_code: 'P1.ELE.003', level: 5, parent_id: areaElecId, discipline: 'electrical', description: 'Megger Testing Substation 3 Panel A', planned_start: '2026-04-09', planned_end: '2026-04-10' },
      ];

      for (const a of leafActivities) {
        await conn.query(insertAct, [uuid(), a.wbs_code, a.level, a.parent_id, a.discipline, a.description, a.planned_start, a.planned_end]);
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
    console.log('MySQL seed updated successfully:', users.length, 'users populated with email & password.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
}

seed();
