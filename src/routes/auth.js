const express = require('express');
const router = express.Router();
const { listUsers, login } = require('../controllers/authController');

router.get('/users', listUsers);
router.post('/login', login);

module.exports = router;
