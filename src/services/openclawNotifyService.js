function isNotifyEnabled() {
  const raw = `${process.env.OPENCLAW_NOTIFY_ENABLED || ''}`.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = `${process.env.OPENCLAW_WEBHOOK_TOKEN || ''}`.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function buildMessageSummary(contact = {}) {
  const lines = [
    'MingMe 收到一条新的用户留言',
    `时间：${contact.createdAt || new Date().toISOString()}`,
    `昵称：${contact.nickname || '未留称呼'}`,
    `userKey：${contact.userKey || '--'}`,
    `城市：${contact.city || '未留城市'}`,
    `主题：${contact.topic || '未填写主题'}`,
    `邮箱：${contact.email || '未留邮箱'}`,
    `手机：${contact.phone || '未留手机号'}`,
    `来源：${contact.source || 'member_contact'}`,
    `留言：${`${contact.message || ''}`.trim().slice(0, 160) || '暂无内容'}`,
  ];
  return lines.join('\n');
}

async function notifyOpenClawNewContact(contact = {}) {
  const webhookUrl = `${process.env.OPENCLAW_WEBHOOK_URL || ''}`.trim();
  if (!isNotifyEnabled() || !webhookUrl) {
    return { sent: false, skipped: true };
  }

  const payload = {
    event: 'mingme.contact_message.created',
    source: 'mingme-ai-server',
    createdAt: contact.createdAt || new Date().toISOString(),
    message: buildMessageSummary(contact),
    contact: {
      id: contact.id || null,
      userKey: contact.userKey || '',
      nickname: contact.nickname || '',
      city: contact.city || '',
      focus: contact.focus || '',
      email: contact.email || '',
      phone: contact.phone || '',
      topic: contact.topic || '',
      message: contact.message || '',
      source: contact.source || 'member_contact',
      status: contact.status || 'pending',
      createdAt: contact.createdAt || null,
    },
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`openclaw webhook failed: ${response.status}`);
  }

  return { sent: true };
}

module.exports = {
  notifyOpenClawNewContact,
};
