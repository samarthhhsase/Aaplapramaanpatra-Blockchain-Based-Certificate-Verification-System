SET @add_student_roll_no = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'students'
        AND COLUMN_NAME = 'roll_no'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN roll_no VARCHAR(60) NULL AFTER roll_number'
  )
);

PREPARE stmt FROM @add_student_roll_no;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_student_class_div = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'students'
        AND COLUMN_NAME = 'class_div'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN class_div VARCHAR(10) NULL AFTER class_name'
  )
);

PREPARE stmt FROM @add_student_class_div;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE students
SET roll_no = roll_number
WHERE (roll_no IS NULL OR TRIM(roll_no) = '')
  AND roll_number IS NOT NULL
  AND TRIM(roll_number) <> '';

SET @add_student_roll_no_unique = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'students'
        AND INDEX_NAME = 'uq_students_roll_no'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD UNIQUE KEY uq_students_roll_no (roll_no)'
  )
);

PREPARE stmt FROM @add_student_roll_no_unique;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
