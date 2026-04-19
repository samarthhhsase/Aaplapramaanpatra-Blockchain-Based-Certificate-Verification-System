const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { requireSchoolContext } = require('../middleware/schoolContext');
const {
  issueCertificate,
  revokeCertificate,
  deleteCertificate,
  verifyCertificate,
} = require('../controllers/certificateController');
const { updateCertificateMarks } = require('../controllers/issuerController');

const router = express.Router();

router.get('/verify/:certificate_number', verifyCertificate);

router.get('/', (req, res) => {
  return res.status(200).json({ 
    success: true, 
    message: 'Certificate routes ready' 
  });
});

router.use(authenticate, authorizeRoles('issuer'), requireSchoolContext);

router.put('/:id', updateCertificateMarks);
router.put('/:id/marks', updateCertificateMarks);
router.post('/issue', issueCertificate);
router.put('/revoke/:id', revokeCertificate);
router.delete('/delete/:id', deleteCertificate);

module.exports = router;
