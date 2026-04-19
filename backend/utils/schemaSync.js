const pool = require('../db');

async function queryValue(sql, params = [], connection = pool) {
  const [rows] = await connection.execute(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : 0;
}

async function tableExists(tableName, connection = pool) {
  const count = await queryValue(
    `SELECT COUNT(*)
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName],
    connection
  );
  return Number(count) > 0;
}

async function columnExists(tableName, columnName, connection = pool) {
  const count = await queryValue(
    `SELECT COUNT(*)
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
    connection
  );
  return Number(count) > 0;
}

async function indexExists(tableName, indexName, connection = pool) {
  const count = await queryValue(
    `SELECT COUNT(*)
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName],
    connection
  );
  return Number(count) > 0;
}

async function constraintExists(tableName, constraintName, connection = pool) {
  const count = await queryValue(
    `SELECT COUNT(*)
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?`,
    [tableName, constraintName],
    connection
  );
  return Number(count) > 0;
}

async function getForeignKeys(tableName, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tableName]
  );
  return rows;
}

async function ensureColumn(tableName, columnName, definitionSql, connection = pool) {
  if (!(await columnExists(tableName, columnName, connection))) {
    await connection.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

async function renameColumn(tableName, oldName, newName, definitionSql, connection = pool) {
  const hasOld = await columnExists(tableName, oldName, connection);
  const hasNew = await columnExists(tableName, newName, connection);

  if (hasOld && !hasNew) {
    await connection.execute(`ALTER TABLE ${tableName} CHANGE COLUMN ${oldName} ${newName} ${definitionSql}`);
  }
}

async function ensureUsersTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('users', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', connection);
  await ensureColumn('users', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', connection);
  await connection.execute('ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL');
}

async function ensureSchoolsTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schools (
      id INT AUTO_INCREMENT PRIMARY KEY,
      school_name VARCHAR(255) NOT NULL,
      school_no CHAR(4) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('schools', 'school_name', 'VARCHAR(255) NULL', connection);
  await ensureColumn('schools', 'school_no', 'CHAR(4) NULL', connection);
  await ensureColumn('schools', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', connection);
}

async function ensureAdminsTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      school_name VARCHAR(255) NOT NULL,
      admin_name VARCHAR(150) NOT NULL,
      login_id VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  if (!(await columnExists('admins', 'email', connection))) {
    await connection.execute('ALTER TABLE admins ADD COLUMN email VARCHAR(150) NULL AFTER login_id');
    await connection.execute(
      "UPDATE admins SET email = CONCAT('admin', id, '@local.admin') WHERE email IS NULL OR TRIM(email) = ''"
    );
    await connection.execute('ALTER TABLE admins MODIFY COLUMN email VARCHAR(150) NOT NULL');
  }

  await ensureColumn('admins', 'school_id', 'INT NULL', connection);
}

async function ensureIssuersTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS issuers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      admin_id INT NULL,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      institute_name VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('issuers', 'user_id', 'INT NULL UNIQUE', connection);
  await ensureColumn('issuers', 'school_id', 'INT NULL', connection);
  await ensureColumn('issuers', 'admin_id', 'INT NULL', connection);
  await ensureColumn('issuers', 'name', 'VARCHAR(150) NULL', connection);
  await ensureColumn('issuers', 'email', 'VARCHAR(150) NULL', connection);
  await ensureColumn('issuers', 'password', 'VARCHAR(255) NULL', connection);
  await ensureColumn('issuers', 'institute_name', 'VARCHAR(255) NULL', connection);
  await ensureColumn('issuers', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1', connection);
  await ensureColumn('issuers', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', connection);
}

async function ensureStudentsTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      school_id INT NULL,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      roll_number VARCHAR(60) NULL,
      roll_no VARCHAR(60) NULL,
      course VARCHAR(220) NULL,
      class_name VARCHAR(50) NULL,
      class_div VARCHAR(10) NULL,
      semester VARCHAR(20) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('students', 'user_id', 'INT NULL UNIQUE', connection);
  await ensureColumn('students', 'school_id', 'INT NULL', connection);
  await ensureColumn('students', 'name', 'VARCHAR(150) NULL', connection);
  await ensureColumn('students', 'email', 'VARCHAR(150) NULL', connection);
  await ensureColumn('students', 'password', 'VARCHAR(255) NULL', connection);
  await ensureColumn('students', 'roll_number', 'VARCHAR(60) NULL', connection);
  await ensureColumn('students', 'roll_no', 'VARCHAR(60) NULL', connection);
  await ensureColumn('students', 'course', 'VARCHAR(220) NULL', connection);
  await ensureColumn('students', 'class_name', 'VARCHAR(50) NULL', connection);
  await ensureColumn('students', 'class_div', 'VARCHAR(10) NULL', connection);
  await ensureColumn('students', 'semester', 'VARCHAR(20) NULL', connection);
  await ensureColumn('students', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', connection);

  if (await columnExists('students', 'roll_number', connection)) {
    await connection.execute(
      `UPDATE students
       SET roll_no = roll_number
       WHERE (roll_no IS NULL OR TRIM(roll_no) = '')
         AND roll_number IS NOT NULL
         AND TRIM(roll_number) <> ''`
    );
  }

  if (!(await indexExists('students', 'uq_students_roll_number', connection))) {
    await connection.execute('ALTER TABLE students ADD UNIQUE KEY uq_students_roll_number (roll_number)');
  }
  if (!(await indexExists('students', 'uq_students_roll_no', connection))) {
    await connection.execute('ALTER TABLE students ADD UNIQUE KEY uq_students_roll_no (roll_no)');
  }
}

async function ensureCertificatesTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      certificate_no VARCHAR(50) NOT NULL UNIQUE,
      student_id INT NULL,
      issuer_id INT NULL,
      school_id INT NULL,
      student_name VARCHAR(150) NULL,
      roll_no VARCHAR(60) NULL,
      student_email VARCHAR(150) NULL,
      student_class_name VARCHAR(100) NULL,
      student_class_div VARCHAR(20) NULL,
      course VARCHAR(220) NOT NULL,
      grade VARCHAR(40) NULL,
      class VARCHAR(10) NULL,
      student_type VARCHAR(20) NULL,
      semester VARCHAR(10) NULL,
      academic_year VARCHAR(40) NULL,
      certificate_type VARCHAR(120) NULL,
      remarks TEXT NULL,
      overall_percentage DECIMAL(5,2) NULL,
      issue_date DATE NULL,
      certificate_hash CHAR(64) NOT NULL,
      blockchain_tx_hash VARCHAR(255) NULL,
      ipfs_hash VARCHAR(255) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Valid',
      is_revoked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await renameColumn('certificates', 'certificate_id', 'certificate_no', 'VARCHAR(50) NOT NULL', connection);
  await renameColumn('certificates', 'hash', 'certificate_hash', 'CHAR(64) NOT NULL', connection);
  await renameColumn('certificates', 'issued_by', 'issuer_id', 'INT NULL', connection);
  await renameColumn('certificates', 'year', 'academic_year', 'VARCHAR(40) NULL', connection);

  await ensureColumn('certificates', 'student_id', 'INT NULL', connection);
  await ensureColumn('certificates', 'issuer_id', 'INT NULL', connection);
  await ensureColumn('certificates', 'school_id', 'INT NULL', connection);
  await ensureColumn('certificates', 'student_name', 'VARCHAR(150) NULL', connection);
  await ensureColumn('certificates', 'roll_no', 'VARCHAR(60) NULL', connection);
  await ensureColumn('certificates', 'student_email', 'VARCHAR(150) NULL', connection);
  await ensureColumn('certificates', 'student_class_name', 'VARCHAR(100) NULL', connection);
  await ensureColumn('certificates', 'student_class_div', 'VARCHAR(20) NULL', connection);
  await ensureColumn('certificates', 'grade', 'VARCHAR(40) NULL', connection);
  await ensureColumn('certificates', 'class', 'VARCHAR(10) NULL', connection);
  await ensureColumn('certificates', 'student_type', 'VARCHAR(20) NULL', connection);
  await ensureColumn('certificates', 'semester', 'VARCHAR(10) NULL', connection);
  await ensureColumn('certificates', 'academic_year', 'VARCHAR(40) NULL', connection);
  await ensureColumn('certificates', 'certificate_type', 'VARCHAR(120) NULL', connection);
  await ensureColumn('certificates', 'remarks', 'TEXT NULL', connection);
  await ensureColumn('certificates', 'overall_percentage', 'DECIMAL(5,2) NULL', connection);
  await ensureColumn('certificates', 'issue_date', 'DATE NULL', connection);
  await ensureColumn('certificates', 'blockchain_tx_hash', 'VARCHAR(255) NULL', connection);
  await ensureColumn('certificates', 'ipfs_hash', 'VARCHAR(255) NULL', connection);
  await ensureColumn('certificates', 'status', "VARCHAR(20) NOT NULL DEFAULT 'Valid'", connection);
  await ensureColumn('certificates', 'is_revoked', 'BOOLEAN DEFAULT FALSE', connection);
  await ensureColumn(
    'certificates',
    'updated_at',
    'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    connection
  );

  const foreignKeys = await getForeignKeys('certificates', connection);
  for (const foreignKey of foreignKeys) {
    if (foreignKey.COLUMN_NAME === 'issuer_id' && foreignKey.REFERENCED_TABLE_NAME !== 'issuers') {
      await connection.execute(`ALTER TABLE certificates DROP FOREIGN KEY ${foreignKey.CONSTRAINT_NAME}`);
    }
  }

  if (!(await indexExists('certificates', 'certificate_no', connection))) {
    await connection.execute('ALTER TABLE certificates ADD UNIQUE KEY certificate_no (certificate_no)');
  }

  await connection.execute(
    `UPDATE certificates
     SET status = 'Revoked'
     WHERE is_revoked = 1
       AND (status IS NULL OR TRIM(status) = '' OR status <> 'Revoked')`
  );
  await connection.execute(
    `UPDATE certificates
     SET status = 'Valid'
     WHERE status IS NULL OR TRIM(status) = ''`
  );
}

async function ensureSchoolLinkages(connection = pool) {
  const legacySchoolNo = '0000';
  const legacySchoolName = 'Legacy School';

  const [existingLegacyRows] = await connection.execute(
    `SELECT id
     FROM schools
     WHERE school_no = ?
     LIMIT 1`,
    [legacySchoolNo]
  );

  let legacySchoolId = existingLegacyRows[0]?.id || null;
  if (!legacySchoolId) {
    const [insertResult] = await connection.execute(
      `INSERT INTO schools (school_name, school_no)
       VALUES (?, ?)`,
      [legacySchoolName, legacySchoolNo]
    );
    legacySchoolId = insertResult.insertId;
  }

  await connection.execute(
    `UPDATE admins
     SET school_id = ?
     WHERE school_id IS NULL`,
    [legacySchoolId]
  );
  await connection.execute(
    `UPDATE issuers
     SET school_id = ?
     WHERE school_id IS NULL`,
    [legacySchoolId]
  );
  await connection.execute(
    `UPDATE students
     SET school_id = ?
     WHERE school_id IS NULL`,
    [legacySchoolId]
  );
  await connection.execute(
    `UPDATE certificates
     SET school_id = ?
     WHERE school_id IS NULL`,
    [legacySchoolId]
  );

  if (!(await constraintExists('admins', 'fk_admins_school_id', connection))) {
    await connection.execute(
      'ALTER TABLE admins ADD CONSTRAINT fk_admins_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT'
    );
  }
  if (!(await constraintExists('issuers', 'fk_issuers_school_id', connection))) {
    await connection.execute(
      'ALTER TABLE issuers ADD CONSTRAINT fk_issuers_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT'
    );
  }
  if (!(await constraintExists('students', 'fk_students_school_id', connection))) {
    await connection.execute(
      'ALTER TABLE students ADD CONSTRAINT fk_students_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT'
    );
  }
  if (!(await constraintExists('certificates', 'fk_certificates_school_id', connection))) {
    await connection.execute(
      'ALTER TABLE certificates ADD CONSTRAINT fk_certificates_school_id FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT'
    );
  }
}

async function ensureCertificateSubjectsTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS certificate_subjects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      certificate_id INT NOT NULL,
      subject_name VARCHAR(255) NOT NULL,
      marks_scored DECIMAL(7,2) NOT NULL,
      out_of DECIMAL(7,2) NOT NULL,
      subject_percentage DECIMAL(5,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureComplaintsTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      certificate_id INT NOT NULL,
      message TEXT NOT NULL,
      response TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('complaints', 'response', 'TEXT NULL', connection);
  await ensureColumn('complaints', 'status', "VARCHAR(20) NOT NULL DEFAULT 'pending'", connection);
  await ensureColumn(
    'complaints',
    'updated_at',
    'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    connection
  );
}

async function ensureAuditLogsTable(connection = pool) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      action VARCHAR(100) NOT NULL,
      certificate_id INT NULL,
      old_data TEXT NULL,
      new_data TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureApplicationSchema() {
  const connection = await pool.getConnection();
  try {
    console.info('[DB SCHEMA] Checking database schema compatibility');
    await ensureUsersTable(connection);
    await ensureSchoolsTable(connection);
    await ensureAdminsTable(connection);
    await ensureIssuersTable(connection);
    await ensureStudentsTable(connection);
    await ensureCertificatesTable(connection);
    await ensureSchoolLinkages(connection);
    await ensureCertificateSubjectsTable(connection);
    await ensureComplaintsTable(connection);
    await ensureAuditLogsTable(connection);
    console.info('[DB SCHEMA] Schema is ready');
  } finally {
    connection.release();
  }
}

module.exports = {
  ensureApplicationSchema,
};
