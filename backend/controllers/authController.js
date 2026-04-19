const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { generateUniqueUserUsername } = require('../utils/identity');
const {
  resolveSchoolForUserRegistration,
} = require('../utils/schools');

function dashboardPathForRole(role) {
  if (role === 'admin') return '/admin-dashboard';
  return role === 'issuer' ? '/issuer-dashboard' : '/student-dashboard';
}

// Get profile ID from role-specific table
async function getProfileIdByRole(connection, userId, role) {
  if (role === 'issuer') {
    const [rows] = await connection.execute('SELECT id FROM issuers WHERE user_id = ? LIMIT 1', [userId]);
    return rows[0]?.id || null;
  }
  if (role === 'student') {
    const [rows] = await connection.execute('SELECT id FROM students WHERE user_id = ? LIMIT 1', [userId]);
    return rows[0]?.id || null;
  }
  return null;
}

function profileTableForRole(role) {
  if (role === 'issuer') return 'issuers';
  if (role === 'student') return 'students';
  return null;
}

// REGISTER
async function register(req, res) {
  let connection;
  try {
    const { name, username, email, password, role, roll_no, class_name, class_div, school_id, school_name, school_no } = req.body || {};
    const normalizedName = (name || username || '').trim();
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedRole = (role || 'student').trim().toLowerCase();
    const normalizedRollNo = String(roll_no || '').trim();
    const normalizedClassName = String(class_name || '').trim();
    const normalizedClassDiv = String(class_div || '').trim().toUpperCase();
    const normalizedSchoolId = Number(school_id);
    console.info(`[AUTH][REGISTER][${normalizedRole || 'unknown'}] request`, {
      name: normalizedName,
      email: normalizedEmail,
      role: normalizedRole,
      roll_no: normalizedRollNo,
      class_name: normalizedClassName,
      class_div: normalizedClassDiv,
      school_id: normalizedSchoolId || null,
      school_name: String(school_name || '').trim(),
      school_no: String(school_no || '').trim(),
    });

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    if (!['issuer', 'student'].includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: 'Role must be issuer or student' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    if (
      normalizedRole === 'student' &&
      (!normalizedRollNo || !normalizedClassName || !normalizedClassDiv)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Roll number, class name, and class division are required for student registration',
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let school;
    try {
      school = await resolveSchoolForUserRegistration(connection, {
        schoolId: normalizedSchoolId,
        schoolName: school_name,
        schoolNo: school_no,
      });
    } catch (schoolError) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: schoolError.message });
    }

    if (!school) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: normalizedRole === 'issuer'
          ? 'School not found. Please contact admin or select a listed school.'
          : 'School not found. Please contact your school admin.',
      });
    }

    // Check if email already exists in users table
    const [existingUsers] = await connection.execute('SELECT id, email, role FROM users WHERE email = ? LIMIT 5', [normalizedEmail]);
    const [existingRoleRows] = await connection.execute(
      normalizedRole === 'issuer'
        ? 'SELECT id, email FROM issuers WHERE email = ? LIMIT 5'
        : 'SELECT id, email FROM students WHERE email = ? LIMIT 5',
      [normalizedEmail]
    );
    console.info(`[AUTH][REGISTER][${normalizedRole}] Existing user rows`, existingUsers);
    console.info(`[AUTH][REGISTER][${normalizedRole}] Existing role rows`, existingRoleRows);

    if (existingUsers.length > 0 || existingRoleRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: normalizedRole === 'issuer'
          ? 'Issuer already exists with this email'
          : 'Student already exists with this email',
      });
    }

    if (normalizedRole === 'student') {
      const [rollConflict] = await connection.execute(
        'SELECT id, roll_number, roll_no FROM students WHERE school_id = ? AND (roll_number = ? OR roll_no = ?) LIMIT 5',
        [school.id, normalizedRollNo, normalizedRollNo]
      );
      console.info('[AUTH][REGISTER][student] Existing student roll rows', rollConflict);
      if (rollConflict.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Roll number is already registered' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const generatedUsername = await generateUniqueUserUsername(normalizedRole, connection);
    console.info(`[AUTH][REGISTER][${normalizedRole}] Generated internal username`, generatedUsername);

    // Insert into users
    const [userInsert] = await connection.execute(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [generatedUsername, normalizedEmail, hashedPassword, normalizedRole]
    );
    const userId = userInsert.insertId;

    // Insert into role-specific table with user_id
    if (normalizedRole === 'issuer') {
      await connection.execute(
        'INSERT INTO issuers (user_id, school_id, name, email, password, institute_name) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, school.id, normalizedName, normalizedEmail, hashedPassword, school.school_name]
      );
    } else {
      await connection.execute(
        `INSERT INTO students (user_id, school_id, name, email, password, roll_number, roll_no, class_name, class_div)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          school.id,
          normalizedName,
          normalizedEmail,
          hashedPassword,
          normalizedRollNo,
          normalizedRollNo,
          normalizedClassName,
          normalizedClassDiv,
        ]
      );
    }

    await connection.commit();

    const profileId = await getProfileIdByRole(connection, userId, normalizedRole);
    const token = jwt.sign(
      {
        userId,
        username: normalizedName,
        role: normalizedRole,
        profileId,
        schoolId: school.id,
        school_id: school.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: userId,
        username: normalizedName,
        email: normalizedEmail,
        role: normalizedRole,
        profileId,
        school_id: school.id,
        school_name: school.school_name,
        school_no: school.school_no,
        roll_no: normalizedRole === 'student' ? normalizedRollNo : null,
        class_name: normalizedRole === 'student' ? normalizedClassName : null,
        class_div: normalizedRole === 'student' ? normalizedClassDiv : null,
        dashboardRoute: dashboardPathForRole(normalizedRole),
      },
      token,
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[AUTH][REGISTER] ERROR:', error);
    return res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  } finally {
    if (connection) connection.release();
  }
}

// LOGIN
async function login(req, res) {
  try {
    const { email, password, role } = req.body || {};
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedRole = (role || '').trim().toLowerCase();

    if (!normalizedEmail || !password || !normalizedRole) {
      return res.status(400).json({ success: false, message: 'Email, password, and role are required' });
    }

    const tableName = profileTableForRole(normalizedRole);
    if (!tableName) {
      return res.status(400).json({ success: false, message: 'Role must be issuer or student' });
    }

    const query = `
      SELECT
        p.id AS profile_id,
        p.user_id,
        p.name,
        p.email,
        p.password,
        p.school_id,
        s.school_name,
        s.school_no
      FROM ${tableName} p
      JOIN schools s ON p.school_id = s.id
      WHERE p.email = ?
      LIMIT 1
    `;
    const [rows] = await pool.execute(query, [normalizedEmail]);
    const user = rows[0];

    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Wrong password' });

    const token = jwt.sign(
      {
        userId: user.user_id,
        username: user.name,
        role: normalizedRole,
        profileId: user.profile_id,
        schoolId: user.school_id,
        school_id: user.school_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      role: normalizedRole,
      token,
      user: {
        id: user.user_id,
        name: user.name,
        email: user.email,
        role: normalizedRole,
        profileId: user.profile_id,
        school_id: user.school_id,
        school_name: user.school_name,
        school_no: user.school_no,
        dashboardRoute: dashboardPathForRole(normalizedRole),
      },
    });

  } catch (error) {
    console.error('[AUTH][LOGIN] ERROR:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
}

// ME
async function me(req, res) {
  try {
    const { role, userId, adminId, id, schoolId } = req.user;
    if (role === 'admin') {
      const [adminRows] = await pool.execute(
        `SELECT a.id, a.school_name, a.admin_name, a.login_id, a.school_id, s.school_no
         FROM admins a
         JOIN schools s ON a.school_id = s.id
         WHERE a.id = ?
         LIMIT 1`,
        [adminId || id]
      );
      const admin = adminRows[0];
      if (!admin) return res.status(404).json({ message: 'Admin not found' });

      return res.status(200).json({
        user: {
          id: admin.id,
          username: admin.admin_name,
          adminName: admin.admin_name,
          schoolName: admin.school_name,
          schoolNo: admin.school_no,
          school_id: admin.school_id,
          loginId: admin.login_id,
          role: 'admin',
          dashboardRoute: dashboardPathForRole('admin'),
        },
      });
    }

    const tableName = profileTableForRole(role);
    if (!tableName) {
      return res.status(400).json({ message: 'Role must be issuer or student' });
    }

    const [rows] = await pool.execute(
      `SELECT
         p.id AS profile_id,
         p.user_id,
         p.name,
         p.email,
         p.school_id,
         s.school_name,
         s.school_no
       FROM ${tableName} p
       JOIN schools s ON p.school_id = s.id
       WHERE p.user_id = ? AND p.school_id = ?
       LIMIT 1`,
      [userId, schoolId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({
      user: {
        id: user.user_id,
        username: user.name,
        email: user.email,
        role,
        school_id: user.school_id,
        school_name: user.school_name,
        school_no: user.school_no,
        dashboardRoute: dashboardPathForRole(role),
      },
    });
  } catch (error) {
    console.error('[AUTH][ME] ERROR:', error);
    return res.status(500).json({ message: 'Failed to fetch user profile', error: error.message });
  }
}

module.exports = { register, login, me };
