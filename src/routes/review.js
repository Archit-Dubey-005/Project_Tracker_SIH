const express = require('express');
const router = express.Router();
const { identifyUser, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/reviewController');

router.use(identifyUser);
router.use(requireRole('supervisor', 'planner', 'admin'));
router.get('/', ctrl.listQueue);
router.get('/:id', ctrl.getDetail);
router.post('/:id/accept', ctrl.accept);
router.post('/:id/reassign', ctrl.reassign);
router.post('/:id/reject', ctrl.reject);
router.post('/:id/flag-new', ctrl.flagNew);

module.exports = router;
