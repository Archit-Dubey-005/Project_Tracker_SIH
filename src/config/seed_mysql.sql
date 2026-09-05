-- =============================================================================
-- Progress Tracker — MySQL Initial Seed Data Script
-- =============================================================================

USE progress_tracker;

-- Seed Default Users with Email & Password
INSERT INTO users (id, name, email, password, role, discipline) VALUES
  ('u-admin', 'Admin User', 'admin@project.com', 'admin123', 'admin', NULL),
  ('u-planner', 'Rekha Iyer (Planner)', 'planner@project.com', 'planner123', 'planner', NULL),
  ('u-civil', 'Suresh Patel', 'civil@project.com', 'civil123', 'supervisor', 'civil'),
  ('u-piping', 'Alok Mehta', 'piping@project.com', 'piping123', 'supervisor', 'piping'),
  ('u-electrical', 'Farhan Sheikh', 'electrical@project.com', 'electrical123', 'supervisor', 'electrical')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), password=VALUES(password), role=VALUES(role), discipline=VALUES(discipline);

-- Seed Baseline WBS Activities
-- Level 1 Project Root
INSERT INTO activities (id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end, status, source) VALUES
  ('proj-p1', 'P1', 1, NULL, 'project', 'Refinery Debottlenecking Project', '2026-01-01', '2026-12-31', 'not_started', 'baseline_import')
ON DUPLICATE KEY UPDATE wbs_code=VALUES(wbs_code);

-- Level 3 Areas
INSERT INTO activities (id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end, status, source) VALUES
  ('area-piping', 'P1.PIP', 3, 'proj-p1', 'piping', 'Piping — Unit 24 Header', '2026-02-01', '2026-06-30', 'not_started', 'baseline_import'),
  ('area-civil', 'P1.CIV', 3, 'proj-p1', 'civil', 'Civil — Foundations Block B', '2026-01-15', '2026-04-30', 'not_started', 'baseline_import'),
  ('area-elec', 'P1.ELE', 3, 'proj-p1', 'electrical', 'Electrical — Substation 3 Cabling', '2026-03-01', '2026-07-31', 'not_started', 'baseline_import')
ON DUPLICATE KEY UPDATE wbs_code=VALUES(wbs_code);

-- Level 5/6 Executable Leaf Activities
INSERT INTO activities (id, wbs_code, level, parent_id, discipline, description, planned_start, planned_end, status, source) VALUES
  -- Piping Leaf Activities
  ('act-pip-001', 'P1.PIP.001', 5, 'area-piping', 'piping', 'Erect Line 24"-XX', '2026-03-10', '2026-03-14', 'not_started', 'baseline_import'),
  ('act-pip-002', 'P1.PIP.002', 5, 'area-piping', 'piping', 'Weld Line 24"-XX Joint 3-7', '2026-03-15', '2026-03-18', 'not_started', 'baseline_import'),
  ('act-pip-003', 'P1.PIP.003', 5, 'area-piping', 'piping', 'Hydro Test Line 24"-XX', '2026-03-19', '2026-03-21', 'not_started', 'baseline_import'),
  ('act-pip-004', 'P1.PIP.004', 5, 'area-piping', 'piping', 'Erect Line 18"-YY North Header', '2026-03-20', '2026-03-24', 'not_started', 'baseline_import'),

  -- Civil Leaf Activities
  ('act-civ-001', 'P1.CIV.001', 5, 'area-civil', 'civil', 'Excavation for Foundation F-12', '2026-01-20', '2026-01-25', 'not_started', 'baseline_import'),
  ('act-civ-002', 'P1.CIV.002', 5, 'area-civil', 'civil', 'Rebar Fixing Foundation F-12', '2026-01-26', '2026-01-30', 'not_started', 'baseline_import'),
  ('act-civ-003', 'P1.CIV.003', 5, 'area-civil', 'civil', 'Concrete Pour Foundation F-12', '2026-02-01', '2026-02-03', 'not_started', 'baseline_import'),
  ('act-civ-004', 'P1.CIV.004', 5, 'area-civil', 'civil', 'Formwork Removal Foundation F-12', '2026-02-08', '2026-02-09', 'not_started', 'baseline_import'),

  -- Electrical Leaf Activities
  ('act-ele-001', 'P1.ELE.001', 5, 'area-elec', 'electrical', 'Cable Laying Substation 3 Panel A', '2026-04-01', '2026-04-05', 'not_started', 'baseline_import'),
  ('act-ele-002', 'P1.ELE.002', 5, 'area-elec', 'electrical', 'Cable Termination Substation 3 Panel A', '2026-04-06', '2026-04-08', 'not_started', 'baseline_import'),
  ('act-ele-003', 'P1.ELE.003', 5, 'area-elec', 'electrical', 'Megger Testing Substation 3 Panel A', '2026-04-09', '2026-04-10', 'not_started', 'baseline_import')
ON DUPLICATE KEY UPDATE wbs_code=VALUES(wbs_code);
