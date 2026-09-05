const db = require('../config/db');

async function getSummary(req, res, next) {
  try {
    const [byDiscipline] = await db.query(`
      SELECT discipline,
             COUNT(*) as total,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
             SUM(CASE WHEN status='not_started' THEN 1 ELSE 0 END) as not_started
      FROM activities WHERE level >= 5 GROUP BY discipline`);

    const [reviewBacklog] = await db.query(`
      SELECT status, COUNT(*) as count FROM matches GROUP BY status`);

    const [delays] = await db.query(`
      SELECT wbs_code, description, discipline, planned_end, actual_end
      FROM activities
      WHERE planned_end IS NOT NULL AND status != 'completed' AND planned_end < CURDATE()
      ORDER BY planned_end`);

    const [recentActivity] = await db.query(`
      SELECT al.action, al.details, al.created_at, u.name as actor_name
      FROM audit_log al LEFT JOIN users u ON u.id = al.actor
      ORDER BY al.created_at DESC LIMIT 15`);

    res.json({
      by_discipline: byDiscipline,
      review_backlog: reviewBacklog,
      overdue_activities: delays,
      recent_activity: recentActivity,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };
