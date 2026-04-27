function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(`${value}`.trim().toLowerCase());
}

function splitEmails(value = '') {
  return `${value || ''}`
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getEmailConfig() {
  const recipients = splitEmails(process.env.ADMIN_NOTIFICATION_EMAILS || '');
  const from = `${process.env.ADMIN_EMAIL_FROM || process.env.ACCOUNT_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || ''}`.trim();
  return {
    enabled: parseBoolean(process.env.ADMIN_NOTIFY_EMAIL_ENABLED, true),
    resendApiKey: `${process.env.RESEND_API_KEY || ''}`.trim(),
    from,
    recipients,
    adminPortalUrl: `${process.env.ADMIN_PORTAL_URL || ''}`.trim(),
  };
}

function canSendAdminEmail() {
  const config = getEmailConfig();
  return !!(config.enabled && config.resendApiKey && config.from && config.recipients.length);
}

function escapeHtml(value) {
  return `${value || ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatField(label, value, fallback = '--') {
  return `${label}: ${`${value || ''}`.trim() || fallback}`;
}

function toHtmlRows(fields = []) {
  return fields.map(([label, value, fallback]) => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #e7ecef;background:#f8fbfc;font-weight:700;color:#18363a;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border:1px solid #e7ecef;color:#24464a;line-height:1.6;">${escapeHtml(`${value || ''}`.trim() || fallback || '--')}</td>
    </tr>
  `).join('');
}

function buildAdminPortalHtml(config, buttonLabel) {
  if (!config.adminPortalUrl) return '';
  return `
    <div style="margin-top:16px;">
      <a href="${escapeHtml(config.adminPortalUrl)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#18363a;color:#ffffff;text-decoration:none;font-weight:700;">
        ${escapeHtml(buttonLabel)}
      </a>
    </div>
  `;
}

function parseDataUrlAttachment(dataUrl = '', fallbackName = 'payment-proof.png') {
  const normalized = `${dataUrl || ''}`.trim();
  const match = normalized.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const contentType = match[1];
  const base64 = match[2];
  const extensionMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  const extension = extensionMap[contentType] || 'bin';
  const trimmedName = `${fallbackName || ''}`.trim();
  const filename = trimmedName || `payment-proof.${extension}`;

  if (!base64) return null;
  return {
    filename,
    content: base64,
  };
}

async function sendAdminEmail({ subject, text, html, attachments = [] }) {
  const config = getEmailConfig();
  if (!canSendAdminEmail()) {
    console.warn('[admin-email] skipped: missing RESEND or admin recipient config');
    return { skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: config.recipients,
      subject,
      text,
      html,
      attachments,
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(`resend request failed: ${response.status} ${raw}`.trim());
  }

  return response.json().catch(() => ({ ok: true }));
}

async function notifyAdminContactMessage(contact = {}) {
  const config = getEmailConfig();
  const fields = [
    ['时间', contact.createdAt, new Date().toISOString()],
    ['昵称', contact.nickname, '未留称呼'],
    ['userKey', contact.userKey, '--'],
    ['城市 / 地区', contact.city, '未留城市'],
    ['关注主题', contact.focus, '未留主题'],
    ['留言主题', contact.topic, '未填写主题'],
    ['邮箱', contact.email, '未留邮箱'],
    ['电话', contact.phone, '未留电话'],
    ['来源', contact.source, 'member_contact'],
    ['留言内容', contact.message, '暂无内容'],
  ];
  const text = [
    'MingMe 收到一条新的用户留言',
    ...fields.map(([label, value, fallback]) => formatField(label, value, fallback)),
    config.adminPortalUrl ? `后台地址: ${config.adminPortalUrl}` : '',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;padding:20px;color:#18363a;">
      <h2 style="margin:0 0 14px;">MingMe 收到一条新的用户留言</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e7ecef;">
        ${toHtmlRows(fields)}
      </table>
      ${buildAdminPortalHtml(config, '打开后台查看留言')}
    </div>
  `;

  return sendAdminEmail({
    subject: `[MingMe] 新用户留言 #${contact.id || 'new'}`,
    text,
    html,
  });
}

async function notifyAdminManualPaymentReview(review = {}) {
  const config = getEmailConfig();
  const fields = [
    ['提交时间', review.createdAt, new Date().toISOString()],
    ['昵称', review.nickname, '未留称呼'],
    ['userKey', review.userKey, '--'],
    ['城市 / 地区', review.city, '未留城市'],
    ['关注主题', review.focus, '未留主题'],
    ['邮箱', review.email, '未留邮箱'],
    ['电话', review.phone, '未留电话'],
    ['会员方案', review.selectedPlan, '--'],
    ['支付方式', review.paymentMethod, '--'],
    ['金额说明', review.amountText, '--'],
    ['支付时间', review.paidAtText, '--'],
    ['截图文件名', review.screenshotName, '未命名截图'],
    ['备注', review.notes, '无备注'],
    ['来源', review.source, 'manual_payment_review'],
  ];
  const text = [
    'MingMe 收到一条新的付款凭证审核申请',
    ...fields.map(([label, value, fallback]) => formatField(label, value, fallback)),
    config.adminPortalUrl ? `后台地址: ${config.adminPortalUrl}` : '',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;padding:20px;color:#18363a;">
      <h2 style="margin:0 0 14px;">MingMe 收到一条新的付款凭证审核申请</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e7ecef;">
        ${toHtmlRows(fields)}
      </table>
      <p style="margin-top:14px;color:#5a7276;">付款截图会以附件形式一起发出，如果没看到附件，可检查邮箱客户端的安全策略。</p>
      ${buildAdminPortalHtml(config, '打开后台审核订单')}
    </div>
  `;

  const attachment = parseDataUrlAttachment(review.screenshotDataUrl, review.screenshotName || 'payment-proof.png');
  return sendAdminEmail({
    subject: `[MingMe] 新付款凭证待审核 #${review.id || 'new'}`,
    text,
    html,
    attachments: attachment ? [attachment] : [],
  });
}

function notifyAdminContactMessageNonBlocking(contact = {}) {
  return notifyAdminContactMessage(contact).catch((error) => {
    console.error('[admin-email] failed to send contact email:', error?.message || error);
  });
}

function notifyAdminManualPaymentReviewNonBlocking(review = {}) {
  return notifyAdminManualPaymentReview(review).catch((error) => {
    console.error('[admin-email] failed to send payment review email:', error?.message || error);
  });
}

module.exports = {
  canSendAdminEmail,
  notifyAdminContactMessage,
  notifyAdminContactMessageNonBlocking,
  notifyAdminManualPaymentReview,
  notifyAdminManualPaymentReviewNonBlocking,
};
