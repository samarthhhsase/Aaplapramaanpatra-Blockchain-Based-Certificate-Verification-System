function roundToTwo(value) {
  return Number(Number(value).toFixed(2));
}

function normalizeSubjects(subjects) {
  if (!Array.isArray(subjects)) {
    throw new Error('subjects must be an array');
  }

  if (subjects.length === 0) {
    throw new Error('At least one subject is required');
  }

  return subjects.map((subject, index) => {
    const subjectName = String(subject?.subject_name || '').trim();
    const marksScored = Number(subject?.marks_scored);
    const outOf = Number(subject?.out_of);

    if (!subjectName) {
      throw new Error(`Subject name is required for row ${index + 1}`);
    }
    if (!Number.isFinite(marksScored) || marksScored < 0) {
      throw new Error(`marks_scored must be a non-negative number for ${subjectName}`);
    }
    if (!Number.isFinite(outOf) || outOf <= 0) {
      throw new Error(`out_of must be greater than 0 for ${subjectName}`);
    }
    if (marksScored > outOf) {
      throw new Error(`marks_scored cannot be greater than out_of for ${subjectName}`);
    }

    return {
      subject_name: subjectName,
      marks_scored: marksScored,
      out_of: outOf,
      subject_percentage: roundToTwo((marksScored / outOf) * 100),
    };
  });
}

function calculateOverallPercentage(subjects) {
  const totalScored = subjects.reduce((sum, subject) => sum + subject.marks_scored, 0);
  const totalOutOf = subjects.reduce((sum, subject) => sum + subject.out_of, 0);

  if (totalOutOf <= 0) {
    throw new Error('Total out_of must be greater than 0');
  }

  return roundToTwo((totalScored / totalOutOf) * 100);
}

function calculateGrade(percentage) {
  const p = Number(percentage);
  if (!Number.isFinite(p) || p <= 0) return 'F';
  if (p >= 90) return 'A+';
  if (p >= 80) return 'A';
  if (p >= 70) return 'B+';
  if (p >= 60) return 'B';
  if (p >= 50) return 'C';
  if (p >= 40) return 'D';
  return 'F';
}

module.exports = {
  roundToTwo,
  normalizeSubjects,
  calculateOverallPercentage,
  calculateGrade,
};
