const pool = require('../db');

function normalizeSchoolName(value) {
  return String(value || '').trim();
}

function normalizeSchoolNo(value) {
  return String(value || '').trim();
}

function validateSchoolInput({ schoolName, schoolNo }) {
  const normalizedSchoolName = normalizeSchoolName(schoolName);
  const normalizedSchoolNo = normalizeSchoolNo(schoolNo);

  if (!normalizedSchoolName || !normalizedSchoolNo) {
    return { error: 'school_name and school_no are required' };
  }

  if (!/^\d{4}$/.test(normalizedSchoolNo)) {
    return { error: 'school_no must be exactly 4 digits' };
  }

  return {
    schoolName: normalizedSchoolName,
    schoolNo: normalizedSchoolNo,
  };
}

async function findSchoolByNo(connection, schoolNo) {
  const executor = connection || pool;
  const [rows] = await executor.execute(
    `SELECT id, school_name, school_no
     FROM schools
     WHERE school_no = ?
     LIMIT 1`,
    [schoolNo]
  );
  return rows[0] || null;
}

async function findSchoolById(connection, schoolId) {
  const executor = connection || pool;
  const [rows] = await executor.execute(
    `SELECT id, school_name, school_no
     FROM schools
     WHERE id = ?
     LIMIT 1`,
    [schoolId]
  );
  return rows[0] || null;
}

async function listRegisteredSchools(connection) {
  const executor = connection || pool;
  const [rows] = await executor.execute(
    `SELECT id, school_name, school_no
     FROM schools
     WHERE school_no <> '0000'
     ORDER BY school_name ASC, school_no ASC`
  );
  return rows;
}

function schoolNamesMatch(left, right) {
  return normalizeSchoolName(left).toLowerCase() === normalizeSchoolName(right).toLowerCase();
}

async function getExistingSchoolForRegistration(connection, schoolName, schoolNo) {
  const validated = validateSchoolInput({ schoolName, schoolNo });
  if (validated.error) {
    throw new Error(validated.error);
  }

  const school = await findSchoolByNo(connection, validated.schoolNo);
  if (!school) {
    return null;
  }

  if (!schoolNamesMatch(school.school_name, validated.schoolName)) {
    throw new Error('School name does not match the provided school number');
  }

  return school;
}

async function resolveSchoolForUserRegistration(connection, { schoolId, schoolName, schoolNo }) {
  const normalizedSchoolId = Number(schoolId);

  if (Number.isInteger(normalizedSchoolId) && normalizedSchoolId > 0) {
    const school = await findSchoolById(connection, normalizedSchoolId);
    if (!school || school.school_no === '0000') {
      throw new Error('Selected school was not found');
    }
    return school;
  }

  const validated = validateSchoolInput({ schoolName, schoolNo });
  if (validated.error) {
    throw new Error(validated.error);
  }

  const school = await getExistingSchoolForRegistration(connection, validated.schoolName, validated.schoolNo);
  if (!school || school.school_no === '0000') {
    return null;
  }

  return school;
}

async function ensureSchoolForAdminRegistration(connection, schoolName, schoolNo) {
  const validated = validateSchoolInput({ schoolName, schoolNo });
  if (validated.error) {
    throw new Error(validated.error);
  }

  const existingSchool = await findSchoolByNo(connection, validated.schoolNo);
  if (existingSchool) {
    if (!schoolNamesMatch(existingSchool.school_name, validated.schoolName)) {
      throw new Error('School number is already mapped to a different school');
    }
    return existingSchool;
  }

  const [insertResult] = await connection.execute(
    `INSERT INTO schools (school_name, school_no)
     VALUES (?, ?)`,
    [validated.schoolName, validated.schoolNo]
  );

  return {
    id: insertResult.insertId,
    school_name: validated.schoolName,
    school_no: validated.schoolNo,
  };
}

module.exports = {
  normalizeSchoolName,
  normalizeSchoolNo,
  validateSchoolInput,
  findSchoolByNo,
  findSchoolById,
  listRegisteredSchools,
  getExistingSchoolForRegistration,
  resolveSchoolForUserRegistration,
  ensureSchoolForAdminRegistration,
};
