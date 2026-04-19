const jwt = require('jsonwebtoken');
const { getBearerToken } = require('./authMiddleware');

async function verifyAdminToken(req, res, next) {
  try {
    if (!process.env.JWT_SECRET) {
      console.error('[AUTH ERROR] JWT_SECRET is missing');
      return res.status(500).json({ success: false, message: 'Server authentication is not configured' });
    }

    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      console.error('[AUTH ERROR] Admin token missing', { path: req.originalUrl });
      return res.status(401).json({ success: false, message: 'Authorization token is required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const adminId = decoded?.adminId || decoded?.id || null;
    if (decoded?.role !== 'admin' || !adminId) {
      console.error('[AUTH ERROR] Admin token rejected', { path: req.originalUrl, decoded });
      return res.status(403).json({ success: false, message: 'Admin access only' });
    }

    req.admin = {
      ...decoded,
      id: adminId,
      adminId,
      schoolId: decoded?.schoolId || decoded?.school_id || null,
    };
    return next();
  } catch (error) {
    console.error('[AUTH ERROR]', {
      path: req.originalUrl,
      message: error.message,
    });
    return res.status(401).json({ success: false, message: 'Unauthorized admin token' });
  }
}

module.exports = { verifyAdminToken };
