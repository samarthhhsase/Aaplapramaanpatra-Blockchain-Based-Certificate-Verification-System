const pool = require('../db');
const { generateCertificateNumber } = require('../utils/certificateNumber');
const { computeCertificateHash } = require('../utils/hash');
const {
  issueCertificateOnChain,
  revokeCertificateOnChain,
  verifyCertificateOnChain,
} = require('../services/blockchainService');

const STATUS_VALID = 'Valid';
const STATUS_REVOKED = 'Revoked';

function normalizeDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function generateUniqueCertificateNo() {
  for (let i = 0; i < 20; i += 1) {
    const certificateNo = generateCertificateNumber();
    const [rows] = await pool.execute(
      'SELECT id FROM certificates WHERE certificate_no = ? LIMIT 1',
      [certificateNo]
    );

    if (rows.length === 0) {
      return certificateNo;
    }
  }

  throw new Error('Failed to generate unique certificate number');
}

async function issueCertificate(req, res) {
  try {
    const {
      studentId,
      course,
      grade,
      issueDate,
      class: className,
      studentType,
      semester,
    } = req.body || {};

    if (!studentId || !course || !grade || !issueDate || !className || !studentType || !semester) {
      return res.status(400).json({
        success: false,
        message: 'studentId, course, grade, issueDate, class, studentType, and semester are required',
      });
    }

    if (!req.user?.profileId) {
      return res.status(401).json({
        success: false,
        message: 'Issuer profile is missing from the auth token',
      });
    }
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);

    const normalizedIssueDate = normalizeDate(issueDate);
    if (!normalizedIssueDate) {
      return res.status(400).json({ success: false, message: 'issueDate is invalid' });
    }

    const [studentRows] = await pool.execute(
      'SELECT id, name FROM students WHERE id = ? AND school_id = ? LIMIT 1',
      [Number(studentId), schoolId]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const certificateNo = await generateUniqueCertificateNo();
    const certificateHash = computeCertificateHash({
      studentName: studentRows[0].name,
      course: String(course).trim(),
      grade: String(grade).trim(),
      className: String(className).trim(),
      studentType: String(studentType).trim(),
      semester: String(semester).trim(),
      issueDate: normalizedIssueDate,
    });

    const chainReceipt = await issueCertificateOnChain({
      certificateHash,
      certificateId: certificateNo,
      studentName: studentRows[0].name,
      course: String(course).trim(),
    });

    const [insertResult] = await pool.execute(
      `INSERT INTO certificates (
        certificate_no,
        student_id,
        issuer_id,
        school_id,
        student_name,
        course,
        grade,
        class,
        student_type,
        semester,
        issue_date,
        certificate_hash,
        blockchain_tx_hash,
        status,
        is_revoked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [
        certificateNo,
        Number(studentId),
        Number(req.user.profileId),
        schoolId,
        studentRows[0].name,
        String(course).trim(),
        String(grade).trim(),
        String(className).trim(),
        String(studentType).trim(),
        String(semester).trim(),
        normalizedIssueDate,
        certificateHash,
        chainReceipt.transactionHash,
        STATUS_VALID,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Certificate issued successfully',
      certificate: {
        id: insertResult.insertId,
        certificate_no: certificateNo,
        certificate_hash: certificateHash,
        blockchain_tx_hash: chainReceipt.transactionHash,
        status: STATUS_VALID,
      },
    });
  } catch (error) {
    console.error('[CERTIFICATE][ISSUE] ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to issue certificate',
      error: error.message,
    });
  }
}

async function revokeCertificate(req, res) {
  try {
    const certificateNo = (req.params.certificate_number || req.params.id || '').trim();
    if (!certificateNo) {
      return res.status(400).json({ success: false, message: 'Certificate number is required' });
    }

    const [rows] = await pool.execute(
      'SELECT id, status FROM certificates WHERE certificate_no = ? AND issuer_id = ? LIMIT 1',
      [certificateNo, Number(req.user?.profileId)]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    if (rows[0].status === STATUS_REVOKED) {
      return res.status(409).json({ success: false, message: 'Certificate already revoked' });
    }

    await revokeCertificateOnChain(certificateNo);
    await pool.execute('UPDATE certificates SET status = ?, is_revoked = TRUE WHERE id = ?', [STATUS_REVOKED, rows[0].id]);

    return res.status(200).json({ success: true, message: 'Certificate revoked successfully' });
  } catch (error) {
    console.error('[CERTIFICATE][REVOKE] ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to revoke certificate',
      error: error.message,
    });
  }
}

async function deleteCertificate(req, res) {
  try {
    const certificateNo = (req.params.certificate_number || req.params.id || '').trim();
    if (!certificateNo) {
      return res.status(400).json({ success: false, message: 'Certificate number is required' });
    }

    const [rows] = await pool.execute(
      'SELECT id FROM certificates WHERE certificate_no = ? AND issuer_id = ? LIMIT 1',
      [certificateNo, Number(req.user?.profileId)]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    await pool.execute('DELETE FROM certificates WHERE id = ?', [rows[0].id]);
    return res.status(200).json({ success: true, message: 'Certificate deleted successfully' });
  } catch (error) {
    console.error('[CERTIFICATE][DELETE] ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete certificate',
      error: error.message,
    });
  }
}

async function verifyCertificate(req, res) {
  try {
    const certificateNo = (req.params.certificate_number || req.params.id || '').trim();
    if (!certificateNo) {
      return res.status(400).json({ success: false, message: 'Certificate number is required' });
    }

    const [rows] = await pool.execute(
      `SELECT
         c.id,
         c.certificate_no,
         c.course,
         c.grade,
         c.class,
         c.student_type,
         c.semester,
         c.issue_date,
         c.status,
         c.certificate_hash,
         c.blockchain_tx_hash,
         c.ipfs_hash,
         s.name AS student_name,
         i.name AS issuer_name
       FROM certificates c
       JOIN students s ON c.student_id = s.id
       JOIN issuers i ON c.issuer_id = i.id
       WHERE c.certificate_no = ?
       LIMIT 1`,
      [certificateNo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    const chainCertificate = await verifyCertificateOnChain(certificateNo);
    const hashMatches = chainCertificate.exists && chainCertificate.certificateHash === rows[0].certificate_hash;

    return res.status(200).json({
      success: true,
      certificate: {
        ...rows[0],
        blockchain: {
          exists: chainCertificate.exists,
          revoked: chainCertificate.revoked,
          issuer_address: chainCertificate.issuerAddress,
          issued_at: chainCertificate.issuedAt ? new Date(chainCertificate.issuedAt * 1000).toISOString() : null,
          hash_matches: hashMatches,
        },
      },
    });
  } catch (error) {
    console.error('[CERTIFICATE][VERIFY] ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify certificate',
      error: error.message,
    });
  }
}

module.exports = {
  issueCertificate,
  revokeCertificate,
  deleteCertificate,
  verifyCertificate,
};
