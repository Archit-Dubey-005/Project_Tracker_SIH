const express = require('express');
const multer = require('multer');
const router = express.Router();
const { identifyUser, requireRole } = require('../middleware/auth');
const adminCtrl = require('../controllers/adminController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Infinity, fieldSize: Infinity } });

// All admin endpoints enforce authentication and Administrator role
router.use(identifyUser);
router.use(requireRole('admin'));

// User management endpoints
router.get('/users', adminCtrl.listUsers);
router.post('/users', adminCtrl.addUser);
router.delete('/users/:id', adminCtrl.deleteUser);

// Project tasks & schedule endpoints
router.get('/projects', adminCtrl.listProjects);
router.get('/projects/:projectId/tasks', adminCtrl.getProjectTasks);
router.post('/projects/:projectId/schedule', upload.single('file'), adminCtrl.uploadSchedule);
router.post('/projects/:projectId/seed-default', adminCtrl.seedDefaultProject);

module.exports = router;
