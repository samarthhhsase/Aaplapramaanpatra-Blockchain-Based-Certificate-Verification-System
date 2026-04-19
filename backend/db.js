require('./config/loadEnv');
const mysql = require('mysql2/promise');

const requiredDbVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
for (const key of requiredDbVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const dbName = (
  process.env.DB_NAME ||
  process.env.MYSQL_DATABASE ||
  process.env.DATABASE_NAME ||
  ''
).trim();

if (!dbName) {
  throw new Error('Missing required environment variable: DB_NAME (or MYSQL_DATABASE / DATABASE_NAME)');
}

process.env.DB_NAME = dbName;
process.env.MYSQL_DATABASE = dbName;
process.env.DATABASE_NAME = dbName;

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function getBaseConfig() {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

function createPoolForDatabase(database) {
  return mysql.createPool({
    ...getBaseConfig(),
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

let pool;
let initializationPromise;
let lastBootstrapResult = {
  created: false,
  database: process.env.DB_NAME,
};

async function bootstrapDatabase() {
  let serverConnection;

  try {
    console.info('[DB TARGET]', {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
    });

    serverConnection = await mysql.createConnection(getBaseConfig());
    await serverConnection.ping();

    const [rows] = await serverConnection.execute(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1',
      [process.env.DB_NAME]
    );

    const databaseExists = rows.length > 0;
    if (!databaseExists) {
      await serverConnection.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(process.env.DB_NAME)}`);
    }

    if (!pool) {
      pool = createPoolForDatabase(process.env.DB_NAME);
    }

    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    lastBootstrapResult = {
      created: !databaseExists,
      database: process.env.DB_NAME,
    };

    console.info('[DB CONNECTED]', {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
    });

    return lastBootstrapResult;
  } catch (error) {
    if (pool) {
      await pool.end().catch(() => {});
      pool = undefined;
    }

    console.error('[DB ERROR]', {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      message: error.message,
    });
    throw error;
  } finally {
    if (serverConnection) {
      await serverConnection.end().catch(() => {});
    }
  }
}

async function ensureDatabaseReady() {
  if (pool) {
    return lastBootstrapResult;
  }

  if (!initializationPromise) {
    initializationPromise = bootstrapDatabase()
      .catch((error) => {
        initializationPromise = undefined;
        throw error;
      });
  }

  return initializationPromise;
}

async function testDatabaseConnection() {
  return ensureDatabaseReady();
}

module.exports = {
  ensureDatabaseReady,
  testDatabaseConnection,
  async getConnection() {
    await ensureDatabaseReady();
    return pool.getConnection();
  },
  async execute(...args) {
    await ensureDatabaseReady();
    return pool.execute(...args);
  },
  async query(...args) {
    await ensureDatabaseReady();
    return pool.query(...args);
  },
  async end() {
    if (!pool) {
      return;
    }

    await pool.end();
    pool = undefined;
    initializationPromise = undefined;
  },
  getDatabaseName() {
    return process.env.DB_NAME;
  },
};
