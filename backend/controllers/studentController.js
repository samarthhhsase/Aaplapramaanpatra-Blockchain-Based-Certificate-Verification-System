const pool = require('../db');
const { logAudit } = require('../utils/auditLog');
const { buildCertificatePdf } = require('../services/pdfService');
const { getSubjectsByCertificateIds } = require('../utils/certificateSubjects');
const { roundToTwo } = require('../utils/marks');

async function getDashboardStats(req, res) {
  try {
    const studentId = req.user.profileId;
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);

    const [certRows] = await pool.execute(
      'SELECT COUNT(*) AS totalCertificates FROM certificates WHERE student_id = ? AND school_id = ?',
      [studentId, schoolId]
    );

    const [revokedRows] = await pool.execute(
      'SELECT COUNT(*) AS totalRevoked FROM certificates WHERE student_id = ? AND school_id = ? AND status = ?',
      [studentId, schoolId, 'Revoked']
    );

    const [complaintRows] = await pool.execute(
      `SELECT COUNT(*) AS totalComplaints
       FROM complaints cp
       JOIN certificates c ON cp.certificate_id = c.id
       WHERE cp.student_id = ? AND c.school_id = ?`,
      [studentId, schoolId]
    );

    return res.status(200).json({
      stats: {
        totalCertificates: Number(certRows[0].totalCertificates),
        totalRevoked: Number(revokedRows[0].totalRevoked),
        totalComplaints: Number(complaintRows[0].totalComplaints),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch stats', error: error.message });
  }
}

async function getMyCertificates(req, res) {
  try {
    const studentId = req.user.profileId;
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);

    const [rows] = await pool.execute(
      `SELECT
         c.id,
         c.id AS certificate_id,
         c.certificate_no,
         c.issuer_id,
         c.course,
         c.grade,
         c.class,
         c.student_type,
         c.semester,
         c.roll_no,
         c.academic_year,
         c.certificate_type,
         c.remarks,
         c.overall_percentage,
         c.issue_date,
         c.certificate_hash,
         c.blockchain_tx_hash,
         c.ipfs_hash,
         c.status,
         i.name AS issuer_name,
         u.email AS issuer_email
       FROM certificates c
       JOIN issuers i ON c.issuer_id = i.id
       JOIN users u ON i.user_id = u.id
       WHERE c.student_id = ? AND c.school_id = ?
       ORDER BY c.created_at DESC`,
      [studentId, schoolId]
    );

    const subjectsByCertificateId = await getSubjectsByCertificateIds(rows.map((row) => row.id));
    const certificates = rows.map((row) => ({
      ...row,
      overall_percentage: row.overall_percentage === null ? null : roundToTwo(row.overall_percentage),
      year: row.academic_year,
      class_name: row.class,
      remarks: row.remarks,
      subjects: subjectsByCertificateId[row.id] || [],
    }));

    return res.status(200).json({ certificates });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch certificates', error: error.message });
  }
}

async function raiseComplaint(req, res) {
  try {
    const studentId = req.user.profileId;
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const { certificateId, message } = req.body;

    if (!certificateId || !message) {
      return res.status(400).json({ message: 'certificateId and message are required' });
    }

    if (message.trim().length < 5) {
      return res.status(400).json({ message: 'Complaint message must be at least 5 characters' });
    }

    const [certRows] = await pool.execute(
      'SELECT id FROM certificates WHERE id = ? AND student_id = ? AND school_id = ? LIMIT 1',
      [certificateId, studentId, schoolId]
    );

    if (certRows.length === 0) {
      return res.status(404).json({ message: 'Certificate not found for this student' });
    }

    await pool.execute(
      'INSERT INTO complaints (student_id, certificate_id, message) VALUES (?, ?, ?)',
      [studentId, Number(certificateId), message.trim()]
    );

    await logAudit({
      userId: req.user.userId,
      action: 'RAISE_COMPLAINT',
      certificateId: Number(certificateId),
      newData: { message: message.trim() },
    });

    return res.status(201).json({ message: 'Complaint submitted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to submit complaint', error: error.message });
  }
}

async function getComplaints(req, res) {
  try {
    const studentId = req.user.profileId;
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);

    const [rows] = await pool.execute(
      `SELECT
         cp.id,
         cp.message,
         cp.response,
         cp.status,
         cp.created_at,
         c.certificate_no
       FROM complaints cp
       JOIN certificates c ON cp.certificate_id = c.id
       WHERE cp.student_id = ? AND c.school_id = ?
       ORDER BY cp.created_at DESC`,
      [studentId, schoolId]
    );

    return res.status(200).json({ complaints: rows });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch complaints', error: error.message });
  }
}

async function downloadMyCertificatePdf(req, res) {
  try {
    const studentId = req.user.profileId;
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const { certNo } = req.params;

    const [rows] = await pool.execute(
      `SELECT
         c.id,
         c.certificate_no,
         c.course,
         c.grade,
         c.class,
         c.student_type,
         c.semester,
         c.roll_no,
         c.academic_year,
         c.certificate_type,
         c.remarks,
         c.overall_percentage,
         c.issue_date,
         c.certificate_hash,
         c.blockchain_tx_hash,
         c.ipfs_hash,
         c.status,
         s.name AS student_name,
         i.name AS issuer_name
       FROM certificates c
       JOIN students s ON c.student_id = s.id
       JOIN issuers i ON c.issuer_id = i.id
       WHERE c.certificate_no = ? AND c.student_id = ? AND c.school_id = ?
       LIMIT 1`,
      [certNo, studentId, schoolId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    const subjectsByCertificateId = await getSubjectsByCertificateIds([rows[0].id]);
    const pdfBuffer = await buildCertificatePdf({
      ...rows[0],
      subjects: subjectsByCertificateId[rows[0].id] || [],
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${certNo}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
  }
}

module.exports = {
  getDashboardStats,
  getMyCertificates,
  raiseComplaint,
  getComplaints,
  downloadMyCertificatePdf,
};
