const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { generateUniqueUserUsername } = require('../utils/identity');
const { getSubjectsByCertificateIds } = require('../utils/certificateSubjects');
const { roundToTwo } = require('../utils/marks');
const { logAudit } = require('../utils/auditLog');

const CERTIFICATE_REVOKED = 'Revoked';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeNullable(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function isTruthyBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function createToken(admin) {
  return jwt.sign(
    {
      adminId: admin.id,
      role: 'admin',
      username: admin.admin_name,
      schoolName: admin.school_name,
      schoolId: admin.school_id,
      school_id: admin.school_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function buildAdminUser(admin) {
  return {
    id: admin.id,
    adminId: admin.id,
    role: 'admin',
    username: admin.admin_name,
    adminName: admin.admin_name,
    schoolName: admin.school_name,
    schoolNo: admin.school_no || null,
    school_id: admin.school_id,
    loginId: admin.login_id,
    dashboardRoute: '/admin-dashboard',
  };
}

function validatePassword(password, fieldName = 'password') {
  if (typeof password !== 'string' || password.length < 6) {
    return `${fieldName} must be at least 6 characters`;
  }
  return null;
}

function getAdminIdFromRequest(req) {
  return req.user?.adminId || req.user?.id || null;
}

function getSchoolIdFromRequest(req) {
  return Number(req.user?.schoolId || req.user?.school_id || 0);
}

async function adminLogin(req, res) {
  try {
    const loginId = normalizeText(req.body?.login_id);
    const password = req.body?.password;

    if (!loginId || !password) {
      return res.status(400).json({ success: false, message: 'login_id and password are required' });
    }

    const [rows] = await pool.execute(
      `SELECT id, school_name, admin_name, login_id, password, created_at
       FROM admins
       WHERE login_id = ?
       LIMIT 1`,
      [loginId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials' });
    }

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials' });
    }

    return res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token: createToken(admin),
      user: buildAdminUser(admin),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to login as admin', error: error.message });
  }
}

async function getDashboard(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const [issuerCountRows] = await pool.execute('SELECT COUNT(*) AS totalIssuers FROM issuers WHERE school_id = ?', [schoolId]);
    const [studentCountRows] = await pool.execute('SELECT COUNT(*) AS totalStudents FROM students WHERE school_id = ?', [schoolId]);
    const [certificateCountRows] = await pool.execute('SELECT COUNT(*) AS totalCertificates FROM certificates WHERE school_id = ?', [schoolId]);
    const [activeIssuerRows] = await pool.execute(
      'SELECT COUNT(*) AS totalActiveIssuers FROM issuers WHERE school_id = ? AND is_active = 1',
      [schoolId]
    );

    const [recentIssuers] = await pool.execute(
      `SELECT
         i.id,
         i.name AS issuer_name,
         i.email,
         COALESCE(i.institute_name, a.school_name) AS institute_name,
         i.is_active,
         i.created_at,
         COUNT(c.id) AS certificates_issued_count
       FROM issuers i
       LEFT JOIN admins a ON i.admin_id = a.id
       LEFT JOIN certificates c ON c.issuer_id = i.id
       WHERE i.school_id = ?
       GROUP BY i.id, i.name, i.email, i.institute_name, a.school_name, i.is_active, i.created_at
       ORDER BY i.created_at DESC
       LIMIT 5`,
      [schoolId]
    );

    const [recentStudents] = await pool.execute(
      `SELECT
         s.id,
         s.name AS student_name,
         s.email,
         s.roll_number,
         s.roll_no,
         s.course,
         s.class_name,
         s.class_div,
         s.semester,
         s.created_at,
         COUNT(c.id) AS certificates_count
       FROM students s
       LEFT JOIN certificates c ON c.student_id = s.id
       WHERE s.school_id = ?
       GROUP BY s.id, s.name, s.email, s.roll_number, s.roll_no, s.course, s.class_name, s.class_div, s.semester, s.created_at
       ORDER BY s.created_at DESC
       LIMIT 5`,
      [schoolId]
    );

    const [recentCertificates] = await pool.execute(
      `SELECT
         c.id,
         c.certificate_no,
         c.course,
         c.certificate_type,
         c.issue_date,
         c.status,
         c.certificate_hash,
         c.blockchain_tx_hash,
         s.name AS student_name,
         i.name AS issuer_name
       FROM certificates c
       JOIN students s ON c.student_id = s.id
       JOIN issuers i ON c.issuer_id = i.id
       WHERE c.school_id = ?
       ORDER BY c.created_at DESC
       LIMIT 5`,
      [schoolId]
    );

    return res.status(200).json({
      success: true,
      stats: {
        totalIssuers: Number(issuerCountRows[0]?.totalIssuers || 0),
        totalStudents: Number(studentCountRows[0]?.totalStudents || 0),
        totalCertificates: Number(certificateCountRows[0]?.totalCertificates || 0),
        totalActiveIssuers: Number(activeIssuerRows[0]?.totalActiveIssuers || 0),
      },
      recentIssuers,
      recentStudents,
      recentCertificates,
      profile: {
        adminName: req.user?.username || null,
        schoolName: req.user?.schoolName || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load admin dashboard', error: error.message });
  }
}

async function getIssuers(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const search = normalizeText(req.query?.search);
    const likeSearch = `%${search}%`;
    const params = [schoolId];
    let whereClause = 'WHERE i.school_id = ?';

    if (search) {
      whereClause += `
        AND (
          i.name LIKE ?
          OR i.email LIKE ?
          OR COALESCE(i.institute_name, '') LIKE ?
          OR u.username LIKE ?
        )
      `;
      params.push(likeSearch, likeSearch, likeSearch, likeSearch);
    }

    const [rows] = await pool.execute(
      `SELECT
         i.id,
         i.name AS issuer_name,
         i.email,
         u.username,
         i.institute_name,
         i.is_active,
         i.admin_id,
         i.created_at,
         COUNT(c.id) AS certificates_issued_count
       FROM issuers i
       JOIN users u ON i.user_id = u.id
       LEFT JOIN certificates c ON c.issuer_id = i.id
       ${whereClause}
       GROUP BY i.id, i.name, i.email, u.username, i.institute_name, i.is_active, i.admin_id, i.created_at
       ORDER BY i.created_at DESC`,
      params
    );

    return res.status(200).json({ success: true, issuers: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch issuers', error: error.message });
  }
}

async function getIssuerDetails(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const issuerId = normalizeInteger(req.params?.id);
    if (!issuerId) {
      return res.status(400).json({ success: false, message: 'Invalid issuer id' });
    }

    const [rows] = await pool.execute(
      `SELECT
         i.id,
         i.user_id,
         i.name AS issuer_name,
         i.email,
         u.username,
         i.institute_name,
         i.is_active,
         i.admin_id,
         i.created_at,
         COUNT(c.id) AS certificates_issued_count
       FROM issuers i
       JOIN users u ON i.user_id = u.id
       LEFT JOIN certificates c ON c.issuer_id = i.id
       WHERE i.id = ? AND i.school_id = ?
       GROUP BY i.id, i.user_id, i.name, i.email, u.username, i.institute_name, i.is_active, i.admin_id, i.created_at`,
      [issuerId, schoolId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Issuer not found' });
    }

    const [recentCertificates] = await pool.execute(
      `SELECT
         c.id,
         c.certificate_no,
         c.course,
         c.issue_date,
         c.status,
         s.name AS student_name
       FROM certificates c
       JOIN students s ON c.student_id = s.id
       WHERE c.issuer_id = ? AND c.school_id = ?
       ORDER BY c.created_at DESC
       LIMIT 10`,
      [issuerId, schoolId]
    );

    return res.status(200).json({ success: true, issuer: { ...rows[0], recentCertificates } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch issuer details', error: error.message });
  }
}

async function createIssuer(req, res) {
  let connection;
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const issuerName = normalizeText(req.body?.issuer_name);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const instituteName = normalizeNullable(req.body?.institute_name || req.body?.school_name);
    const isActive = req.body?.is_active === undefined ? true : isTruthyBoolean(req.body?.is_active);

    if (!issuerName || !email || !password) {
      return res.status(400).json({ success: false, message: 'issuer_name, email, and password are required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existingUser] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    const [existingIssuer] = await connection.execute('SELECT id FROM issuers WHERE email = ? LIMIT 1', [email]);
    console.info('[ADMIN][CREATE_ISSUER] Existing user rows', existingUser);
    console.info('[ADMIN][CREATE_ISSUER] Existing issuer rows', existingIssuer);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Issuer already exists with this email' });
    }
    if (existingIssuer.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Issuer already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const generatedUsername = await generateUniqueUserUsername('issuer', connection);
    console.info('[ADMIN][CREATE_ISSUER] Generated internal username', generatedUsername);
    const [userInsert] = await connection.execute(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [generatedUsername, email, hashedPassword, 'issuer']
    );

    const [issuerInsert] = await connection.execute(
      `INSERT INTO issuers (user_id, school_id, admin_id, name, email, password, institute_name, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userInsert.insertId, schoolId, getAdminIdFromRequest(req), issuerName, email, hashedPassword, instituteName, isActive ? 1 : 0]
    );

    await connection.commit();

    await logAudit({
      action: 'ADMIN_CREATE_ISSUER',
      newData: { issuerId: issuerInsert.insertId, issuerName, email, instituteName, isActive },
    });

    return res.status(201).json({
      success: true,
      message: 'Issuer created successfully',
      issuer: {
        id: issuerInsert.insertId,
        issuer_name: issuerName,
        email,
        institute_name: instituteName,
        is_active: isActive ? 1 : 0,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return res.status(500).json({ success: false, message: 'Failed to create issuer', error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function updateIssuer(req, res) {
  let connection;
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const issuerId = normalizeInteger(req.params?.id);
    const issuerName = normalizeText(req.body?.issuer_name);
    const email = normalizeEmail(req.body?.email);
    const instituteName = normalizeNullable(req.body?.institute_name || req.body?.school_name);
    const password = req.body?.password;

    if (!issuerId) {
      return res.status(400).json({ success: false, message: 'Invalid issuer id' });
    }
    if (!issuerName || !email) {
      return res.status(400).json({ success: false, message: 'issuer_name and email are required' });
    }

    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ success: false, message: passwordError });
      }
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [issuerRows] = await connection.execute(
      'SELECT id, user_id, school_id, name, email, institute_name, is_active FROM issuers WHERE id = ? AND school_id = ? LIMIT 1',
      [issuerId, schoolId]
    );

    if (issuerRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Issuer not found' });
    }

    const issuer = issuerRows[0];
    const [conflictRows] = await connection.execute(
      'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
      [email, issuer.user_id]
    );
    if (conflictRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    await connection.execute('UPDATE users SET username = ?, email = ? WHERE id = ?', [email, email, issuer.user_id]);

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, issuer.user_id]);
      await connection.execute(
        'UPDATE issuers SET name = ?, email = ?, password = ?, institute_name = ? WHERE id = ?',
        [issuerName, email, hashedPassword, instituteName, issuerId]
      );
    } else {
      await connection.execute(
        'UPDATE issuers SET name = ?, email = ?, institute_name = ? WHERE id = ?',
        [issuerName, email, instituteName, issuerId]
      );
    }

    await connection.commit();

    await logAudit({
      action: 'ADMIN_UPDATE_ISSUER',
      oldData: issuer,
      newData: { issuerId, issuerName, email, instituteName, passwordUpdated: Boolean(password) },
    });

    return res.status(200).json({ success: true, message: 'Issuer updated successfully' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return res.status(500).json({ success: false, message: 'Failed to update issuer', error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function deleteIssuer(req, res) {
  let connection;
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const issuerId = normalizeInteger(req.params?.id);
    if (!issuerId) {
      return res.status(400).json({ success: false, message: 'Invalid issuer id' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT id, user_id, name, email FROM issuers WHERE id = ? AND school_id = ? LIMIT 1',
      [issuerId, schoolId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Issuer not found' });
    }

    await connection.execute('DELETE FROM users WHERE id = ?', [rows[0].user_id]);
    await connection.commit();

    await logAudit({
      action: 'ADMIN_DELETE_ISSUER',
      oldData: rows[0],
    });

    return res.status(200).json({ success: true, message: 'Issuer deleted successfully' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return res.status(500).json({ success: false, message: 'Failed to delete issuer', error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function updateIssuerStatus(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const issuerId = normalizeInteger(req.params?.id);
    const isActive = isTruthyBoolean(req.body?.is_active);

    if (!issuerId) {
      return res.status(400).json({ success: false, message: 'Invalid issuer id' });
    }

    const [rows] = await pool.execute('SELECT id, is_active FROM issuers WHERE id = ? AND school_id = ? LIMIT 1', [issuerId, schoolId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Issuer not found' });
    }

    await pool.execute('UPDATE issuers SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, issuerId]);

    await logAudit({
      action: 'ADMIN_UPDATE_ISSUER_STATUS',
      oldData: { issuerId, is_active: rows[0].is_active },
      newData: { issuerId, is_active: isActive ? 1 : 0 },
    });

    return res.status(200).json({ success: true, message: `Issuer ${isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update issuer status', error: error.message });
  }
}

async function getStudents(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const search = normalizeText(req.query?.search);
    const params = [schoolId];
    let whereClause = 'WHERE s.school_id = ?';

    if (search) {
      const likeSearch = `%${search}%`;
      whereClause += `
        AND (
          s.name LIKE ?
          OR s.email LIKE ?
          OR COALESCE(s.roll_number, '') LIKE ?
          OR COALESCE(s.course, '') LIKE ?
          OR COALESCE(s.class_name, '') LIKE ?
          OR COALESCE(s.semester, '') LIKE ?
          OR COALESCE(c.certificate_no, '') LIKE ?
        )
      `;
      params.push(likeSearch, likeSearch, likeSearch, likeSearch, likeSearch, likeSearch, likeSearch);
    }

    const [rows] = await pool.execute(
      `SELECT
         s.id,
         s.name AS student_name,
         s.email,
         s.roll_number,
         s.roll_no,
         s.course,
         s.class_name,
         s.class_div,
         s.semester,
         s.created_at,
         COUNT(DISTINCT c.id) AS certificates_count
       FROM students s
       LEFT JOIN certificates c ON c.student_id = s.id
       ${whereClause}
       GROUP BY s.id, s.name, s.email, s.roll_number, s.course, s.class_name, s.semester, s.created_at
       ORDER BY s.created_at DESC`,
      params
    );

    return res.status(200).json({ success: true, students: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch students', error: error.message });
  }
}

async function getStudentDetails(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const studentId = normalizeInteger(req.params?.id);
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Invalid student id' });
    }

    const [rows] = await pool.execute(
      `SELECT
         s.id,
         s.user_id,
         s.name AS student_name,
         s.email,
         s.roll_number,
         s.course,
         s.class_name,
         s.semester,
         s.created_at
       FROM students s
       WHERE s.id = ? AND s.school_id = ?
       LIMIT 1`,
      [studentId, schoolId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const [certificates] = await pool.execute(
      `SELECT
         c.id,
         c.certificate_no,
         c.course,
         c.certificate_type,
         c.issue_date,
         c.status,
         c.certificate_hash,
         c.blockchain_tx_hash,
         i.name AS issuer_name
       FROM certificates c
       JOIN issuers i ON c.issuer_id = i.id
       WHERE c.student_id = ? AND c.school_id = ?
       ORDER BY c.created_at DESC`,
      [studentId, schoolId]
    );

    return res.status(200).json({ success: true, student: { ...rows[0], certificates } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch student details', error: error.message });
  }
}

async function createStudent(req, res) {
  let connection;
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const studentName = normalizeText(req.body?.student_name);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const rollNumber = normalizeNullable(req.body?.roll_number);
    const course = normalizeNullable(req.body?.course);
    const className = normalizeNullable(req.body?.class_name || req.body?.class);
    const classDiv = normalizeNullable(req.body?.class_div);
    const semester = normalizeNullable(req.body?.semester);

    if (!studentName || !email || !password || !rollNumber) {
      return res.status(400).json({ success: false, message: 'student_name, email, password, and roll_number are required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existingUser] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    const [existingStudent] = await connection.execute('SELECT id FROM students WHERE email = ? LIMIT 1', [email]);
    console.info('[ADMIN][CREATE_STUDENT] Existing user rows', existingUser);
    console.info('[ADMIN][CREATE_STUDENT] Existing student rows', existingStudent);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Student already exists with this email' });
    }
    if (existingStudent.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Student already exists with this email' });
    }

    const [rollConflict] = await connection.execute(
      'SELECT id FROM students WHERE school_id = ? AND roll_number = ? LIMIT 1',
      [schoolId, rollNumber]
    );
    if (rollConflict.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Roll number is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const generatedUsername = await generateUniqueUserUsername('student', connection);
    console.info('[ADMIN][CREATE_STUDENT] Generated internal username', generatedUsername);
    const [userInsert] = await connection.execute(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [generatedUsername, email, hashedPassword, 'student']
    );

    const [studentInsert] = await connection.execute(
      `INSERT INTO students (user_id, school_id, name, email, password, roll_number, roll_no, course, class_name, class_div, semester)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userInsert.insertId, schoolId, studentName, email, hashedPassword, rollNumber, rollNumber, course, className, classDiv, semester]
    );

    await connection.commit();

    await logAudit({
      action: 'ADMIN_CREATE_STUDENT',
      newData: { studentId: studentInsert.insertId, studentName, email, rollNumber, course, className, classDiv, semester, schoolId },
    });

    return res.status(201).json({
      success: true,
      message: 'Student created successfully',
      student: {
        id: studentInsert.insertId,
        student_name: studentName,
        email,
        roll_number: rollNumber,
        roll_no: rollNumber,
        course,
        class_name: className,
        class_div: classDiv,
        semester,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return res.status(500).json({ success: false, message: 'Failed to create student', error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function updateStudent(req, res) {
  let connection;
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const studentId = normalizeInteger(req.params?.id);
    const studentName = normalizeText(req.body?.student_name);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const rollNumber = normalizeNullable(req.body?.roll_number);
    const course = normalizeNullable(req.body?.course);
    const className = normalizeNullable(req.body?.class_name || req.body?.class);
    const classDiv = normalizeNullable(req.body?.class_div);
    const semester = normalizeNullable(req.body?.semester);

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Invalid student id' });
    }
    if (!studentName || !email || !rollNumber) {
      return res.status(400).json({ success: false, message: 'student_name, email, and roll_number are required' });
    }

    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ success: false, message: passwordError });
      }
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [studentRows] = await connection.execute(
      `SELECT id, user_id, school_id, name, email, roll_number, course, class_name, class_div, semester
       FROM students
       WHERE id = ? AND school_id = ?
       LIMIT 1`,
      [studentId, schoolId]
    );

    if (studentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = studentRows[0];
    const [emailConflict] = await connection.execute(
      'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
      [email, student.user_id]
    );
    if (emailConflict.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const [rollConflict] = await connection.execute(
      'SELECT id FROM students WHERE school_id = ? AND roll_number = ? AND id <> ? LIMIT 1',
      [schoolId, rollNumber, studentId]
    );
    if (rollConflict.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Roll number is already registered' });
    }

    await connection.execute('UPDATE users SET username = ?, email = ? WHERE id = ?', [email, email, student.user_id]);

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, student.user_id]);
      await connection.execute(
        `UPDATE students
         SET name = ?, email = ?, password = ?, roll_number = ?, course = ?, class_name = ?, semester = ?
         WHERE id = ?`,
        [studentName, email, hashedPassword, rollNumber, course, className, semester, studentId]
      );
      await connection.execute('UPDATE students SET roll_no = ?, class_div = ? WHERE id = ?', [rollNumber, classDiv, studentId]);
    } else {
      await connection.execute(
        `UPDATE students
         SET name = ?, email = ?, roll_number = ?, course = ?, class_name = ?, semester = ?
         WHERE id = ?`,
        [studentName, email, rollNumber, course, className, semester, studentId]
      );
      await connection.execute('UPDATE students SET roll_no = ?, class_div = ? WHERE id = ?', [rollNumber, classDiv, studentId]);
    }

    await connection.commit();

    await logAudit({
      action: 'ADMIN_UPDATE_STUDENT',
      oldData: student,
      newData: { studentId, studentName, email, rollNumber, course, className, classDiv, semester, passwordUpdated: Boolean(password) },
    });

    return res.status(200).json({ success: true, message: 'Student updated successfully' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return res.status(500).json({ success: false, message: 'Failed to update student', error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function deleteStudent(req, res) {
  let connection;
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const studentId = normalizeInteger(req.params?.id);
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Invalid student id' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT id, user_id, name, email, roll_number FROM students WHERE id = ? AND school_id = ? LIMIT 1',
      [studentId, schoolId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    await connection.execute('DELETE FROM users WHERE id = ?', [rows[0].user_id]);
    await connection.commit();

    await logAudit({
      action: 'ADMIN_DELETE_STUDENT',
      oldData: rows[0],
    });

    return res.status(200).json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return res.status(500).json({ success: false, message: 'Failed to delete student', error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function getCertificates(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const search = normalizeText(req.query?.search);
    const status = normalizeText(req.query?.status);
    const conditions = [];
    const params = [];

    conditions.push('c.school_id = ?');
    params.push(schoolId);

    if (search) {
      const likeSearch = `%${search}%`;
      conditions.push('(c.certificate_no LIKE ? OR s.name LIKE ? OR i.name LIKE ?)');
      params.push(likeSearch, likeSearch, likeSearch);
    }

    if (status) {
      conditions.push('c.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(
      `SELECT
         c.id,
         c.certificate_no,
         c.course,
         c.certificate_type,
         c.issue_date,
         c.status,
         c.certificate_hash,
         c.blockchain_tx_hash,
         c.ipfs_hash,
         c.overall_percentage,
         s.id AS student_id,
         s.name AS student_name,
         s.roll_number,
         i.id AS issuer_id,
         i.name AS issuer_name
       FROM certificates c
       JOIN students s ON c.student_id = s.id
       JOIN issuers i ON c.issuer_id = i.id
       ${whereClause}
       ORDER BY c.created_at DESC`,
      params
    );

    const certificates = rows.map((row) => ({
      ...row,
      overall_percentage: row.overall_percentage === null ? null : roundToTwo(row.overall_percentage),
    }));

    return res.status(200).json({ success: true, certificates });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch certificates', error: error.message });
  }
}

async function getCertificateDetails(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const certificateId = normalizeInteger(req.params?.id);
    if (!certificateId) {
      return res.status(400).json({ success: false, message: 'Invalid certificate id' });
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
         c.roll_no,
         c.academic_year,
         c.certificate_type,
         c.remarks,
         c.overall_percentage,
         c.issue_date,
         c.status,
         c.certificate_hash,
         c.blockchain_tx_hash,
         c.ipfs_hash,
         c.created_at,
         s.id AS student_id,
         s.name AS student_name,
         s.email AS student_email,
         s.roll_number,
         s.course AS student_course,
         s.class_name,
         s.class_div,
         s.semester AS student_semester,
         i.id AS issuer_id,
         i.name AS issuer_name,
         i.email AS issuer_email,
         i.institute_name
       FROM certificates c
       JOIN students s ON c.student_id = s.id
       JOIN issuers i ON c.issuer_id = i.id
       WHERE c.id = ? AND c.school_id = ?
       LIMIT 1`,
      [certificateId, schoolId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    const subjectsByCertificateId = await getSubjectsByCertificateIds([certificateId]);
    const certificate = {
      ...rows[0],
      overall_percentage: rows[0].overall_percentage === null ? null : roundToTwo(rows[0].overall_percentage),
      subjects: subjectsByCertificateId[certificateId] || [],
    };

    return res.status(200).json({ success: true, certificate });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch certificate details', error: error.message });
  }
}

async function revokeCertificate(req, res) {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    const certificateId = normalizeInteger(req.params?.id);
    if (!certificateId) {
      return res.status(400).json({ success: false, message: 'Invalid certificate id' });
    }

    const [rows] = await pool.execute(
      'SELECT id, status FROM certificates WHERE id = ? AND school_id = ? LIMIT 1',
      [certificateId, schoolId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    if (rows[0].status === CERTIFICATE_REVOKED) {
      return res.status(409).json({ success: false, message: 'Certificate is already revoked' });
    }

    await pool.execute(
      'UPDATE certificates SET status = ?, is_revoked = TRUE WHERE id = ?',
      [CERTIFICATE_REVOKED, certificateId]
    );

    await logAudit({
      action: 'ADMIN_REVOKE_CERTIFICATE',
      certificateId,
      oldData: { status: rows[0].status },
      newData: { status: CERTIFICATE_REVOKED },
    });

    return res.status(200).json({ success: true, message: 'Certificate revoked successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to revoke certificate', error: error.message });
  }
}

module.exports = {
  adminLogin,
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
};
