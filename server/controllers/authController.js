// server/controllers/authController.js
const authService = require('../services/authService');

function getAuthUrl(_req, res) {
  try {
    const url = authService.generateAuthUrl();
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}

async function oauthCallback(req, res) {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  try {
    await authService.setTokensByCode(code);
    res.send(
      '<html><body><h2>Authentication successful. You can close this window.</h2><script>window.close();</script></body></html>'
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
}

module.exports = {
  getAuthUrl,
  oauthCallback
};