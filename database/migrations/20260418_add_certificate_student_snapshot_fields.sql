SET @add_certificate_student_email = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'certificates'
        AND COLUMN_NAME = 'student_email'
    ),
    'SELECT 1',
    'ALTER TABLE certificates ADD COLUMN student_email VARCHAR(150) NULL AFTER roll_no'
  )
);

PREPARE stmt FROM @add_certificate_student_email;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_certificate_student_class_name = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'certificates'
        AND COLUMN_NAME = 'student_class_name'
    ),
    'SELECT 1',
    'ALTER TABLE certificates ADD COLUMN student_class_name VARCHAR(100) NULL AFTER student_email'
  )
);

PREPARE stmt FROM @add_certificate_student_class_name;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_certificate_student_class_div = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'certificates'
        AND COLUMN_NAME = 'student_class_div'
    ),
    'SELECT 1',
    'ALTER TABLE certificates ADD COLUMN student_class_div VARCHAR(20) NULL AFTER student_class_name'
  )
);

PREPARE stmt FROM @add_certificate_student_class_div;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
