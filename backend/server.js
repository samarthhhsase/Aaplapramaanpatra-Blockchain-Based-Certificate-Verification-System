require('./config/loadEnv');

const express = require('express');
const cors = require('cors');

const pool = require('./db');
const { testDatabaseConnection } = require('./db');
const { ensureBlockchainReady } = require('./services/blockchainService');

const authRoutes = require('./routes/authRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const issuerRoutes = require('./routes/issuerRoutes');
const studentRoutes = require('./routes/studentRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const { ensureApplicationSchema } = require('./utils/schemaSync');

const app = express();
const PORT = process.env.PORT || 5000;
const startupState = {
  databaseReady: false,
  databaseCreated: false,
  schemaReady: false,
  blockchainReady: false,
  startupErrors: [],
};

/* -------------------- MIDDLEWARE -------------------- */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.info(`[ROUTE HIT] ${req.method} ${req.originalUrl}`);
  next();
});

/* -------------------- BASIC ROUTE -------------------- */

app.get('/', (req, res) => {
  res.json({ message: 'Backend running' });
});

/* -------------------- ROUTES -------------------- */

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/issuer', issuerRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/certificates', certificateRoutes);

/* -------------------- HEALTH CHECK -------------------- */

app.get('/api/health', (req, res) => {
  res.json({
    status: 'Backend running',
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API working' });
});

/* -------------------- 404 HANDLER -------------------- */

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

/* -------------------- ERROR HANDLER -------------------- */

app.use((err, req, res, next) => {
  const statusCode =
    err.statusCode ||
    err.status ||
    (err instanceof SyntaxError && err.type === 'entity.parse.failed' ? 400 : 500);
  const publicMessage =
    statusCode === 400 && err instanceof SyntaxError
      ? 'Invalid JSON payload'
      : err.publicMessage || err.message || 'Internal server error';

  console.error('[SERVER ERROR]', {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message: err.message,
    stack: err.stack,
  });

  res.status(statusCode).json({
    success: false,
    message: publicMessage,
    error: err.message,
  });
});

/* -------------------- SERVER START -------------------- */

async function startServer() {
  console.info('[SERVER START] Boot sequence started');

  try {
    const dbState = await testDatabaseConnection();
    startupState.databaseReady = true;
    startupState.databaseCreated = Boolean(dbState?.created);
  } catch (error) {
    startupState.startupErrors.push(`Database connection failed: ${error.message}`);
  }

  if (startupState.databaseReady) {
    try {
      await ensureApplicationSchema();
      startupState.schemaReady = true;
    } catch (error) {
      startupState.startupErrors.push(`Schema sync failed: ${error.message}`);
    }
  }

  try {
    await ensureBlockchainReady();
    startupState.blockchainReady = true;
    console.info('[BLOCKCHAIN] Ganache and contract connection ready');
  } catch (error) {
    startupState.startupErrors.push(`Blockchain connection unavailable: ${error.message}`);
    console.error('[BLOCKCHAIN ERROR]', error.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.info(`[SERVER START] Listening on http://localhost:${PORT}`);
    console.info(`[DB CONNECTED] ${startupState.databaseReady ? 'yes' : 'no'}`);
    console.info(`[DB CREATED] ${startupState.databaseCreated ? 'yes' : 'no'}`);
    console.info(`[DB SCHEMA] ${startupState.schemaReady ? 'ready' : 'not ready'}`);
    console.info(`[BLOCKCHAIN] ${startupState.blockchainReady ? 'ready' : 'degraded'}`);
    console.info('[CORS] Enabled for development');
    if (startupState.startupErrors.length > 0) {
      startupState.startupErrors.forEach((message) => console.error('[STARTUP WARNING]', message));
    }
  });

  server.on('error', (error) => {
    console.error('[SERVER START ERROR]', {
      code: error.code,
      message: error.message,
    });
  });
}

process.on('unhandledRejection', (error) => {
  console.error('[UNHANDLED REJECTION]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

startServer();

module.exports = app;
