const { listRegisteredSchools } = require('../utils/schools');

async function getSchools(req, res) {
  try {
    const schools = await listRegisteredSchools();
    return res.status(200).json({ schools });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch schools', error: error.message });
  }
}

module.exports = {
  getSchools,
};
