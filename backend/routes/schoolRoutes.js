const express = require('express');
const { getSchools } = require('../controllers/schoolController');

const router = express.Router();

router.get('/', getSchools);

module.exports = router;
