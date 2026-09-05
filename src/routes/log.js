const express = require('express');
const router = express.Router();
const { identifyUser, requireRole } = require('../middleware/auth');
const { submitLog } = require('../controllers/logController');

router.use(identifyUser);
router.post('/', requireRole('supervisor', 'planner', 'admin'), submitLog);

module.exports = router;
