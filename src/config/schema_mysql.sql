-- =============================================================================
-- Progress Tracker — MySQL Database Schema DDL
-- Compatible with MySQL 5.7+ and MySQL 8.0+
-- =============================================================================

CREATE DATABASE IF NOT EXISTS progress_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE progress_tracker;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS extracted_events;
DROP TABLE IF EXISTS raw_entries;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- 1. Users Table
CREATE TABLE users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE DEFAULT NULL,
  password VARCHAR(255) NOT NULL DEFAULT 'password123',
  role ENUM('admin', 'planner', 'supervisor') NOT NULL,
  discipline VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Activities (Baseline WBS) Table
CREATE TABLE activities (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  wbs_code VARCHAR(100) DEFAULT NULL,
  level INT NOT NULL,
  parent_id VARCHAR(64) DEFAULT NULL,
  discipline VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  planned_start DATE DEFAULT NULL,
  planned_end DATE DEFAULT NULL,
  actual_start DATE DEFAULT NULL,
  actual_end DATE DEFAULT NULL,
  status ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
  source VARCHAR(50) DEFAULT 'baseline_import',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES activities(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_activities_discipline (discipline),
  INDEX idx_activities_parent (parent_id),
  INDEX idx_activities_wbs (wbs_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Raw Entries Table
CREATE TABLE raw_entries (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  batch_id VARCHAR(64) DEFAULT NULL,
  source_type ENUM('text', 'voice', 'spreadsheet', 'scanned_diary', 'pmis_export') NOT NULL,
  raw_text LONGTEXT DEFAULT NULL,
  file_name VARCHAR(255) DEFAULT NULL,
  discipline VARCHAR(50) DEFAULT NULL,
  submitted_by VARCHAR(64) DEFAULT NULL,
  report_date DATE DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_raw_entries_batch (batch_id),
  INDEX idx_raw_entries_submitted (submitted_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Extracted Events Table
CREATE TABLE extracted_events (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  raw_entry_id VARCHAR(64) DEFAULT NULL,
  activity_description TEXT NOT NULL,
  event_type ENUM('start', 'end', 'progress') DEFAULT 'progress',
  progress_pct INT DEFAULT NULL,
  extracted_date DATE DEFAULT NULL,
  extraction_confidence DOUBLE DEFAULT 0.75,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raw_entry_id) REFERENCES raw_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_extracted_raw_entry (raw_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Matches Table
CREATE TABLE matches (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  extracted_event_id VARCHAR(64) DEFAULT NULL,
  activity_id VARCHAR(64) DEFAULT NULL,
  candidates_json JSON DEFAULT NULL,
  similarity_score DOUBLE DEFAULT 0.0,
  status ENUM('pending', 'confirmed', 'rejected', 'flagged_new') NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(64) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (extracted_event_id) REFERENCES extracted_events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_matches_status (status),
  INDEX idx_matches_activity (activity_id),
  INDEX idx_matches_event (extracted_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Audit Log Table
CREATE TABLE audit_log (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  match_id VARCHAR(64) DEFAULT NULL,
  activity_id VARCHAR(64) DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  actor VARCHAR(64) DEFAULT NULL,
  details TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (actor) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_audit_match (match_id),
  INDEX idx_audit_activity (activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
