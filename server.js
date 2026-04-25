require('dotenv').config();
const express = require('express');
const cors = require('cors');
const aiRoutes = require('./src/routes/ai');
const v1AiRoutes = require('./src/routes/v1Ai');
const payRoutes = require('./src/routes/pay');
const adminRoutes = require('./src/routes/admin');
const { DB_FILE, getMigrationMessages } = require('./src/services/quotaService');
const { notifyOpenClawNonBlocking } = require('./src/services/openclawWebhookService');

const app = express();

function captureRawBody(req, res, buffer) {
  if (buffer?.length) {
    req.rawBody = buffer.toString('utf8');
  }
}

process.on('uncaughtException', (error) => {
  console.error('[startup] Uncaught Exception:', error);
  notifyOpenClawNonBlocking('app.error', 'MingMe', {
    route: 'uncaughtException',
    code: 'UNCAUGHT_EXCEPTION',
    message: error?.message || 'uncaught exception',
    severity: 'critical',
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[startup] Unhandled Rejection:', reason);
  notifyOpenClawNonBlocking('app.error', 'MingMe', {
    route: 'unhandledRejection',
    code: 'UNHANDLED_REJECTION',
    message: reason?.message || `${reason || 'unhandled rejection'}`,
    severity: 'critical',
  });
});

function formatApiLabel(url = '') {
  if (url.includes('/health')) return '健康检查';
  if (url.includes('/api/ai/quota-status')) return 'AI 额度查询';
  if (url.includes('/api/ai/membership-status')) return '会员状态查询';
  if (url.includes('/api/ai/chat')) return 'AI 聊天';
  if (url.includes('/api/ai/ai-reading')) return 'AI 阅读生成';
  if (url.includes('/api/ai/transcribe')) return '语音转写';
  if (url.includes('/api/ai/track-event')) return '埋点上报';
  if (url.includes('/api/ai/paywall-lead')) return '付费意向提交';
  if (url.includes('/api/pay/create-order')) return '支付创建订单';
  if (url.includes('/api/pay/order/')) return '支付查单';
  if (url.includes('/api/pay/simulate-paid')) return '支付模拟成功';
  if (url.includes('/api/pay/notify/wechat')) return '微信支付回调';
  if (url.includes('/api/pay/notify/alipay')) return '支付宝回调';
  if (url.includes('/admin/api/usage-overview')) return '后台用量概览';
  if (url.includes('/admin/api/memberships')) return '后台会员列表';
  if (url.includes('/admin/api/set-membership')) return '后台会员设置';
  if (url.includes('/admin/api/set-extra-quota')) return '后台额外额度设置';
  if (url.includes('/admin/api/paywall-leads')) return '后台付费意向';
  if (url.includes('/admin/ai-usage')) return '后台页面';
  return '未知接口';
}

app.use(cors());
app.use((req, res, next) => {
  const startedAt = Date.now();
  const tag = `[${new Date().toISOString()}]`;
  const apiLabel = formatApiLabel(req.originalUrl);
  console.log(`${tag} 收到请求 | 接口: ${apiLabel} | 方法: ${req.method} | 路径: ${req.originalUrl}`);
  res.on('finish', () => {
    const elapsed = Date.now() - startedAt;
    const success = res.statusCode >= 200 && res.statusCode < 300 ? '成功' : '失败';
    const outputLength = Number(res.locals?.outputLength || 0);
    console.log(
      `${tag} 请求完成 | 接口: ${apiLabel} | 结果: ${success} | 状态码: ${res.statusCode} | 用时: ${elapsed}ms | 返回字数: ${outputLength}`
    );
  });
  next();
});

app.use(express.json({ limit: '2mb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: false, limit: '2mb', verify: captureRawBody }));

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'MingMe AI server root is healthy' });
});

app.head('/', (req, res) => {
  res.status(200).end();
});

app.get('/health', (req, res) => {
  notifyOpenClawNonBlocking('app.health', 'MingMe', {
    status: 'ok',
    route: '/health',
    method: 'GET',
  });
  res.json({ ok: true, message: 'MingMe AI server is running' });
});

app.use('/api/ai', aiRoutes);
app.use('/v1/ai', v1AiRoutes);
app.use('/api/pay', payRoutes);
app.use('/admin', adminRoutes);

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`SQLite 数据库已连接：${DB_FILE}`);
  const migrations = getMigrationMessages();
  if (migrations.length) {
    migrations.forEach((message) => console.log(`数据库迁移完成：${message}`));
  } else {
    console.log('数据库迁移完成：当前结构已是最新版本');
  }
  notifyOpenClawNonBlocking('app.health', 'MingMe', {
    status: 'running',
    port,
    route: 'startup',
    environment: process.env.RENDER ? 'render' : 'local',
  });
});
