require('dotenv').config();
const express = require('express');
const cors = require('cors');
const aiRoutes = require('./src/routes/ai');
const adminRoutes = require('./src/routes/admin');
const { DB_FILE, getMigrationMessages } = require('./src/services/quotaService');

const app = express();

process.on('uncaughtException', (error) => {
  console.error('[startup] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[startup] Unhandled Rejection:', reason);
});

function formatApiLabel(url = '') {
  if (url.includes('/health')) return '健康检查';
  if (url.includes('/api/ai/quota-status')) return 'AI 额度查询';
  if (url.includes('/api/ai/membership-status')) return '会员状态查询';
  if (url.includes('/api/ai/chat')) return 'AI 聊天';
  if (url.includes('/api/ai/ai-reading')) return 'AI 阅读生成';
  if (url.includes('/api/ai/transcribe')) return '语音转写';
  if (url.includes('/admin/api/usage-overview')) return '后台用量概览';
  if (url.includes('/admin/api/memberships')) return '后台会员列表';
  if (url.includes('/admin/api/set-membership')) return '后台会员设置';
  if (url.includes('/admin/api/set-extra-quota')) return '后台额外额度设置';
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
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'MingMe AI server is running' });
});

app.use('/api/ai', aiRoutes);
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
});
