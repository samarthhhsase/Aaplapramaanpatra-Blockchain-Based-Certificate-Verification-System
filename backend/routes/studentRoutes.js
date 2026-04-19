const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { requireSchoolContext } = require('../middleware/schoolContext');
const {
  getDashboardStats,
  getMyCertificates,
  raiseComplaint,
  getComplaints,
  downloadMyCertificatePdf,
} = require('../controllers/studentController');

const router = express.Router();

router.use(authenticate, authorizeRoles('student'), requireSchoolContext);

router.get('/dashboard/stats', getDashboardStats);
router.get('/certificates', getMyCertificates);
router.get('/certificates/:certNo/pdf', downloadMyCertificatePdf);
router.post('/complaints', raiseComplaint);
router.get('/complaints', getComplaints);

module.exports = router;
