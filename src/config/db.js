const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');

const connectionUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

const host = process.env.DB_HOST || 'localhost';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD) : '';
const database = process.env.DB_NAME || 'progress_tracker';
const port = Number(process.env.DB_PORT) || 3306;

let pool;

if (connectionUrl) {
  if (connectionUrl.includes('mysql.railway.internal')) {
    console.error('\n[CRITICAL CONFIG WARNING] DATABASE_URL is set to Railway internal domain (mysql.railway.internal)!');
    console.error('This internal domain only works within Railway. From Vercel, you must use Railway\'s Public TCP Proxy URL (e.g. *.proxy.rlwy.net).\n');
  }
  console.log(`[MySQL Config] Connecting using DATABASE_URL`);
  pool = mysql.createPool({
    uri: connectionUrl,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 20000,
    queueLimit: 0,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
} else {
  if (process.env.VERCEL) {
    console.error('\n[CRITICAL ERROR] Running on Vercel but DATABASE_URL is not set in Environment Variables!');
    console.error('Please add DATABASE_URL in Vercel Dashboard -> Settings -> Environment Variables.\n');
  }
  console.log(`[MySQL Config] Connecting to ${user}@${host}:${port}/${database} (Password set: ${password ? 'YES' : 'NO'})`);
  pool = mysql.createPool({
    host,
    user,
    password,
    database,
    port,
    connectTimeout: 20000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

function getPool() {
  return pool;
}

// Auto-create database & migrate schema tables/columns if needed
(async () => {
  try {
    if (!connectionUrl) {
      try {
        const rootConn = await mysql.createConnection({ host, user, password, port });
        await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await rootConn.end();
      } catch (err) {
        // Ignored if user lacks root privilege or DB already exists
      }
    }

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

    // Only convert collations if NOT on Vercel to prevent blocking table locks on serverless cold starts
    if (!process.env.VERCEL) {
      const tables = ['users', 'activities', 'raw_entries', 'extracted_events', 'matches', 'audit_log'];
      for (const t of tables) {
        try { await conn.query(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); } catch (_) {}
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
    console.log(`Connected successfully to MySQL database`);
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

async function checkDbStatus() {
  const isVercel = !!process.env.VERCEL;
  const currentUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

  if (!currentUrl && isVercel) {
    return {
      ok: false,
      error: "DATABASE_URL environment variable is missing in Vercel. Please add DATABASE_URL in Vercel Dashboard -> Settings -> Environment Variables.",
      environment: 'vercel',
      connected: false
    };
  }

  if (currentUrl && currentUrl.includes('mysql.railway.internal')) {
    return {
      ok: false,
      error: "DATABASE_URL is set to Railway's internal domain (mysql.railway.internal). This domain only works inside Railway. Please use Railway's Public TCP Proxy URL (e.g. *.proxy.rlwy.net).",
      environment: isVercel ? 'vercel' : 'local',
      connected: false
    };
  }

  try {
    const conn = await pool.getConnection();
    try {
      await conn.query('SELECT 1 as test');
      const [userRows] = await conn.query('SELECT COUNT(*) as count FROM users');
      const userCount = userRows[0]?.count ?? 0;

      let hostInfo = host;
      let dbName = database;
      if (currentUrl) {
        try {
          const parsed = new URL(currentUrl);
          hostInfo = parsed.host;
          dbName = parsed.pathname.replace(/^\//, '') || 'default';
        } catch (_) {}
      }

      return {
        ok: true,
        database: 'connected',
        host: hostInfo,
        databaseName: dbName,
        userCount,
        environment: isVercel ? 'vercel' : 'local',
        timestamp: new Date().toISOString()
      };
    } finally {
      conn.release();
    }
  } catch (err) {
    let hint = 'Check database connection and configuration.';
    if (err.code === 'ER_NO_SUCH_TABLE') {
      hint = "The database exists, but the 'users' table is missing. Check if DATABASE_URL points to the correct database (e.g. /progress_tracker or /railway) where users were seeded.";
    } else if (err.code === 'ECONNREFUSED') {
      hint = "Connection refused. Ensure DATABASE_URL is set in Vercel Environment Variables.";
    } else if (err.code === 'ETIMEDOUT') {
      hint = "Connection timed out. Check Railway MySQL proxy availability.";
    }

    return {
      ok: false,
      error: err.message,
      code: err.code,
      hint,
      environment: isVercel ? 'vercel' : 'local',
      connected: false
    };
  }
}

pool.getPool = getPool;
pool.checkDbStatus = checkDbStatus;
module.exports = pool;
