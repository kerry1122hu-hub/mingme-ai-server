function isNotifyEnabled() {
  const raw = `${process.env.OPENCLAW_NOTIFY_ENABLED || ''}`.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getWebhookUrl() {
  return `${process.env.OPENCLAW_WEBHOOK_URL || ''}`.trim();
}

function getWebhookToken() {
  return `${process.env.OPENCLAW_WEBHOOK_TOKEN || ''}`.trim();
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = getWebhookToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function sanitizeData(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const next = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null) {
      next[key] = null;
      return;
    }
    if (typeof value === 'string') {
      next[key] = value.trim();
      return;
    }
    next[key] = value;
  });
  return next;
}

async function notifyOpenClaw(eventType, appName, data = {}) {
  const webhookUrl = getWebhookUrl();
  if (!isNotifyEnabled() || !webhookUrl) {
    return { sent: false, skipped: true };
  }

  const payload = {
    eventType: `${eventType || 'default'}`.trim() || 'default',
    appName: `${appName || 'MingMe'}`.trim() || 'MingMe',
    data: {
      ...sanitizeData(data),
      timestamp: data?.timestamp || new Date().toISOString(),
    },
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`openclaw webhook failed: ${response.status}${body ? ` ${body}` : ''}`);
  }

  return { sent: true };
}

function notifyOpenClawNonBlocking(eventType, appName, data = {}) {
  void notifyOpenClaw(eventType, appName, data).catch((error) => {
    console.error('[openclaw] failed to send event:', {
      eventType,
      appName,
      error: error?.message || error,
    });
  });
}

module.exports = {
  notifyOpenClaw,
  notifyOpenClawNonBlocking,
};
