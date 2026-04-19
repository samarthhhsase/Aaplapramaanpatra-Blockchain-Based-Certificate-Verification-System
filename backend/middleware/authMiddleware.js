const jwt = require('jsonwebtoken');

function getBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authHeader.trim().split(/\s+/);
  if (String(scheme || '').toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function authenticate(req, res, next) {
  try {
    if (!process.env.JWT_SECRET) {
      console.error('[AUTH ERROR] JWT_SECRET is missing');
      return res.status(500).json({ success: false, message: 'Server authentication is not configured' });
    }

    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      console.error('[AUTH ERROR] Authorization token missing', {
        path: req.originalUrl,
        hasAuthorizationHeader: Boolean(req.headers.authorization),
        authorizationHeaderPreview: req.headers.authorization ? String(req.headers.authorization).slice(0, 20) : null,
      });
      return res.status(401).json({ success: false, message: 'Unauthorized: Token missing or invalid' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.role === 'admin' && !decoded.adminId && decoded.id) {
      decoded.adminId = decoded.id;
    }
    if (decoded?.schoolId && !decoded.school_id) {
      decoded.school_id = decoded.schoolId;
    }
    if (decoded?.school_id && !decoded.schoolId) {
      decoded.schoolId = decoded.school_id;
    }
    req.user = decoded;
    return next();
  } catch (error) {
    console.error('[AUTH ERROR]', {
      path: req.originalUrl,
      hasAuthorizationHeader: Boolean(req.headers.authorization),
      message: error.message,
    });
    return res.status(401).json({ success: false, message: 'Unauthorized: Token missing or invalid' });
  }
}

module.exports = { authenticate, getBearerToken };
