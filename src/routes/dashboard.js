const express = require('express');
const router = express.Router();
const { identifyUser, requireRole } = require('../middleware/auth');
const { getSummary } = require('../controllers/dashboardController');

router.use(identifyUser);
router.use(requireRole('supervisor', 'planner', 'admin'));
router.get('/', getSummary);

module.exports = router;
