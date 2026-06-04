const API_TOKEN = process.env.API_TOKEN || null;

export function apiTokenCheck(req, res, next) {
  if (!API_TOKEN) {
    next();
  }

  const reqApiToken = req.get('X-Token-API');

  if (reqApiToken !== API_TOKEN) {
    throw new Error('Security error, invalid API token.');
  } else {
    next();
  }
}