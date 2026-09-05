const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || 'localhost';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD) : '';
const database = process.env.DB_NAME || 'progress_tracker';
const port = Number(process.env.DB_PORT) || 3306;

console.log(`[MySQL Config] Connecting to ${user}@${host}:${port}/${database} (Password set: ${password ? 'YES' : 'NO'})`);

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Auto-create database & migrate schema tables/columns if needed
(async () => {
  try {
    const rootConn = await mysql.createConnection({ host, user, password, port });
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await rootConn.end();

    const conn = await pool.getConnection();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

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

    await conn.query(`
      CREATE TABLE IF NOT EXISTS raw_entries (
        id VARCHAR(64) PRIMARY KEY,
        batch_id VARCHAR(64) DEFAULT NULL,
        source_type VARCHAR(50) NOT NULL,
        raw_text LONGTEXT DEFAULT NULL,
        file_name VARCHAR(255) DEFAULT NULL,
        discipline VARCHAR(50) DEFAULT NULL,
        submitted_by VARCHAR(64) DEFAULT NULL,
        report_date DATE DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS extracted_events (
        id VARCHAR(64) PRIMARY KEY,
        raw_entry_id VARCHAR(64) DEFAULT NULL,
        activity_description TEXT NOT NULL,
        event_type VARCHAR(50) DEFAULT 'progress',
        progress_pct INT DEFAULT NULL,
        extracted_date DATE DEFAULT NULL,
        extraction_confidence DOUBLE DEFAULT 0.75,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id VARCHAR(64) PRIMARY KEY,
        extracted_event_id VARCHAR(64) DEFAULT NULL,
        activity_id VARCHAR(64) DEFAULT NULL,
        candidates_json LONGTEXT DEFAULT NULL,
        similarity_score DOUBLE DEFAULT 0.0,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        reviewed_by VARCHAR(64) DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try { await conn.query(`ALTER TABLE matches ADD COLUMN similarity_score DOUBLE DEFAULT 0.0`); } catch (_) {}
    // Ensure uniform collation across all tables to prevent JOIN collation mismatch
    const tables = ['users', 'activities', 'raw_entries', 'extracted_events', 'matches', 'audit_log'];
    for (const t of tables) {
      try { await conn.query(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); } catch (_) {}
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
    console.log(`Connected successfully to MySQL database "${database}" at ${host}:${port}`);
  } catch (err) {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`\n[MySQL Auth Error] ${err.message}`);
      console.error(`--> Check .env file: DB_PASSWORD="${password}"\n`);
    } else if (err.code === 'ECONNREFUSED') {
      console.error(`\n[MySQL Connection Error] Cannot connect to MySQL server at ${host}:${port}. Is MySQL service running?\n`);
    } else {
      console.error(`\n[MySQL Database Error] ${err.message}\n`);
    }
  }
})();

module.exports = pool;
