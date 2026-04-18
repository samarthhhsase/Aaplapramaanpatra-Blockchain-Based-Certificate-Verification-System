const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootEnvPath = path.join(__dirname, '..', '..', '.env');
const backendEnvPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
}

module.exports = {
  rootEnvPath,
  backendEnvPath,
};
