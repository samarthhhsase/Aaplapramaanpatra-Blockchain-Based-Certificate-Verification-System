const pool = require('../db');
const { generateCertificateNumber } = require('../utils/certificateNumber');
const { computeCertificateHash } = require('../utils/hash');
const { getSubjectsByCertificateIds } = require('../utils/certificateSubjects');
const { normalizeSubjects, calculateOverallPercentage, roundToTwo } = require('../utils/marks');
const blockchainService = require('../services/blockchainService');
const { buildCertificatePdf } = require('../services/pdfService');
const { logAudit } = require('../utils/auditLog');

const ALLOWED_CLASSES = new Set(['FE', 'SE', 'TE', 'BE']);
const ALLOWED_STUDENT_TYPES = new Set(['Regular', 'Dropper']);
const ALLOWED_SEMESTERS = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']);
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

function normalizeIssueMetadata({ className, studentType, semester }) {
  const normalized = {
    className: typeof className === 'string' ? className.trim().toUpperCase() : '',
    studentType: typeof studentType === 'string' ? studentType.trim() : '',
    semester: typeof semester === 'string' ? semester.trim().toUpperCase() : '',
  };

  if (normalized.studentType) {
    const lowered = normalized.studentType.toLowerCase();
    normalized.studentType = lowered === 'regular' ? 'Regular' : lowered === 'dropper' ? 'Dropper' : normalized.studentType;
  }

  return normalized;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function mapStudentRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    roll_no: row.roll_no || null,
    class_name: row.class_name || null,
    class_div: row.class_div || null,
  };
}

function formatIssueErrorMessage(stage, error, blockchainTxHash) {
  if (stage === 'blockchain_write') {
    return {
      message: 'Blockchain transaction failed',
      error: error.message,
    };
  }

  if (blockchainTxHash) {
    return {
      message: 'Certificate was issued on blockchain but failed to save in database',
      error: error.message,
    };
  }

  return {
    message: 'Failed to issue certificate',
    error: error.message,
  };
}

function toNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeRemarks(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length > 500) {
    throw new Error('remarks must be 500 characters or fewer');
  }

  return normalized;
}

function hasFinalizedBlockchainRecord(certificate) {
  const txHash = String(certificate?.blockchain_tx_hash || '').trim();
  return Boolean(txHash) && txHash.toLowerCase() !== 'pending';
}

function normalizeCertificateLookupValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  const numericId = Number(normalized);
  if (Number.isInteger(numericId) && numericId > 0 && String(numericId) === normalized) {
    return { sql: 'c.id = ?', value: numericId };
  }

  return { sql: 'c.certificate_no = ?', value: normalized };
}

async function getIssuerCertificateByLookup(lookupValue, issuerId, schoolId, connection = pool) {
  const lookup = normalizeCertificateLookupValue(lookupValue);
  if (!lookup) {
    return null;
  }

  const [rows] = await connection.execute(
    `SELECT
       c.id,
       c.certificate_no,
       c.student_id,
       c.issuer_id,
       c.student_name,
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
       s.name AS resolved_student_name,
       i.name AS issuer_name
     FROM certificates c
     JOIN students s ON c.student_id = s.id
     JOIN issuers i ON c.issuer_id = i.id
     WHERE ${lookup.sql} AND c.issuer_id = ? AND c.school_id = ?
     LIMIT 1`,
    [lookup.value, issuerId, schoolId]
  );

  return rows[0] || null;
}

function mapCertificateMarksResponse(certificate, subjects) {
  return {
    id: certificate.id,
    certificate_id: certificate.id,
    certificate_no: certificate.certificate_no,
    student_name: certificate.student_name || certificate.resolved_student_name,
    course: certificate.course,
    grade: certificate.grade,
    issue_date: certificate.issue_date,
    status: certificate.status,
    overall_percentage:
      certificate.overall_percentage === null || certificate.overall_percentage === undefined
        ? null
        : roundToTwo(certificate.overall_percentage),
    certificate_hash: certificate.certificate_hash,
    blockchain_tx_hash: certificate.blockchain_tx_hash,
    ipfs_hash: certificate.ipfs_hash,
    subjects: subjects.map((subject) => ({
      ...subject,
      marks_scored: Number(subject.marks_scored),
      out_of: Number(subject.out_of),
      subject_percentage: roundToTwo(subject.subject_percentage),
    })),
  };
}

async function generateUniqueCertificateNo() {
  for (let i = 0; i < 20; i += 1) {
    const certNo = generateCertificateNumber();
    const [rows] = await pool.execute('SELECT id FROM certificates WHERE certificate_no = ? LIMIT 1', [certNo]);
    if (rows.length === 0) {
      return certNo;
    }
  }

  throw new Error('Failed to generate unique certificate number');
}

async function getStudents(req, res) {
  try {
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const [rows] = await pool.execute(
      `SELECT
         s.id,
         s.name,
         u.email,
         COALESCE(NULLIF(s.roll_no, ''), NULLIF(s.roll_number, '')) AS roll_no,
         s.class_name,
         s.class_div
       FROM students s
       JOIN users u ON s.user_id = u.id
       WHERE s.school_id = ?
       ORDER BY s.created_at DESC`
      ,
      [schoolId]
    );

    return res.status(200).json({ students: rows.map(mapStudentRecord) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch students', error: error.message });
  }
}

async function getStudentDetails(req, res) {
  try {
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid student id is required' });
    }

    const [rows] = await pool.execute(
      `SELECT
         s.id,
         s.name,
         u.email,
         COALESCE(NULLIF(s.roll_no, ''), NULLIF(s.roll_number, '')) AS roll_no,
         s.class_name,
         s.class_div
       FROM students s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND s.school_id = ?
       LIMIT 1`,
      [studentId, schoolId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    return res.status(200).json({ success: true, student: mapStudentRecord(rows[0]) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch student details', error: error.message });
  }
}

async function issueCertificate(req, res) {
  let connection;
  let issueStage = 'request_received';
  let blockchainTxHash = null;
  let generatedCertificateNo = null;
  let generatedCertificateHash = null;
  try {
    console.info('[ISSUER][ISSUE] request received', {
      body: req.body,
      user: req.user,
    });

    const {
      studentId,
      student_name: studentNameFromClient,
      student_email: studentEmailFromClient,
      student_class_name: studentClassNameFromClient,
      student_class_div: studentClassDivFromClient,
      course,
      grade,
      issueDate,
      class: classNameLegacy,
      class_name: classNameFromClient,
      studentType,
      semester,
      roll_no: rollNo,
      year,
      certificate_type: certificateType,
      remarks,
      subjects,
    } = req.body || {};

    const issuerProfileId = Number(req.user?.profileId);
    const issuerSchoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const userRole = String(req.user?.role || '').trim().toLowerCase();
    const className = classNameFromClient || classNameLegacy;
    const trimmedStudentNameFromClient = normalizeText(studentNameFromClient);
    const trimmedCourse = normalizeText(course);
    const trimmedGrade = normalizeText(grade);
    const normalizedRollNo = normalizeText(rollNo);
    const normalizedAcademicYear = normalizeText(year);
    const normalizedCertificateType = normalizeText(certificateType);
    const normalizedStudentId = Number(studentId);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Token missing or invalid' });
    }

    if (userRole !== 'issuer') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!Number.isInteger(issuerProfileId) || issuerProfileId <= 0) {
      return res.status(401).json({ success: false, message: 'Unauthorized: issuer profile missing' });
    }

    console.info('[ISSUER][ISSUE] auth context', {
      authenticatedUser: req.user,
      issuerId: issuerProfileId,
    });

    if (!Number.isInteger(normalizedStudentId) || normalizedStudentId <= 0) {
      return res.status(400).json({ success: false, message: 'studentId is required' });
    }

    if (
      !trimmedCourse ||
      !trimmedGrade ||
      !normalizeText(issueDate) ||
      !normalizeText(className) ||
      !normalizeText(studentType) ||
      !normalizeText(semester)
    ) {
      return res.status(400).json({
        success: false,
        message: 'course, grade, issueDate, class, studentType, and semester are required',
      });
    }

    if (!normalizedRollNo) {
      return res.status(400).json({ success: false, message: 'roll_no is required' });
    }

    if (!normalizedAcademicYear) {
      return res.status(400).json({ success: false, message: 'year is required' });
    }

    if (!normalizedCertificateType) {
      return res.status(400).json({ success: false, message: 'certificate_type is required' });
    }

    issueStage = 'validate_request';
    const normalizedIssueDate = normalizeDate(issueDate);
    if (!normalizedIssueDate) {
      return res.status(400).json({ success: false, message: 'issueDate is invalid' });
    }

    const normalizedMeta = normalizeIssueMetadata({ className, studentType, semester });
    if (!ALLOWED_CLASSES.has(normalizedMeta.className)) {
      return res.status(400).json({ success: false, message: 'class must be one of FE, SE, TE, BE' });
    }
    if (!ALLOWED_STUDENT_TYPES.has(normalizedMeta.studentType)) {
      return res.status(400).json({ success: false, message: 'studentType must be one of Regular, Dropper' });
    }
    if (!ALLOWED_SEMESTERS.has(normalizedMeta.semester)) {
      return res.status(400).json({ success: false, message: 'semester must be one of I, II, III, IV, V, VI, VII, VIII' });
    }

    let normalizedSubjects;
    let validatedOverallPercentage;
    try {
      normalizedSubjects = normalizeSubjects(subjects);
      validatedOverallPercentage = calculateOverallPercentage(normalizedSubjects);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message, error: error.message });
    }

    issueStage = 'verify_student';
    const [studentRows] = await pool.execute(
      `SELECT
         s.id,
         s.name,
         u.email,
         COALESCE(NULLIF(s.roll_no, ''), NULLIF(s.roll_number, '')) AS roll_no,
         s.class_name,
         s.class_div
       FROM students s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND s.school_id = ?
       LIMIT 1`,
      [normalizedStudentId, issuerSchoolId]
    );
    console.info('[ISSUER][ISSUE] student lookup', {
      studentId: normalizedStudentId,
      resultCount: studentRows.length,
      student: studentRows[0] || null,
    });

    if (studentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const studentRecord = mapStudentRecord(studentRows[0]);

    issueStage = 'verify_issuer';
    const [issuerRows] = await pool.execute(
      'SELECT id, name FROM issuers WHERE id = ? AND school_id = ? LIMIT 1',
      [issuerProfileId, issuerSchoolId]
    );
    if (issuerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Issuer profile missing' });
    }

    const certNo = await generateUniqueCertificateNo();
    const studentName = normalizeText(studentNameFromClient) || studentRecord.name;
    const studentEmail = toNullableText(studentEmailFromClient) || studentRecord.email;
    const studentClassName = toNullableText(studentClassNameFromClient) || studentRecord.class_name;
    const studentClassDiv = toNullableText(studentClassDivFromClient) || studentRecord.class_div;
    const issuerName = issuerRows[0].name;
    let normalizedRemarks;
    try {
      normalizedRemarks = normalizeRemarks(remarks);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message, error: error.message });
    }

    const certificateHash = computeCertificateHash({
      studentName,
      course: trimmedCourse,
      grade: trimmedGrade,
      className: normalizedMeta.className,
      studentType: normalizedMeta.studentType,
      semester: normalizedMeta.semester,
      issueDate: normalizedIssueDate,
      rollNo: normalizedRollNo,
      academicYear: normalizedAcademicYear,
      certificateType: normalizedCertificateType,
      remarks: normalizedRemarks,
      overallPercentage: validatedOverallPercentage,
      subjects: normalizedSubjects,
    });

    generatedCertificateNo = certNo;
    generatedCertificateHash = certificateHash;
    console.info('[ISSUER][ISSUE] generated certificate metadata', {
      issuerId: issuerProfileId,
      certificateId: generatedCertificateNo,
      certificateHash: generatedCertificateHash,
    });

    issueStage = 'blockchain_write';
    const chainReceipt = await blockchainService.issueCertificateOnChain({
      certificateHash,
      certificateId: certNo,
      studentName,
      course: trimmedCourse,
    });
    blockchainTxHash = chainReceipt.transactionHash;
    console.info('[ISSUER][ISSUE] blockchain tx result', {
      certificateId: certNo,
      certificateHash,
      blockchainTxHash,
      blockchainReceipt: chainReceipt,
    });

    issueStage = 'mysql_insert';
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [insertResult] = await connection.execute(
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
        ipfs_hash,
        status,
        is_revoked,
        roll_no,
        student_email,
        student_class_name,
        student_class_div,
        academic_year,
        certificate_type,
        remarks,
        overall_percentage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        certNo,
        normalizedStudentId,
        issuerProfileId,
        issuerSchoolId,
        studentName,
        trimmedCourse,
        trimmedGrade,
        normalizedMeta.className,
        normalizedMeta.studentType,
        normalizedMeta.semester,
        normalizedIssueDate,
        certificateHash,
        blockchainTxHash,
        null,
        STATUS_VALID,
        false,
        normalizedRollNo,
        studentEmail,
        studentClassName,
        studentClassDiv,
        normalizedAcademicYear,
        normalizedCertificateType,
        normalizedRemarks,
        validatedOverallPercentage,
      ]
    );
    console.info('[ISSUER][ISSUE] mysql insert result', {
      certificateId: certNo,
      insertId: insertResult.insertId,
      affectedRows: insertResult.affectedRows,
    });

    issueStage = 'mysql_insert_subjects';
    await Promise.all(
      normalizedSubjects.map((subject) =>
        connection.execute(
          `INSERT INTO certificate_subjects (
            certificate_id,
            subject_name,
            marks_scored,
            out_of,
            subject_percentage
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            insertResult.insertId,
            subject.subject_name,
            subject.marks_scored,
            subject.out_of,
            subject.subject_percentage,
          ]
        )
      )
    );

    issueStage = 'audit_log';
    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, certificate_id, old_data, new_data)
       VALUES (?, ?, ?, NULL, ?)`,
      [
        req.user.userId,
        'ISSUE_CERTIFICATE',
        insertResult.insertId,
        JSON.stringify({
         certificateNo: certNo,
          school_id: issuerSchoolId,
          studentId: normalizedStudentId,
          studentName,
          course: trimmedCourse,
          grade: trimmedGrade,
          class: normalizedMeta.className,
          class_name: normalizedMeta.className,
          studentType: normalizedMeta.studentType,
          semester: normalizedMeta.semester,
          roll_no: normalizedRollNo,
          student_email: studentEmail,
          student_class_name: studentClassName,
          student_class_div: studentClassDiv,
          year: normalizedAcademicYear,
          certificate_type: normalizedCertificateType,
          remarks: normalizedRemarks,
          overall_percentage: validatedOverallPercentage,
          subjects: normalizedSubjects,
          status: STATUS_VALID,
        }),
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Certificate issued successfully',
      certificate: {
        id: insertResult.insertId,
        certificateNo: certNo,
        studentId: normalizedStudentId,
        school_id: issuerSchoolId,
        studentName,
        course: trimmedCourse,
        grade: trimmedGrade,
        class: normalizedMeta.className,
        class_name: normalizedMeta.className,
        studentType: normalizedMeta.studentType,
        semester: normalizedMeta.semester,
        issueDate: normalizedIssueDate,
        roll_no: normalizedRollNo,
        student_email: studentEmail,
        student_class_name: studentClassName,
        student_class_div: studentClassDiv,
        year: normalizedAcademicYear,
        certificate_type: normalizedCertificateType,
        remarks: normalizedRemarks,
        overall_percentage: validatedOverallPercentage,
        subjects: normalizedSubjects,
        certificateHash,
        blockchainTxHash,
        ipfsHash: null,
        status: STATUS_VALID,
        studentEmail,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('[ISSUER][ISSUE] ERROR', {
      stage: issueStage,
      requestBody: req.body,
      authenticatedUser: req.user,
      issuerId: req.user?.profileId || null,
      certificateId: generatedCertificateNo,
      certificateHash: generatedCertificateHash,
      blockchainTxHash,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    const errorResponse = formatIssueErrorMessage(issueStage, error, blockchainTxHash);
    return res.status(500).json({
      success: false,
      message: errorResponse.message,
      error: errorResponse.error,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function editCertificate(req, res) {
  return res.status(400).json({
    success: false,
    message: 'Use PUT /api/certificates/:id to update certificate marks and subjects.',
  });
}

async function updateCertificateMarks(req, res) {
  let connection;
  let blockchainReceipt = null;
  try {
    const lookupValue = req.params?.id || req.params?.certNo;
    const issuerId = Number(req.user?.profileId);
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const grade = normalizeText(req.body?.grade);
    const requestedSubjects = Array.isArray(req.body?.subjects) ? req.body.subjects : null;

    if (!Number.isInteger(issuerId) || issuerId <= 0) {
      return res.status(401).json({ success: false, message: 'Unauthorized: issuer profile missing' });
    }

    if (!grade) {
      return res.status(400).json({ success: false, message: 'grade is required' });
    }

    if (!requestedSubjects || requestedSubjects.length === 0) {
      return res.status(400).json({ success: false, message: 'subjects are required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const certificate = await getIssuerCertificateByLookup(lookupValue, issuerId, schoolId, connection);
    if (!certificate) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    if (certificate.status === STATUS_REVOKED) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Cannot edit marks for a revoked certificate' });
    }

    const subjectsByCertificateId = await getSubjectsByCertificateIds([certificate.id], connection);
    const existingSubjects = subjectsByCertificateId[certificate.id] || [];
    const existingSubjectsById = new Map(existingSubjects.map((subject) => [Number(subject.id), subject]));
    const mergedSubjects = requestedSubjects.map((subject) => {
      const rawSubjectId = subject?.id;
      const subjectId = rawSubjectId === undefined || rawSubjectId === null || rawSubjectId === '' ? null : Number(rawSubjectId);

      if (subjectId !== null) {
        const existingSubject = existingSubjectsById.get(subjectId);
        if (!existingSubject) {
          throw new Error('Invalid subject row supplied for this certificate');
        }

        return {
          id: subjectId,
          isNew: false,
          subject_name: normalizeText(subject?.subject_name) || existingSubject.subject_name,
          marks_scored: subject?.marks_scored,
          out_of: subject?.out_of === undefined || subject?.out_of === null || subject?.out_of === ''
            ? existingSubject.out_of
            : subject?.out_of,
        };
      }

      const subjectName = normalizeText(subject?.subject_name);
      if (!subjectName) {
        throw new Error('subject_name is required for each new subject');
      }

      return {
        id: null,
        isNew: true,
        subject_name: subjectName,
        marks_scored: subject?.marks_scored,
        out_of: subject?.out_of,
      };
    });

    const submittedExistingIds = new Set(
      mergedSubjects
        .filter((subject) => subject.id !== null && subject.id !== undefined)
        .map((subject) => Number(subject.id))
    );
    const missingExistingSubject = existingSubjects.find((subject) => !submittedExistingIds.has(Number(subject.id)));
    if (missingExistingSubject) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'All existing subject rows must be included when editing marks',
      });
    }

    let normalizedSubjects;
    let nextOverallPercentage;
    try {
      normalizedSubjects = normalizeSubjects(mergedSubjects);
      nextOverallPercentage = calculateOverallPercentage(normalizedSubjects);
    } catch (error) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: error.message, error: error.message });
    }

    const normalizedIssueDate = normalizeDate(certificate.issue_date);
    const nextCertificateHash = computeCertificateHash({
      studentName: certificate.student_name || certificate.resolved_student_name,
      course: certificate.course,
      grade,
      className: certificate.class,
      studentType: certificate.student_type,
      semester: certificate.semester,
      issueDate: normalizedIssueDate,
      rollNo: certificate.roll_no,
      academicYear: certificate.academic_year,
      certificateType: certificate.certificate_type,
      remarks: certificate.remarks,
      overallPercentage: nextOverallPercentage,
      subjects: normalizedSubjects,
    });

    for (const subject of normalizedSubjects) {
      if (subject.id) {
        await connection.execute(
          `UPDATE certificate_subjects
           SET subject_name = ?, marks_scored = ?, out_of = ?, subject_percentage = ?
           WHERE id = ? AND certificate_id = ?`,
          [subject.subject_name, subject.marks_scored, subject.out_of, subject.subject_percentage, subject.id, certificate.id]
        );
      } else {
        const [insertResult] = await connection.execute(
          `INSERT INTO certificate_subjects (
             certificate_id,
             subject_name,
             marks_scored,
             out_of,
             subject_percentage
           ) VALUES (?, ?, ?, ?, ?)`,
          [certificate.id, subject.subject_name, subject.marks_scored, subject.out_of, subject.subject_percentage]
        );
        subject.id = insertResult.insertId;
      }
    }

    const studentName = certificate.student_name || certificate.resolved_student_name;
    const certNo = certificate.certificate_no;
    if (hasFinalizedBlockchainRecord(certificate)) {
      blockchainReceipt = await blockchainService.updateCertificateOnChain({
        certificateId: certNo,
        certificateHash: nextCertificateHash,
        studentName,
        course: certificate.course,
      });
    }

    await connection.execute(
      `UPDATE certificates
       SET grade = ?, overall_percentage = ?, certificate_hash = ?, blockchain_tx_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        grade,
        nextOverallPercentage,
        nextCertificateHash,
        blockchainReceipt?.transactionHash || certificate.blockchain_tx_hash,
        certificate.id,
      ]
    );

    const updatedCertificate = {
      ...certificate,
      grade,
      overall_percentage: nextOverallPercentage,
      certificate_hash: nextCertificateHash,
      blockchain_tx_hash: blockchainReceipt?.transactionHash || certificate.blockchain_tx_hash,
    };
    const pdfPayload = {
      ...updatedCertificate,
      student_name: studentName,
      issuer_name: updatedCertificate.issuer_name,
      subjects: normalizedSubjects,
    };
    await buildCertificatePdf(pdfPayload);

    await logAudit({
      userId: req.user.userId,
      action: 'EDIT_CERTIFICATE_MARKS',
      certificateId: certificate.id,
      oldData: {
        grade: certificate.grade,
        overall_percentage: certificate.overall_percentage,
        subjects: existingSubjects,
      },
      newData: {
        certificate_hash: nextCertificateHash,
        blockchain_tx_hash: blockchainReceipt?.transactionHash || certificate.blockchain_tx_hash,
        grade,
        overall_percentage: nextOverallPercentage,
        subjects: normalizedSubjects,
      },
    });

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Certificate marks updated successfully',
      certificate: mapCertificateMarksResponse(updatedCertificate, normalizedSubjects),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update certificate marks',
      error: error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function revokeCertificate(req, res) {
  let blockchainWarning = null;
  try {
    const certNo = String(req.params?.certNo || '').trim();
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    console.log('[ISSUER][REVOKE] request', {
      params: req.params,
      body: req.body,
      user: req.user,
      certNo,
    });

    if (!certNo) {
      return res.status(400).json({ success: false, message: 'Certificate number is required' });
    }

    const [rows] = await pool.execute(
      'SELECT id, status FROM certificates WHERE certificate_no = ? AND issuer_id = ? AND school_id = ? LIMIT 1',
      [certNo, req.user.profileId, schoolId]
    );
    console.log('[ISSUER][REVOKE] lookup', { certNo, issuerId: req.user.profileId, rowCount: rows.length, rows });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    if (rows[0].status === STATUS_REVOKED) {
      return res.status(409).json({ success: false, message: 'Certificate already revoked' });
    }

    try {
      await blockchainService.revokeCertificateOnChain(certNo);
    } catch (error) {
      blockchainWarning = 'Blockchain revoke could not be synced. Certificate was revoked in MySQL only.';
      console.error('[ISSUER][REVOKE] blockchain revoke failed', {
        certNo,
        issuerId: req.user.profileId,
        message: error.message,
        warning: blockchainWarning,
      });
    }

    await pool.execute(
      'UPDATE certificates SET status = ?, is_revoked = TRUE WHERE id = ?',
      [STATUS_REVOKED, rows[0].id]
    );

    await logAudit({
      userId: req.user.userId,
      action: 'REVOKE_CERTIFICATE',
      certificateId: rows[0].id,
      oldData: { status: rows[0].status },
      newData: { status: STATUS_REVOKED, blockchainWarning },
    });

    return res.status(200).json({
      success: true,
      message: 'Certificate revoked successfully',
      warning: blockchainWarning,
    });
  } catch (error) {
    console.error('[ISSUER][REVOKE] ERROR:', error);
    return res.status(500).json({ success: false, message: 'Failed to revoke certificate', error: error.message });
  }
}

async function getIssuedCertificates(req, res) {
  try {
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
         c.student_email,
         c.student_class_name,
         c.student_class_div,
         c.academic_year,
         c.certificate_type,
         c.remarks,
         c.overall_percentage,
         c.issue_date,
         c.certificate_hash,
         c.blockchain_tx_hash,
         c.ipfs_hash,
         c.status,
         c.created_at,
         COALESCE(NULLIF(c.student_name, ''), s.name) AS student_name,
         COALESCE(NULLIF(c.student_email, ''), u.email) AS student_email
       FROM certificates c
       JOIN students s ON c.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE c.issuer_id = ? AND c.school_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.profileId, req.user.schoolId]
    );

    const subjectsByCertificateId = await getSubjectsByCertificateIds(rows.map((row) => row.id));
    const certificates = rows.map((row) => ({
      ...row,
      overall_percentage: row.overall_percentage === null ? null : roundToTwo(row.overall_percentage),
      year: row.academic_year,
      class_name: row.class,
      student_class_name: row.student_class_name,
      student_class_div: row.student_class_div,
      remarks: row.remarks,
      subjects: subjectsByCertificateId[row.id] || [],
    }));

    return res.status(200).json({ certificates });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch certificates', error: error.message });
  }
}

async function getDashboardStats(req, res) {
  try {
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const [issuedRows] = await pool.execute(
      'SELECT COUNT(*) AS totalIssued FROM certificates WHERE issuer_id = ? AND school_id = ?',
      [req.user.profileId, schoolId]
    );

    const [revokedRows] = await pool.execute(
      'SELECT COUNT(*) AS totalRevoked FROM certificates WHERE issuer_id = ? AND school_id = ? AND status = ?',
      [req.user.profileId, schoolId, STATUS_REVOKED]
    );

    const [complaintRows] = await pool.execute(
      `SELECT COUNT(*) AS totalComplaints
       FROM complaints cp
       JOIN certificates c ON cp.certificate_id = c.id
       WHERE c.issuer_id = ? AND c.school_id = ?`,
      [req.user.profileId, schoolId]
    );

    return res.status(200).json({
      stats: {
        totalIssued: Number(issuedRows[0].totalIssued),
        totalRevoked: Number(revokedRows[0].totalRevoked),
        totalComplaints: Number(complaintRows[0].totalComplaints),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch stats', error: error.message });
  }
}

async function downloadPdf(req, res) {
  try {
    const { certNo } = req.params;
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);

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
       WHERE c.certificate_no = ? AND c.issuer_id = ? AND c.school_id = ?
       LIMIT 1`,
      [certNo, req.user.profileId, schoolId]
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

async function getComplaints(req, res) {
  try {
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    const [rows] = await pool.execute(
      `SELECT
         cp.id,
       cp.message,
       cp.response,
        cp.status,
        cp.created_at,
         c.certificate_no,
         s.name AS student_name
       FROM complaints cp
       JOIN certificates c ON cp.certificate_id = c.id
       JOIN students s ON cp.student_id = s.id
       WHERE c.issuer_id = ? AND c.school_id = ?
       ORDER BY cp.created_at DESC`,
      [req.user.profileId, schoolId]
    );

    return res.status(200).json({ complaints: rows });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch complaints', error: error.message });
  }
}

async function resolveComplaint(req, res) {
  try {
    const { complaintId } = req.params;
    const { response } = req.body || {};
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);

    if (!response || response.trim().length < 2) {
      return res.status(400).json({ message: 'response is required' });
    }

    const [rows] = await pool.execute(
      `SELECT cp.id, c.id AS certificate_id
       FROM complaints cp
       JOIN certificates c ON cp.certificate_id = c.id
       WHERE cp.id = ? AND c.issuer_id = ? AND c.school_id = ?
       LIMIT 1`,
      [complaintId, req.user.profileId, schoolId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    await pool.execute('UPDATE complaints SET status = "resolved", response = ? WHERE id = ?', [
      response.trim(),
      complaintId,
    ]);
    await logAudit({
      userId: req.user.userId,
      action: 'RESPOND_COMPLAINT',
      certificateId: rows[0].certificate_id,
      newData: { complaintId: Number(complaintId), status: 'resolved', response: response.trim() },
    });

    return res.status(200).json({ message: 'Complaint responded successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to resolve complaint', error: error.message });
  }
}

async function deleteCertificate(req, res) {
  let connection;
  try {
    const certNo = String(req.params?.certNo || '').trim();
    const schoolId = Number(req.user?.schoolId || req.user?.school_id || 0);
    console.log('[ISSUER][DELETE] request', {
      params: req.params,
      body: req.body,
      user: req.user,
      certNo,
    });

    if (!certNo) {
      return res.status(400).json({ success: false, message: 'Certificate number is required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT id, status
       FROM certificates
       WHERE certificate_no = ? AND issuer_id = ? AND school_id = ?
       LIMIT 1`,
      [certNo, req.user.profileId, schoolId]
    );
    console.log('[ISSUER][DELETE] lookup', { certNo, issuerId: req.user.profileId, rowCount: rows.length, rows });

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    await connection.execute('DELETE FROM complaints WHERE certificate_id = ?', [rows[0].id]);
    await connection.execute('UPDATE audit_logs SET certificate_id = NULL WHERE certificate_id = ?', [rows[0].id]);
    await connection.execute('DELETE FROM certificates WHERE id = ?', [rows[0].id]);
    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, certificate_id, old_data, new_data)
       VALUES (?, ?, NULL, ?, NULL)`,
      [
        req.user.userId,
        'DELETE_CERTIFICATE',
        JSON.stringify({ certificateNo: certNo, status: rows[0].status }),
      ]
    );
    await connection.commit();

    return res.status(200).json({ success: true, message: 'Certificate deleted successfully' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('[ISSUER][DELETE] ERROR:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete certificate', error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function getAuditLogs(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT
         al.id,
         al.action,
         al.certificate_id,
         al.old_data,
         al.new_data,
         al.created_at
       FROM audit_logs al
       WHERE al.user_id = ?
       ORDER BY al.created_at DESC
       LIMIT 300`,
      [req.user.userId]
    );

    return res.status(200).json({ logs: rows });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch audit logs', error: error.message });
  }
}

module.exports = {
  getStudents,
  getStudentDetails,
  issueCertificate,
  editCertificate,
  updateCertificateMarks,
  revokeCertificate,
  getIssuedCertificates,
  getDashboardStats,
  downloadPdf,
  getComplaints,
  resolveComplaint,
  deleteCertificate,
  getAuditLogs,
};
