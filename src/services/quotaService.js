const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DAILY_LIMIT = Math.max(0, Number(process.env.DAILY_LIMIT || 3) || 3);
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const migrationMessages = [];

function resolveDataDir() {
  const customDataDir = `${process.env.MINGME_DATA_DIR || ''}`.trim();
  if (customDataDir) {
    return customDataDir;
  }

  const renderDiskMountPath = `${process.env.RENDER_DISK_MOUNT_PATH || ''}`.trim();
  if (renderDiskMountPath) {
    return path.join(renderDiskMountPath, 'mingme-ai-server-data');
  }

  // Render persistent disks are commonly mounted at /data. Prefer it automatically
  // when present so membership and memory survive deploys even without extra env vars.
  if (IS_RENDER && fs.existsSync('/data')) {
    return path.join('/data', 'mingme-ai-server-data');
  }

  if (IS_RENDER) {
    return path.join('/tmp', 'mingme-ai-server-data');
  }

  return path.join(__dirname, '..', '..', 'data');
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'mingme-ai.sqlite');

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

    CREATE TABLE IF NOT EXISTS user_auth_credentials (
      user_key TEXT PRIMARY KEY,
      password_salt TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

function shiftDateKey(dateKey, offsetDays) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return dateKey;
  base.setUTCDate(base.getUTCDate() + Number(offsetDays || 0));
  return base.toISOString().slice(0, 10);
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

function buildTrialExpiresAt(days = 30) {
  const expiresAt = new Date(Date.now() + Math.max(1, Number(days || 30)) * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

function hashPasswordWithSalt(password, salt) {
  return crypto.scryptSync(`${password || ''}`, salt, 64).toString('base64');
}

function setUserPassword({ userKey, chart, password }) {
  const resolvedKey = buildUserKey({ userKey, chart });
  const normalizedPassword = `${password || ''}`.trim();
  if (!normalizedPassword) {
    return null;
  }

  const salt = crypto.randomBytes(16).toString('base64');
  const passwordHash = hashPasswordWithSalt(normalizedPassword, salt);
  db.prepare(`
    INSERT INTO user_auth_credentials (user_key, password_salt, password_hash, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key)
    DO UPDATE SET
      password_salt = excluded.password_salt,
      password_hash = excluded.password_hash,
      updated_at = CURRENT_TIMESTAMP
  `).run(resolvedKey, salt, passwordHash);

  return { userKey: resolvedKey };
}

function verifyUserPassword({ userKey, chart, password }) {
  const resolvedKey = buildUserKey({ userKey, chart });
  const normalizedPassword = `${password || ''}`.trim();
  if (!normalizedPassword) {
    return false;
  }

  const row = db.prepare(`
    SELECT password_salt, password_hash
    FROM user_auth_credentials
    WHERE user_key = ?
    LIMIT 1
  `).get(resolvedKey);

  if (!row?.password_salt || !row?.password_hash) {
    return false;
  }

  const candidateHash = hashPasswordWithSalt(normalizedPassword, row.password_salt);
  const expectedBuffer = Buffer.from(row.password_hash, 'base64');
  const candidateBuffer = Buffer.from(candidateHash, 'base64');
  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}

function resetUserPasswordByAdmin({ userKey, password }) {
  const resolvedKey = buildUserKey({ userKey });
  const normalizedPassword = `${password || ''}`.trim();
  if (!resolvedKey) {
    throw new Error('userKey is required');
  }
  if (!normalizedPassword) {
    throw new Error('password is required');
  }
  setUserPassword({ userKey: resolvedKey, password: normalizedPassword });
  return { userKey: resolvedKey, updated: true };
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

  const nextUsed = status.used + 1;
  upsertUsage(status.userKey, status.dateKey, nextUsed);

  return {
    ...status,
    used: nextUsed,
    remaining: status.isPremium ? 999 : Math.max(0, status.dailyLimit - nextUsed),
    allowed: status.isPremium ? true : nextUsed < status.dailyLimit,
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

function grantRegistrationTrial({
  userKey,
  chart,
  profile,
  registration,
  trialDays = 30,
} = {}) {
  const resolvedKey = buildUserKey({ userKey, chart });
  const mergedProfile = {
    ...(profile || {}),
    nickname: `${registration?.nickname || profile?.nickname || ''}`.trim(),
    city: `${registration?.city || profile?.city || ''}`.trim(),
    focus: `${registration?.focus || profile?.focus || ''}`.trim(),
  };

  syncUserProfile(resolvedKey, chart, mergedProfile);
  setUserPassword({ userKey: resolvedKey, password: registration?.password || '' });

  const existingRow = getMembershipRow(resolvedKey);
  const existingMembership = normalizeMembership(existingRow);

  if (existingRow) {
    return {
      userKey: resolvedKey,
      granted: false,
      reason: existingMembership.isPremium ? 'already_premium' : 'already_registered',
      trialDays: Number(trialDays || 30),
      ...existingMembership,
    };
  }

  const membership = setMembership({
    userKey: resolvedKey,
    chart,
    profile: mergedProfile,
    tier: 'trial',
    status: 'active',
    expiresAt: buildTrialExpiresAt(trialDays),
    notes: 'registration_trial_30_days',
  });

  return {
    ...membership,
    granted: true,
    reason: 'registration_trial_granted',
    trialDays: Number(trialDays || 30),
  };
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

function listMemberships({ limit = 200, dateKey = getTodayKey() } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 200), 500));
  const last7From = shiftDateKey(dateKey, -6);
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
      profile.focus_text AS focus_text,
      (
        SELECT usage_today.count
        FROM ai_usage AS usage_today
        WHERE usage_today.user_key = membership.user_key
          AND usage_today.date_key = ?
        LIMIT 1
      ) AS used_today,
      (
        SELECT COALESCE(SUM(usage_recent.count), 0)
        FROM ai_usage AS usage_recent
        WHERE usage_recent.user_key = membership.user_key
          AND usage_recent.date_key BETWEEN ? AND ?
      ) AS used_last_7_days,
      (
        SELECT usage_last.updated_at
        FROM ai_usage AS usage_last
        WHERE usage_last.user_key = membership.user_key
        ORDER BY usage_last.updated_at DESC
        LIMIT 1
      ) AS last_used_at
    FROM user_memberships AS membership
    LEFT JOIN user_profiles AS profile
      ON profile.user_key = membership.user_key
    ORDER BY membership.updated_at DESC
    LIMIT ?
  `).all(dateKey, last7From, dateKey, normalizedLimit).map((row) => ({
    userKey: row.user_key,
    birthText: row.birth_text || '',
    nickname: row.nickname || '',
    gender: row.gender || '',
    city: row.city || '',
    roleText: row.role_text || '',
    focusText: row.focus_text || '',
    usedToday: Number(row.used_today || 0),
    usedLast7Days: Number(row.used_last_7_days || 0),
    lastUsedAt: row.last_used_at || '',
    ...normalizeMembership(row),
    updatedAt: row.updated_at,
  }));
}

function listUserAccounts({ limit = 300, dateKey = getTodayKey() } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 300), 1000));
  const last7From = shiftDateKey(dateKey, -6);
  return db.prepare(`
    WITH account_keys AS (
      SELECT user_key FROM user_profiles
      UNION
      SELECT user_key FROM user_memberships
      UNION
      SELECT user_key FROM user_auth_credentials
    )
    SELECT
      account_keys.user_key AS user_key,
      profile.birth_text AS birth_text,
      profile.nickname AS nickname,
      profile.gender AS gender,
      profile.city AS city,
      profile.role_text AS role_text,
      profile.focus_text AS focus_text,
      membership.tier AS tier,
      membership.status AS status,
      membership.expires_at AS expires_at,
      membership.notes AS notes,
      membership.updated_at AS membership_updated_at,
      profile.updated_at AS profile_updated_at,
      auth.updated_at AS password_updated_at,
      CASE
        WHEN auth.user_key IS NOT NULL AND auth.password_hash <> '' THEN 1
        ELSE 0
      END AS has_password,
      (
        SELECT usage_today.count
        FROM ai_usage AS usage_today
        WHERE usage_today.user_key = account_keys.user_key
          AND usage_today.date_key = ?
        LIMIT 1
      ) AS used_today,
      (
        SELECT COALESCE(SUM(usage_recent.count), 0)
        FROM ai_usage AS usage_recent
        WHERE usage_recent.user_key = account_keys.user_key
          AND usage_recent.date_key BETWEEN ? AND ?
      ) AS used_last_7_days,
      (
        SELECT usage_last.updated_at
        FROM ai_usage AS usage_last
        WHERE usage_last.user_key = account_keys.user_key
        ORDER BY usage_last.updated_at DESC
        LIMIT 1
      ) AS last_used_at
    FROM account_keys
    LEFT JOIN user_profiles AS profile
      ON profile.user_key = account_keys.user_key
    LEFT JOIN user_memberships AS membership
      ON membership.user_key = account_keys.user_key
    LEFT JOIN user_auth_credentials AS auth
      ON auth.user_key = account_keys.user_key
    ORDER BY
      COALESCE(membership.updated_at, profile.updated_at, auth.updated_at, '') DESC,
      account_keys.user_key DESC
    LIMIT ?
  `).all(dateKey, last7From, dateKey, normalizedLimit).map((row) => {
    const membership = normalizeMembership({
      tier: row.tier,
      status: row.status,
      expires_at: row.expires_at,
      notes: row.notes,
    });
    return {
      userKey: row.user_key,
      birthText: row.birth_text || '',
      nickname: row.nickname || '',
      gender: row.gender || '',
      city: row.city || '',
      roleText: row.role_text || '',
      focusText: row.focus_text || '',
      hasPassword: Boolean(row.has_password),
      passwordUpdatedAt: row.password_updated_at || '',
      usedToday: Number(row.used_today || 0),
      usedLast7Days: Number(row.used_last_7_days || 0),
      lastUsedAt: row.last_used_at || '',
      profileUpdatedAt: row.profile_updated_at || '',
      membershipUpdatedAt: row.membership_updated_at || '',
      ...membership,
    };
  });
}

function tableExists(tableName) {
  return Boolean(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `).get(tableName)
  );
}

function getTableColumns(tableName) {
  if (!tableExists(tableName)) {
    return new Set();
  }

  return new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name)
  );
}

function deleteRowsByColumns(tableName, candidateColumns, value) {
  const columns = getTableColumns(tableName);
  const matchedColumns = candidateColumns.filter((columnName) => columns.has(columnName));
  if (!matchedColumns.length) {
    return 0;
  }

  const whereClause = matchedColumns.map((columnName) => `${columnName} = ?`).join(' OR ');
  const statement = db.prepare(`DELETE FROM ${tableName} WHERE ${whereClause}`);
  const result = statement.run(...matchedColumns.map(() => value));
  return Number(result?.changes || 0);
}

function clearUserAccountData({ userKey, chart }) {
  const resolvedKey = buildUserKey({ userKey, chart });
  const paymentOrderIds = tableExists('payment_orders')
    ? db.prepare(`
        SELECT order_id
        FROM payment_orders
        WHERE user_key = ?
      `).all(resolvedKey).map((row) => `${row.order_id || ''}`.trim()).filter(Boolean)
    : [];

  const counts = db.transaction(() => {
    const deleted = {
      aiUsage: deleteRowsByColumns('ai_usage', ['user_key'], resolvedKey),
      quotaOverrides: deleteRowsByColumns('ai_quota_overrides', ['user_key'], resolvedKey),
      memberships: deleteRowsByColumns('user_memberships', ['user_key'], resolvedKey),
      authCredentials: deleteRowsByColumns('user_auth_credentials', ['user_key'], resolvedKey),
      profiles: deleteRowsByColumns('user_profiles', ['user_key', 'user_id'], resolvedKey),
      recentSessions: deleteRowsByColumns('memory_recent_sessions', ['user_id'], resolvedKey),
      longTermPatterns: deleteRowsByColumns('memory_long_term_patterns', ['user_id'], resolvedKey),
      actionTracker: deleteRowsByColumns('memory_action_tracker', ['user_id'], resolvedKey),
      memberProfileMemory: deleteRowsByColumns('member_profile_memory', ['user_key'], resolvedKey),
      memberSessionMemory: deleteRowsByColumns('member_session_memory', ['user_key'], resolvedKey),
      memberResponsePreference: deleteRowsByColumns('member_response_preference', ['user_key'], resolvedKey),
      memberQuestionMemory: deleteRowsByColumns('member_question_memory', ['user_key'], resolvedKey),
      contactMessages: deleteRowsByColumns('contact_messages', ['user_key'], resolvedKey),
      manualPaymentReviews: deleteRowsByColumns('manual_payment_reviews', ['user_key'], resolvedKey),
      paywallLeads: deleteRowsByColumns('paywall_leads', ['user_key'], resolvedKey),
      xiaoLiuRenUsage: deleteRowsByColumns('xiao_liu_ren_usage', ['user_key', 'identity_key'], resolvedKey),
      analyticsEvents: deleteRowsByColumns('pwa_events', ['user_key'], resolvedKey),
      userEntitlements: deleteRowsByColumns('user_entitlements', ['user_key'], resolvedKey),
      paymentOrders: deleteRowsByColumns('payment_orders', ['user_key'], resolvedKey),
    };

    if (paymentOrderIds.length && tableExists('payment_transactions')) {
      const placeholders = paymentOrderIds.map(() => '?').join(', ');
      deleted.paymentTransactions = Number(
        db.prepare(`DELETE FROM payment_transactions WHERE order_id IN (${placeholders})`)
          .run(...paymentOrderIds)
          ?.changes || 0
      );
    } else {
      deleted.paymentTransactions = 0;
    }

    return deleted;
  })();

  return {
    userKey: resolvedKey,
    deletedRows: Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0),
    counts,
  };
}

function getMigrationMessages() {
  return migrationMessages.slice();
}

module.exports = {
  DAILY_LIMIT,
  DB_FILE,
  DATA_DIR,
  buildUserKey,
  getMembershipStatus,
  getQuotaStatus,
  consumeQuota,
  setMembership,
  grantRegistrationTrial,
  setExtraQuota,
  listUsageOverview,
  listMemberships,
  listUserAccounts,
  clearUserAccountData,
  resetUserPasswordByAdmin,
  verifyUserPassword,
  getMigrationMessages,
};
