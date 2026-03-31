const Database = require('better-sqlite3');
const { DB_FILE } = require('./quotaService');

const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS pwa_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    event_source TEXT NOT NULL DEFAULT 'web',
    user_key TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    page TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const safe = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null) {
      safe[key] = null;
      return;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
      return;
    }
    safe[key] = `${value}`;
  });
  return safe;
}

function trackAnalyticsEvent({
  eventName,
  eventSource = 'web',
  userKey = '',
  sessionId = '',
  page = '',
  platform = '',
  payload = {},
}) {
  const normalizedName = `${eventName || ''}`.trim();
  if (!normalizedName) {
    throw new Error('eventName is required');
  }

  const normalizedPayload = JSON.stringify(normalizePayload(payload));

  db.prepare(`
    INSERT INTO pwa_events (
      event_name,
      event_source,
      user_key,
      session_id,
      page,
      platform,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    normalizedName,
    `${eventSource || 'web'}`.trim() || 'web',
    `${userKey || ''}`.trim(),
    `${sessionId || ''}`.trim(),
    `${page || ''}`.trim(),
    `${platform || ''}`.trim(),
    normalizedPayload
  );

  return {
    eventName: normalizedName,
    page: `${page || ''}`.trim(),
    platform: `${platform || ''}`.trim(),
  };
}

function listAnalyticsEvents({ limit = 100 } = {}) {
  const rows = db.prepare(`
    SELECT id, event_name, event_source, user_key, session_id, page, platform, payload_json, created_at
    FROM pwa_events
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit || 100), 500)));

  return rows.map((row) => ({
    id: row.id,
    eventName: row.event_name,
    eventSource: row.event_source,
    userKey: row.user_key,
    sessionId: row.session_id,
    page: row.page,
    platform: row.platform,
    payload: (() => {
      try {
        return JSON.parse(row.payload_json || '{}');
      } catch {
        return {};
      }
    })(),
    createdAt: row.created_at,
  }));
}

module.exports = {
  trackAnalyticsEvent,
  listAnalyticsEvents,
};
