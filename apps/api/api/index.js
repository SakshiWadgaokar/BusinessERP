const { handleVercelRequest } = require('../dist/src/serverless');

module.exports = async function handler(req, res) {
  return handleVercelRequest(req, res);
};
