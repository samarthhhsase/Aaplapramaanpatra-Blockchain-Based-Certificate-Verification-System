const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { requireSchoolContext } = require('../middleware/schoolContext');
const {
  getStudents,
  getStudentDetails,
  issueCertificate,
  updateCertificateMarks,
  revokeCertificate,
  getIssuedCertificates,
  getDashboardStats,
  downloadPdf,
  getComplaints,
  resolveComplaint,
  deleteCertificate,
  getAuditLogs,
} = require('../controllers/issuerController');

const router = express.Router();

router.use(authenticate, authorizeRoles('issuer'), requireSchoolContext);

router.get('/dashboard/stats', getDashboardStats);
router.get('/students', getStudents);
router.get('/students/:id', getStudentDetails);
router.post('/certificates', issueCertificate);
router.put('/certificates/:certNo/marks', updateCertificateMarks);
router.put('/certificates/:certNo', updateCertificateMarks);
router.delete('/certificates/:certNo', deleteCertificate);
router.patch('/certificates/:certNo/revoke', revokeCertificate);
router.get('/certificates', getIssuedCertificates);
router.get('/certificates/:certNo/pdf', downloadPdf);
router.get('/complaints', getComplaints);
router.patch('/complaints/:complaintId/resolve', resolveComplaint);
router.patch('/complaints/:complaintId/respond', resolveComplaint);
router.get('/audit-logs', getAuditLogs);

module.exports = router;
