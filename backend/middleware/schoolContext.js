function requireSchoolContext(req, res, next) {
  const schoolId = Number(req.user?.schoolId || req.user?.school_id || req.admin?.schoolId || req.admin?.school_id);

  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: school context is required for this request',
    });
  }

  if (req.user) {
    req.user.schoolId = schoolId;
  }
  if (req.admin) {
    req.admin.schoolId = schoolId;
  }

  return next();
}

module.exports = { requireSchoolContext };
