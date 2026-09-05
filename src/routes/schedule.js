const express = require('express');
const multer = require('multer');
const router = express.Router();
const { identifyUser, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/scheduleController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Infinity, fieldSize: Infinity } });

router.use(identifyUser);
router.get('/template', ctrl.downloadTemplate);
router.get('/', ctrl.listActivities);
router.get('/:id', ctrl.getActivity);
router.post('/import', requireRole('admin', 'planner'), upload.single('file'), ctrl.importBaseline);
router.post('/seed-master', requireRole('admin', 'planner'), ctrl.seedMasterSchedule);

module.exports = router;
