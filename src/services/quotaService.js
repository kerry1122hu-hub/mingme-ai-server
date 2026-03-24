const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DAILY_LIMIT = 3;
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const DATA_DIR = IS_RENDER
  ? path.join('/tmp', 'mingme-ai-server-data')
  : path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'mingme-ai.sqlite');
const migrationMessages = [];

function recordMigration(message) {
  migrationMessages.push(message);
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      date_key TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_key, date_key)
    );

    CREATE TABLE IF NOT EXISTS user_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL UNIQUE,
      birth_text TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      role_text TEXT NOT NULL DEFAULT '',
      focus_text TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_quota_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      date_key TEXT NOT NULL,
      extra_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_key, date_key)
    );
  `);

  const profileColumns = db.prepare(`PRAGMA table_info(user_profiles)`).all();
  const profileColumnNames = new Set(profileColumns.map((column) => column.name));
  if (!profileColumnNames.has('nickname')) {
    db.exec(`ALTER TABLE user_profiles ADD COLUMN nickname TEXT NOT NULL DEFAULT ''`);
    recordMigration('已为 user_profiles 补充 nickname 列');
  }
  if (!profileColumnNames.has('gender')) {
    db.exec(`ALTER TABLE user_profiles ADD COLUMN gender TEXT NOT NULL DEFAULT ''`);
    recordMigration('已为 user_profiles 补充 gender 列');
  }
  if (!profileColumnNames.has('city')) {
    db.exec(`ALTER TABLE user_profiles ADD COLUMN city TEXT NOT NULL DEFAULT ''`);
    recordMigration('已为 user_profiles 补充 city 列');
  }
  if (!profileColumnNames.has('role_text')) {
    db.exec(`ALTER TABLE user_profiles ADD COLUMN role_text TEXT NOT NULL DEFAULT ''`);
    recordMigration('已为 user_profiles 补充 role_text 列');
  }
  if (!profileColumnNames.has('focus_text')) {
    db.exec(`ALTER TABLE user_profiles ADD COLUMN focus_text TEXT NOT NULL DEFAULT ''`);
    recordMigration('已为 user_profiles 补充 focus_text 列');
  }

  const overrideColumns = db.prepare(`PRAGMA table_info(ai_quota_overrides)`).all();
  const overrideColumnNames = new Set(overrideColumns.map((column) => column.name));
  if (!overrideColumnNames.has('notes')) {
    db.exec(`ALTER TABLE ai_quota_overrides ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
    recordMigration('已为 ai_quota_overrides 补充 notes 列');
  }

  return db;
}

const db = ensureDatabase();

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function pad(value) {
  return String(value || '').padStart(2, '0');
}

function buildUserKey({ userKey, chart }) {
  if (userKey && `${userKey}`.trim()) {
    return `${userKey}`.trim();
  }

  const birth = chart?.birthInfo || chart?.inputBirthInfo || chart?.solarBirthInfo || {};
  const parts = [
    birth?.year || '0000',
    pad(birth?.month || '00'),
    pad(birth?.day || '00'),
    pad(birth?.hour || '00'),
    pad(birth?.minute || '00'),
    chart?.gender || birth?.gender || 'unknown',
  ];

  return `chart:${parts.join('-')}`;
}

function formatBirthText(chart) {
  const birth = chart?.birthInfo || chart?.inputBirthInfo || chart?.solarBirthInfo || {};
  if (!birth?.year || !birth?.month || !birth?.day) {
    return '';
  }
  return `${birth.year}年${pad(birth.month)}月${pad(birth.day)}日 ${pad(birth.hour || 0)}时${pad(birth.minute || 0)}分`;
}

function syncUserProfile(userKey, chart, profile) {
  if (!userKey) return;

  const nickname = `${profile?.nickname || chart?.nickname || chart?.profile?.nickname || ''}`.trim();
  const gender = `${profile?.gender || chart?.gender || chart?.birthInfo?.gender || chart?.inputBirthInfo?.gender || chart?.solarBirthInfo?.gender || ''}`.trim();
  const city = `${profile?.city || chart?.city || chart?.birthCity || chart?.profile?.city || ''}`.trim();
  const roleText = `${profile?.role || chart?.role || chart?.profile?.role || ''}`.trim();
  const focusText = `${profile?.focus || chart?.focus || chart?.profile?.focus || ''}`.trim();
  const birthText = formatBirthText(chart || {});

  db.prepare(`
    INSERT INTO user_profiles (user_key, birth_text, nickname, gender, city, role_text, focus_text, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key)
    DO UPDATE SET
      birth_text = CASE WHEN excluded.birth_text <> '' THEN excluded.birth_text ELSE user_profiles.birth_text END,
      nickname = CASE WHEN excluded.nickname <> '' THEN excluded.nickname ELSE user_profiles.nickname END,
      gender = CASE WHEN excluded.gender <> '' THEN excluded.gender ELSE user_profiles.gender END,
      city = CASE WHEN excluded.city <> '' THEN excluded.city ELSE user_profiles.city END,
      role_text = CASE WHEN excluded.role_text <> '' THEN excluded.role_text ELSE user_profiles.role_text END,
      focus_text = CASE WHEN excluded.focus_text <> '' THEN excluded.focus_text ELSE user_profiles.focus_text END,
      updated_at = CURRENT_TIMESTAMP
  `).run(userKey, birthText, nickname, gender, city, roleText, focusText);
}

function getStoredUsage(userKey, dateKey) {
  const row = db.prepare(
    'SELECT count FROM ai_usage WHERE user_key = ? AND date_key = ?'
  ).get(userKey, dateKey);
  return Number(row?.count || 0);
}

function upsertUsage(userKey, dateKey, count) {
  db.prepare(`
    INSERT INTO ai_usage (user_key, date_key, count, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key, date_key)
    DO UPDATE SET count = excluded.count, updated_at = CURRENT_TIMESTAMP
  `).run(userKey, dateKey, count);
}

function getExtraQuota(userKey, dateKey) {
  const row = db.prepare(`
    SELECT extra_count
    FROM ai_quota_overrides
    WHERE user_key = ? AND date_key = ?
  `).get(userKey, dateKey);
  return Number(row?.extra_count || 0);
}

function setExtraQuota({ userKey, chart, profile, dateKey = getTodayKey(), extraCount = 0, notes = '' }) {
  const resolvedKey = buildUserKey({ userKey, chart });
  syncUserProfile(resolvedKey, chart, profile);
  const normalizedExtra = Math.max(0, Number(extraCount || 0));
  const normalizedNotes = `${notes || ''}`.trim();

  db.prepare(`
    INSERT INTO ai_quota_overrides (user_key, date_key, extra_count, notes, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key, date_key)
    DO UPDATE SET
      extra_count = excluded.extra_count,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(resolvedKey, dateKey, normalizedExtra, normalizedNotes);

  return {
    userKey: resolvedKey,
    dateKey,
    extraCount: normalizedExtra,
    notes: normalizedNotes,
  };
}

function getMembershipRow(userKey) {
  return db.prepare(`
    SELECT user_key, tier, status, expires_at, notes, created_at, updated_at
    FROM user_memberships
    WHERE user_key = ?
  `).get(userKey) || null;
}

function normalizeMembership(row) {
  if (!row) {
    return {
      tier: 'free',
      status: 'active',
      expiresAt: null,
      notes: '',
      isPremium: false,
      source: 'default',
    };
  }

  const tier = `${row.tier || 'free'}`.trim() || 'free';
  const status = `${row.status || 'active'}`.trim() || 'active';
  const expiresAt = row.expires_at || null;
  const expiresTime = expiresAt ? Date.parse(expiresAt) : null;
  const expired = typeof expiresTime === 'number' && !Number.isNaN(expiresTime)
    ? expiresTime < Date.now()
    : false;
  const isPremium = tier !== 'free' && status === 'active' && !expired;

  return {
    tier,
    status: expired ? 'expired' : status,
    expiresAt,
    notes: row.notes || '',
    isPremium,
    source: 'sqlite',
  };
}

function getMembershipStatus({ userKey, chart, profile }) {
  const resolvedKey = buildUserKey({ userKey, chart });
  syncUserProfile(resolvedKey, chart, profile);
  const membership = normalizeMembership(getMembershipRow(resolvedKey));
  return {
    userKey: resolvedKey,
    ...membership,
  };
}

function getQuotaStatus({ userKey, chart, profile }) {
  const resolvedKey = buildUserKey({ userKey, chart });
  syncUserProfile(resolvedKey, chart, profile);
  const membership = normalizeMembership(getMembershipRow(resolvedKey));
  const dateKey = getTodayKey();
  const used = getStoredUsage(resolvedKey, dateKey);
  const extraQuota = getExtraQuota(resolvedKey, dateKey);
  const dailyLimit = DAILY_LIMIT + extraQuota;
  const remaining = membership.isPremium ? 999 : Math.max(0, dailyLimit - used);

  return {
    userKey: resolvedKey,
    dateKey,
    used,
    remaining,
    allowed: membership.isPremium ? true : used < dailyLimit,
    dailyLimit,
    baseDailyLimit: DAILY_LIMIT,
    extraQuota,
    isPremium: membership.isPremium,
    memberTier: membership.tier,
    membership,
  };
}

function consumeQuota({ userKey, chart, profile }) {
  const status = getQuotaStatus({ userKey, chart, profile });

  if (!status.allowed) {
    const error = new Error('AI quota exceeded');
    error.code = 'AI_QUOTA_EXCEEDED';
    error.status = 429;
    error.quota = status;
    throw error;
  }

  if (status.isPremium) {
    return status;
  }

  const nextUsed = status.used + 1;
  upsertUsage(status.userKey, status.dateKey, nextUsed);

  return {
    ...status,
    used: nextUsed,
    remaining: Math.max(0, status.dailyLimit - nextUsed),
    allowed: nextUsed < status.dailyLimit,
  };
}

function setMembership({
  userKey,
  chart,
  profile,
  tier = 'free',
  status = 'active',
  expiresAt = null,
  notes = '',
}) {
  const resolvedKey = buildUserKey({ userKey, chart });
  syncUserProfile(resolvedKey, chart, profile);
  const normalizedTier = `${tier || 'free'}`.trim() || 'free';
  const normalizedStatus = `${status || 'active'}`.trim() || 'active';
  const normalizedExpiresAt = expiresAt ? `${expiresAt}`.trim() : null;
  const normalizedNotes = `${notes || ''}`.trim();

  db.prepare(`
    INSERT INTO user_memberships (user_key, tier, status, expires_at, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key)
    DO UPDATE SET
      tier = excluded.tier,
      status = excluded.status,
      expires_at = excluded.expires_at,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    resolvedKey,
    normalizedTier,
    normalizedStatus,
    normalizedExpiresAt,
    normalizedNotes
  );

  return getMembershipStatus({ userKey: resolvedKey, chart, profile });
}

function listUsageOverview({ dateKey = getTodayKey(), limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 500));
  return db.prepare(`
    SELECT
      usage.user_key AS user_key,
      usage.date_key AS date_key,
      usage.count AS used,
      usage.updated_at AS last_used_at,
      profile.birth_text AS birth_text,
      profile.nickname AS nickname,
      profile.gender AS gender,
      profile.city AS city,
      profile.role_text AS role_text,
      profile.focus_text AS focus_text,
      quota.extra_count AS extra_quota,
      membership.tier AS tier,
      membership.status AS membership_status,
      membership.expires_at AS expires_at,
      membership.notes AS membership_notes
    FROM ai_usage AS usage
    LEFT JOIN user_profiles AS profile
      ON profile.user_key = usage.user_key
    LEFT JOIN ai_quota_overrides AS quota
      ON quota.user_key = usage.user_key AND quota.date_key = usage.date_key
    LEFT JOIN user_memberships AS membership
      ON membership.user_key = usage.user_key
    WHERE usage.date_key = ?
    ORDER BY usage.count DESC, usage.updated_at DESC
    LIMIT ?
  `).all(dateKey, normalizedLimit).map((row) => {
    const membership = normalizeMembership({
      tier: row.tier,
      status: row.membership_status,
      expires_at: row.expires_at,
      notes: row.membership_notes,
    });
    const extraQuota = Number(row.extra_quota || 0);
    const dailyLimit = membership.isPremium ? 999 : DAILY_LIMIT + extraQuota;

    return {
      userKey: row.user_key,
      birthText: row.birth_text || '',
      nickname: row.nickname || '',
      gender: row.gender || '',
      city: row.city || '',
      roleText: row.role_text || '',
      focusText: row.focus_text || '',
      dateKey: row.date_key,
      used: Number(row.used || 0),
      dailyLimit,
      extraQuota,
      remaining: membership.isPremium ? 999 : Math.max(0, dailyLimit - Number(row.used || 0)),
      isPremium: membership.isPremium,
      memberTier: membership.tier,
      membershipStatus: membership.status,
      expiresAt: membership.expiresAt,
      notes: membership.notes,
      lastUsedAt: row.last_used_at,
    };
  });
}

function listMemberships({ limit = 200 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 200), 500));
  return db.prepare(`
    SELECT
      membership.user_key AS user_key,
      membership.tier AS tier,
      membership.status AS status,
      membership.expires_at AS expires_at,
      membership.notes AS notes,
      membership.updated_at AS updated_at,
      profile.birth_text AS birth_text,
      profile.nickname AS nickname,
      profile.gender AS gender,
      profile.city AS city,
      profile.role_text AS role_text,
      profile.focus_text AS focus_text
    FROM user_memberships AS membership
    LEFT JOIN user_profiles AS profile
      ON profile.user_key = membership.user_key
    ORDER BY membership.updated_at DESC
    LIMIT ?
  `).all(normalizedLimit).map((row) => ({
    userKey: row.user_key,
    birthText: row.birth_text || '',
    nickname: row.nickname || '',
    gender: row.gender || '',
    city: row.city || '',
    roleText: row.role_text || '',
    focusText: row.focus_text || '',
    ...normalizeMembership(row),
    updatedAt: row.updated_at,
  }));
}

function getMigrationMessages() {
  return migrationMessages.slice();
}

module.exports = {
  DAILY_LIMIT,
  DB_FILE,
  buildUserKey,
  getMembershipStatus,
  getQuotaStatus,
  consumeQuota,
  setMembership,
  setExtraQuota,
  listUsageOverview,
  listMemberships,
  getMigrationMessages,
};
