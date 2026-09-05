const express = require('express');
const multer = require('multer');
const router = express.Router();
const { identifyUser, requireRole } = require('../middleware/auth');
const { uploadSpreadsheet } = require('../controllers/ingestController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Infinity, fieldSize: Infinity } });

router.use(identifyUser);
router.post('/upload', requireRole('supervisor', 'planner', 'admin'), upload.single('file'), uploadSpreadsheet);

module.exports = router;
