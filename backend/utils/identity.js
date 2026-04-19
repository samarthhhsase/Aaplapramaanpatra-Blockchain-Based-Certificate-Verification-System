const pool = require('../db');

function buildCandidate(prefix) {
  const safePrefix = String(prefix || 'USR').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'USR';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${safePrefix}_${timestamp}_${random}`;
}

async function generateUniqueUserUsername(role, connection = pool) {
  const prefix = role === 'admin' ? 'ADM' : role === 'issuer' ? 'ISS' : role === 'student' ? 'STU' : 'USR';

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = buildCandidate(prefix);
    const [rows] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [candidate]);
    if (rows.length === 0) {
      return candidate;
    }
  }

  throw new Error(`Failed to generate unique username for role ${role}`);
}

module.exports = {
  generateUniqueUserUsername,
};
