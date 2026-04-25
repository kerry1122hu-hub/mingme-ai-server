const Database = require('better-sqlite3');
const { DB_FILE } = require('./quotaService');

const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'member_contact',
    status TEXT NOT NULL DEFAULT 'pending',
    nickname TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    focus TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    profile_json TEXT NOT NULL DEFAULT '{}',
    chart_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function stringifyObject(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

function saveContactMessage({
  registration = {},
  topic = '',
  message = '',
  profile = {},
  userKey = '',
  chart = null,
  source = 'member_contact',
}) {
  const normalizedRegistration = registration && typeof registration === 'object' ? registration : {};
  const normalizedTopic = `${topic || ''}`.trim();
  const normalizedMessage = `${message || ''}`.trim();

  if (!normalizedMessage) {
    throw new Error('message is required');
  }

  const row = db.prepare(`
    INSERT INTO contact_messages (
      user_key,
      source,
      status,
      nickname,
      city,
      focus,
      email,
      phone,
      topic,
      message,
      profile_json,
      chart_json,
      created_at
    ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    `${userKey || ''}`.trim(),
    `${source || 'member_contact'}`.trim() || 'member_contact',
    `${normalizedRegistration.nickname || ''}`.trim(),
    `${normalizedRegistration.city || ''}`.trim(),
    `${normalizedRegistration.focus || ''}`.trim(),
    `${normalizedRegistration.email || ''}`.trim(),
    `${normalizedRegistration.phone || ''}`.trim(),
    normalizedTopic,
    normalizedMessage,
    stringifyObject(profile),
    stringifyObject(chart)
  );

  return {
    id: row.lastInsertRowid,
    userKey: `${userKey || ''}`.trim(),
    topic: normalizedTopic,
    status: 'pending',
  };
}

function listContactMessages({ limit = 100 } = {}) {
  const rows = db.prepare(`
    SELECT
      id,
      user_key,
      source,
      status,
      nickname,
      city,
      focus,
      email,
      phone,
      topic,
      message,
      created_at
    FROM contact_messages
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit || 100), 500)));

  return rows.map((row) => ({
    id: row.id,
    userKey: row.user_key,
    source: row.source,
    status: row.status,
    nickname: row.nickname,
    city: row.city,
    focus: row.focus,
    email: row.email,
    phone: row.phone,
    topic: row.topic,
    message: row.message,
    createdAt: row.created_at,
  }));
}

function updateContactMessageStatus({ id, status = 'handled' } = {}) {
  const normalizedId = Number(id || 0);
  const normalizedStatus = `${status || 'handled'}`.trim() || 'handled';

  if (!normalizedId) {
    throw new Error('id is required');
  }

  const result = db.prepare(`
    UPDATE contact_messages
    SET status = ?
    WHERE id = ?
  `).run(normalizedStatus, normalizedId);

  if (!result.changes) {
    throw new Error('contact message not found');
  }

  const row = db.prepare(`
    SELECT
      id,
      user_key,
      source,
      status,
      nickname,
      city,
      focus,
      email,
      phone,
      topic,
      message,
      created_at
    FROM contact_messages
    WHERE id = ?
  `).get(normalizedId);

  return {
    id: row.id,
    userKey: row.user_key,
    source: row.source,
    status: row.status,
    nickname: row.nickname,
    city: row.city,
    focus: row.focus,
    email: row.email,
    phone: row.phone,
    topic: row.topic,
    message: row.message,
    createdAt: row.created_at,
  };
}

function getContactMessageStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(
        CASE
          WHEN datetime(created_at) >= datetime('now', '-24 hours') THEN 1
          ELSE 0
        END
      ) AS recent_24h_count
    FROM contact_messages
  `).get();

  return {
    totalCount: Number(row?.total_count || 0),
    pendingCount: Number(row?.pending_count || 0),
    recent24hCount: Number(row?.recent_24h_count || 0),
  };
}

module.exports = {
  saveContactMessage,
  listContactMessages,
  updateContactMessageStatus,
  getContactMessageStats,
};
