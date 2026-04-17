const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const backendEnvPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
}

module.exports = {
  backendEnvPath,
};
