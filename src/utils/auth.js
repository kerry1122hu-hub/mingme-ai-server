const crypto = require('crypto');

const ADMIN_COOKIE_NAME = 'mingme_admin_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function toText(value) {
  return `${value || ''}`.trim();
}

function getAdminUsername() {
  return toText(process.env.ADMIN_USERNAME || 'admin');
}

function getAdminPassword() {
  return toText(process.env.ADMIN_PASSWORD || process.env.ADMIN_API_TOKEN || '');
}

function getSessionSecret() {
  return toText(process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.ADMIN_API_TOKEN || 'mingme-admin-session');
}

function readCookieHeader(req) {
  return `${req?.headers?.cookie || ''}`;
}

function parseCookies(req) {
  return readCookieHeader(req).split(';').reduce((acc, item) => {
    const index = item.indexOf('=');
    if (index < 0) return acc;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = `${input || ''}`.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
}

function createSessionToken(username) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = base64UrlEncode(JSON.stringify({ username, issuedAt, expiresAt }));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function readSessionToken(req) {
  return parseCookies(req)[ADMIN_COOKIE_NAME] || '';
}

function isTimingSafeEqual(a, b) {
  const left = Buffer.from(`${a || ''}`);
  const right = Buffer.from(`${b || ''}`);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateAdminCredentials(username, password) {
  const expectedUsername = getAdminUsername();
  const expectedPassword = getAdminPassword();
  if (!expectedUsername || !expectedPassword) {
    return false;
  }
  return isTimingSafeEqual(toText(username), expectedUsername) && isTimingSafeEqual(toText(password), expectedPassword);
}

function isSecureRequest(req) {
  return !!(req?.secure || `${req?.headers?.['x-forwarded-proto'] || ''}`.toLowerCase() === 'https');
}

function buildCookie(token, req) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/admin',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function buildExpiredCookie(req) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/admin',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function setAdminSessionCookie(res, username, req) {
  const token = createSessionToken(username);
  res.setHeader('Set-Cookie', buildCookie(token, req));
  return token;
}

function clearAdminSessionCookie(res, req) {
  res.setHeader('Set-Cookie', buildExpiredCookie(req));
}

function verifySessionToken(token) {
  const [payload, signature] = `${token || ''}`.split('.');
  if (!payload || !signature) {
    return null;
  }
  const expectedSignature = signPayload(payload);
  if (!isTimingSafeEqual(signature, expectedSignature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    if (!parsed?.username || !parsed?.expiresAt || Number(parsed.expiresAt) < Date.now()) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function getAdminTokenFromRequest(req) {
  return toText(
    req?.headers?.['x-admin-token']
      || req?.query?.token
      || req?.body?.token
  );
}

function isAdminAuthenticated(req) {
  const adminToken = getAdminTokenFromRequest(req);
  const expectedToken = toText(process.env.ADMIN_API_TOKEN || '');
  if (expectedToken && adminToken && isTimingSafeEqual(adminToken, expectedToken)) {
    return { username: getAdminUsername(), via: 'token' };
  }
  const session = verifySessionToken(readSessionToken(req));
  if (session) {
    return { username: session.username, via: 'session' };
  }
  return null;
}

function prefersHtml(req) {
  const accept = `${req?.headers?.accept || ''}`.toLowerCase();
  return accept.includes('text/html');
}

function requireAdminToken(req, res, next) {
  const session = isAdminAuthenticated(req);
  if (session) {
    req.adminUser = session;
    return next();
  }
  if (prefersHtml(req)) {
    return res.redirect('/admin/login');
  }
  return res.status(401).json({
    ok: false,
    code: 'UNAUTHORIZED',
    error: 'invalid admin auth',
  });
}

function requireAppToken(req, res, next) {
  const expectedToken = toText(process.env.APP_API_TOKEN || '');
  if (!expectedToken) {
    return next();
  }
  const token = toText(
    req?.headers?.['x-app-token']
      || req?.headers?.['x-mingme-token']
      || req?.body?.token
      || req?.query?.token
  );
  if (token && isTimingSafeEqual(token, expectedToken)) {
    return next();
  }
  return res.status(401).json({
    ok: false,
    code: 'UNAUTHORIZED',
    error: 'invalid app token',
  });
}

module.exports = {
  ADMIN_COOKIE_NAME,
  clearAdminSessionCookie,
  getAdminUsername,
  isAdminAuthenticated,
  requireAdminToken,
  requireAppToken,
  setAdminSessionCookie,
  validateAdminCredentials,
};
