CREATE TABLE IF NOT EXISTS schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_name VARCHAR(255) NOT NULL,
  school_no CHAR(4) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schools (school_name, school_no)
SELECT 'Legacy School', '0000'
WHERE NOT EXISTS (
  SELECT 1
  FROM schools
  WHERE school_no = '0000'
);

SET @add_admin_school_id = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admins'
        AND COLUMN_NAME = 'school_id'
    ),
    'SELECT 1',
    'ALTER TABLE admins ADD COLUMN school_id INT NULL AFTER id'
  )
);
PREPARE stmt FROM @add_admin_school_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_issuer_school_id = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'issuers'
        AND COLUMN_NAME = 'school_id'
    ),
    'SELECT 1',
    'ALTER TABLE issuers ADD COLUMN school_id INT NULL AFTER user_id'
  )
);
PREPARE stmt FROM @add_issuer_school_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_student_school_id = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'students'
        AND COLUMN_NAME = 'school_id'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN school_id INT NULL AFTER user_id'
  )
);
PREPARE stmt FROM @add_student_school_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_certificate_school_id = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'certificates'
        AND COLUMN_NAME = 'school_id'
    ),
    'SELECT 1',
    'ALTER TABLE certificates ADD COLUMN school_id INT NULL AFTER issuer_id'
  )
);
PREPARE stmt FROM @add_certificate_school_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE admins
SET school_id = (SELECT id FROM schools WHERE school_no = '0000' LIMIT 1)
WHERE school_id IS NULL;

UPDATE issuers
SET school_id = (SELECT id FROM schools WHERE school_no = '0000' LIMIT 1)
WHERE school_id IS NULL;

UPDATE students
SET school_id = (SELECT id FROM schools WHERE school_no = '0000' LIMIT 1)
WHERE school_id IS NULL;

UPDATE certificates
SET school_id = (SELECT id FROM schools WHERE school_no = '0000' LIMIT 1)
WHERE school_id IS NULL;
