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
  const { notifyOpenClaw } = require('./openclawWebhookService');
  return notifyOpenClaw('mingme.contact_message.created', 'MingMe', {
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
    summary: buildMessageSummary(contact),
    createdAt: contact.createdAt || new Date().toISOString(),
  });
}

module.exports = {
  notifyOpenClawNewContact,
};
