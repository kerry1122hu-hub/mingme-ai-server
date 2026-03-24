function requireAppToken(req, res, next) {
  const expected = process.env.APP_API_TOKEN;

  if (!expected) {
    return next();
  }

  const incoming = req.headers['x-app-token'] || req.headers['x-mingme-token'];
  if (incoming !== expected) {
    return res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'invalid app token',
    });
  }

  return next();
}

function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_API_TOKEN;

  if (!expected) {
    return next();
  }

  const incoming =
    req.headers['x-admin-token'] ||
    req.query?.token ||
    req.body?.adminToken;

  if (incoming !== expected) {
    return res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'invalid admin token',
    });
  }

  return next();
}

module.exports = {
  requireAppToken,
  requireAdminToken,
};
