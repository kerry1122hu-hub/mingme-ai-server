const Database = require('better-sqlite3');
const { DB_FILE, setMembership } = require('./quotaService');

const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS manual_payment_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT NOT NULL DEFAULT '',
    selected_plan TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'web_manual_payment',
    nickname TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    focus TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    amount_text TEXT NOT NULL DEFAULT '',
    paid_at_text TEXT NOT NULL DEFAULT '',
    screenshot_name TEXT NOT NULL DEFAULT '',
    screenshot_data_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    profile_json TEXT NOT NULL DEFAULT '{}',
    chart_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TEXT,
    reviewed_notes TEXT NOT NULL DEFAULT '',
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

function getMembershipDurationDays(plan) {
  if (plan === 'annual') return 365;
  if (plan === 'monthly') return 30;
  return 30;
}

function saveManualPaymentReview({
  registration = {},
  selectedPlan = '',
  paymentMethod = '',
  amountText = '',
  paidAtText = '',
  screenshotName = '',
  screenshotDataUrl = '',
  notes = '',
  profile = {},
  userKey = '',
  chart = null,
  source = 'web_manual_payment',
}) {
  const normalizedPlan = `${selectedPlan || ''}`.trim();
  const normalizedMethod = `${paymentMethod || ''}`.trim();
  if (!normalizedPlan) throw new Error('selectedPlan is required');
  if (!normalizedMethod) throw new Error('paymentMethod is required');
  if (!`${screenshotDataUrl || ''}`.trim()) throw new Error('payment screenshot is required');

  const normalizedRegistration = registration && typeof registration === 'object' ? registration : {};
  const row = db.prepare(`
    INSERT INTO manual_payment_reviews (
      user_key, selected_plan, payment_method, source,
      nickname, city, focus, email, phone,
      amount_text, paid_at_text, screenshot_name, screenshot_data_url, notes,
      profile_json, chart_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
  `).run(
    `${userKey || ''}`.trim(),
    normalizedPlan,
    normalizedMethod,
    `${source || 'web_manual_payment'}`.trim() || 'web_manual_payment',
    `${normalizedRegistration.nickname || ''}`.trim(),
    `${normalizedRegistration.city || ''}`.trim(),
    `${normalizedRegistration.focus || ''}`.trim(),
    `${normalizedRegistration.email || ''}`.trim(),
    `${normalizedRegistration.phone || ''}`.trim(),
    `${amountText || ''}`.trim(),
    `${paidAtText || ''}`.trim(),
    `${screenshotName || ''}`.trim(),
    `${screenshotDataUrl || ''}`.trim(),
    `${notes || ''}`.trim(),
    stringifyObject(profile),
    stringifyObject(chart)
  );

  return {
    id: row.lastInsertRowid,
    selectedPlan: normalizedPlan,
    paymentMethod: normalizedMethod,
    status: 'pending',
  };
}

function listManualPaymentReviews({ limit = 100, status = '' } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 500));
  const normalizedStatus = `${status || ''}`.trim();
  const rows = normalizedStatus
    ? db.prepare(`
        SELECT *
        FROM manual_payment_reviews
        WHERE status = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `).all(normalizedStatus, normalizedLimit)
    : db.prepare(`
        SELECT *
        FROM manual_payment_reviews
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `).all(normalizedLimit);

  return rows.map((row) => ({
    id: row.id,
    userKey: row.user_key,
    selectedPlan: row.selected_plan,
    paymentMethod: row.payment_method,
    source: row.source,
    nickname: row.nickname,
    city: row.city,
    focus: row.focus,
    email: row.email,
    phone: row.phone,
    amountText: row.amount_text,
    paidAtText: row.paid_at_text,
    screenshotName: row.screenshot_name,
    screenshotDataUrl: row.screenshot_data_url,
    notes: row.notes,
    status: row.status,
    reviewedAt: row.reviewed_at,
    reviewedNotes: row.reviewed_notes,
    createdAt: row.created_at,
  }));
}

function approveManualPaymentReview({ id, reviewedNotes = '' }) {
  const row = db.prepare(`
    SELECT *
    FROM manual_payment_reviews
    WHERE id = ?
  `).get(Number(id));

  if (!row) {
    throw new Error('manual payment review not found');
  }

  if (row.status === 'approved') {
    return {
      id: row.id,
      status: row.status,
      userKey: row.user_key,
      duplicate: true,
    };
  }

  const endAt = new Date(Date.now() + getMembershipDurationDays(row.selected_plan) * 24 * 60 * 60 * 1000).toISOString();
  const membership = setMembership({
    userKey: row.user_key,
    tier: 'premium',
    status: 'active',
    expiresAt: endAt,
    notes: `manual_payment_review:${row.id}:${row.selected_plan}`,
  });

  db.prepare(`
    UPDATE manual_payment_reviews
    SET status = 'approved',
        reviewed_at = CURRENT_TIMESTAMP,
        reviewed_notes = ?
    WHERE id = ?
  `).run(`${reviewedNotes || ''}`.trim(), Number(id));

  return {
    id: row.id,
    status: 'approved',
    userKey: row.user_key,
    membership,
    duplicate: false,
  };
}

module.exports = {
  saveManualPaymentReview,
  listManualPaymentReviews,
  approveManualPaymentReview,
};
