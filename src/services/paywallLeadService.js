const Database = require('better-sqlite3');
const { DB_FILE } = require('./quotaService');

const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS paywall_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT NOT NULL DEFAULT '',
    selected_plan TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'web_paywall',
    nickname TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    focus TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
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

function savePaywallLead({
  registration = {},
  selectedPlan = '',
  profile = {},
  userKey = '',
  chart = null,
  source = 'web_paywall',
}) {
  const normalizedRegistration = registration && typeof registration === 'object' ? registration : {};
  const normalizedPlan = `${selectedPlan || ''}`.trim();
  if (!normalizedPlan) {
    throw new Error('selectedPlan is required');
  }

  const row = db.prepare(`
    INSERT INTO paywall_leads (
      user_key,
      selected_plan,
      source,
      nickname,
      city,
      focus,
      email,
      phone,
      profile_json,
      chart_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    `${userKey || ''}`.trim(),
    normalizedPlan,
    `${source || 'web_paywall'}`.trim() || 'web_paywall',
    `${normalizedRegistration.nickname || ''}`.trim(),
    `${normalizedRegistration.city || ''}`.trim(),
    `${normalizedRegistration.focus || ''}`.trim(),
    `${normalizedRegistration.email || ''}`.trim(),
    `${normalizedRegistration.phone || ''}`.trim(),
    stringifyObject(profile),
    stringifyObject(chart)
  );

  return {
    id: row.lastInsertRowid,
    selectedPlan: normalizedPlan,
    source: `${source || 'web_paywall'}`.trim() || 'web_paywall',
  };
}

function listPaywallLeads({ limit = 100 } = {}) {
  const rows = db.prepare(`
    SELECT
      id,
      user_key,
      selected_plan,
      source,
      nickname,
      city,
      focus,
      email,
      phone,
      created_at
    FROM paywall_leads
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit || 100), 500)));

  return rows.map((row) => ({
    id: row.id,
    userKey: row.user_key,
    selectedPlan: row.selected_plan,
    source: row.source,
    nickname: row.nickname,
    city: row.city,
    focus: row.focus,
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
  }));
}

module.exports = {
  savePaywallLead,
  listPaywallLeads,
};
