const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { requireSchoolContext } = require('../middleware/schoolContext');
const {
  getDashboard,
  getIssuers,
  getIssuerDetails,
  createIssuer,
  updateIssuer,
  deleteIssuer,
  updateIssuerStatus,
  getStudents,
  getStudentDetails,
  createStudent,
  updateStudent,
  deleteStudent,
  getCertificates,
  getCertificateDetails,
  revokeCertificate,
} = require('../controllers/adminController');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'), requireSchoolContext);

router.get('/dashboard', getDashboard);
router.get('/issuers', getIssuers);
router.get('/issuers/:id', getIssuerDetails);
router.post('/issuers', createIssuer);
router.put('/issuers/:id', updateIssuer);
router.delete('/issuers/:id', deleteIssuer);
router.patch('/issuers/:id/status', updateIssuerStatus);

router.get('/students', getStudents);
router.get('/students/:id', getStudentDetails);
router.post('/students', createStudent);
router.put('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);

router.get('/certificates', getCertificates);
router.get('/certificates/:id', getCertificateDetails);
router.patch('/certificates/:id/revoke', revokeCertificate);

module.exports = router;
