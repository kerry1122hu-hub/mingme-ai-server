const express = require('express');
const {
  getMembershipStatus,
  setMembership,
  setExtraQuota,
  listUsageOverview,
  listMemberships,
  DB_FILE,
  DATA_DIR,
} = require('../services/quotaService');
const {
  getMemberMemoryAdmin,
  listMemberMemories,
} = require('../services/memory_service');
const { listAnalyticsEvents } = require('../services/analyticsService');
const { listPaywallLeads } = require('../services/paywallLeadService');
const { listManualPaymentReviews, approveManualPaymentReview } = require('../services/manualPaymentService');
const { listPaymentOrders, markOrderPaid } = require('../services/paymentService');
const { requireAdminToken } = require('../utils/auth');
const { ok, fail } = require('../utils/response');

const router = express.Router();

router.use(requireAdminToken);

router.get('/api/usage-overview', (req, res) => {
  try {
    const dateKey = req.query?.dateKey;
    const items = listUsageOverview({ dateKey, limit: req.query?.limit || 100 });
    res.locals.outputLength = JSON.stringify(items).length;
    return res.json(ok({ items }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.get('/api/memberships', (req, res) => {
  try {
    const items = listMemberships({ limit: req.query?.limit || 200 });
    res.locals.outputLength = JSON.stringify(items).length;
    return res.json(ok({ items }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.get('/api/member-memories', (req, res) => {
  try {
    const items = listMemberMemories({ limit: req.query?.limit || 100 });
    res.locals.outputLength = JSON.stringify(items).length;
    return res.json(ok({ items }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.get('/api/storage-status', (req, res) => {
  try {
    const dbFile = `${DB_FILE || ''}`;
    const dataDir = `${DATA_DIR || ''}`;
    const persistent = dbFile.startsWith('/data/') || dataDir.startsWith('/data/');
    const fallbackTmp = dbFile.startsWith('/tmp/') || dataDir.startsWith('/tmp/');
    const storage = {
      dbFile,
      dataDir,
      persistent,
      fallbackTmp,
      statusText: persistent ? '已使用持久化磁盘' : (fallbackTmp ? '当前仍在临时目录 /tmp' : '当前为自定义目录'),
    };

    res.locals.outputLength = JSON.stringify(storage).length;
    return res.json(ok({ storage }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.get('/api/analytics-events', (req, res) => {
  try {
    const items = listAnalyticsEvents({ limit: req.query?.limit || 100 });
    res.locals.outputLength = JSON.stringify(items).length;
    return res.json(ok({ items }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.get('/api/paywall-leads', (req, res) => {
  try {
    const items = listPaywallLeads({ limit: req.query?.limit || 100 });
    res.locals.outputLength = JSON.stringify(items).length;
    return res.json(ok({ items }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.get('/api/payment-orders', (req, res) => {
  try {
    const items = listPaymentOrders({ limit: req.query?.limit || 100 });
    res.locals.outputLength = JSON.stringify(items).length;
    return res.json(ok({ items }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/api/payment-simulate-paid', (req, res) => {
  try {
    const { orderId, provider = 'manual', providerTradeNo = '', tradeType = 'MANUAL' } = req.body || {};
    if (!orderId) {
      return res.status(400).json(fail('orderId is required', 'BAD_REQUEST'));
    }
    const result = markOrderPaid({
      orderId,
      provider,
      providerTradeNo,
      tradeType,
      verified: true,
      rawPayload: { source: 'admin_simulate_paid' },
    });
    res.locals.outputLength = JSON.stringify(result).length;
    return res.json(ok(result));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'simulate paid failed', 'SIMULATE_PAID_FAILED'));
  }
});

router.get('/api/manual-payment-reviews', (req, res) => {
  try {
    const items = listManualPaymentReviews({
      limit: req.query?.limit || 100,
      status: req.query?.status || '',
    });
    res.locals.outputLength = JSON.stringify(items).length;
    return res.json(ok({ items }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/api/manual-payment-approve', (req, res) => {
  try {
    const { id, reviewedNotes } = req.body || {};
    if (!id) {
      return res.status(400).json(fail('id is required', 'BAD_REQUEST'));
    }
    const result = approveManualPaymentReview({ id, reviewedNotes });
    res.locals.outputLength = JSON.stringify(result).length;
    return res.json(ok(result));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'approve manual payment failed', 'APPROVE_MANUAL_PAYMENT_FAILED'));
  }
});

router.post('/api/member-memory', (req, res) => {
  try {
    const { userKey, chart } = req.body || {};
    if (!userKey && !chart) {
      return res.status(400).json(fail('userKey or chart is required', 'BAD_REQUEST'));
    }
    const memory = getMemberMemoryAdmin({ userKey, chart });
    res.locals.outputLength = JSON.stringify(memory).length;
    return res.json(ok({ memory }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/api/membership-status', (req, res) => {
  try {
    const { userKey, chart } = req.body || {};
    const membership = getMembershipStatus({ userKey, chart });
    res.locals.outputLength = JSON.stringify(membership).length;
    return res.json(ok({ membership }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/api/set-membership', (req, res) => {
  try {
    const { userKey, chart, tier, status, expiresAt, notes } = req.body || {};
    if (!userKey && !chart) {
      return res.status(400).json(fail('userKey or chart is required', 'BAD_REQUEST'));
    }
    const membership = setMembership({ userKey, chart, tier, status, expiresAt, notes });
    res.locals.outputLength = JSON.stringify(membership).length;
    return res.json(ok({ membership }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/api/set-extra-quota', (req, res) => {
  try {
    const { userKey, chart, profile, dateKey, extraCount, notes } = req.body || {};
    if (!userKey && !chart) {
      return res.status(400).json(fail('userKey or chart is required', 'BAD_REQUEST'));
    }
    const quotaOverride = setExtraQuota({ userKey, chart, profile, dateKey, extraCount, notes });
    res.locals.outputLength = JSON.stringify(quotaOverride).length;
    return res.json(ok({ quotaOverride }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.get('/ai-usage', (req, res) => {
  const token = encodeURIComponent(req.query?.token || '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MingMe AI 用量后台</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #edf5f3; color: #18322e; }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 24px; }
    .hero { border-radius: 24px; padding: 24px; background: radial-gradient(circle at top, rgba(191,245,234,.82), rgba(234,243,240,.95) 40%, #f8fbfa 100%); box-shadow: 0 14px 40px rgba(27, 70, 64, 0.10); border: 1px solid rgba(117, 170, 160, 0.24); }
    h1 { margin: 0 0 8px; font-size: 30px; }
    .sub { color: #4d6964; margin-bottom: 20px; line-height: 1.7; }
    .toolbar { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
    .toolbar input, .toolbar select, .toolbar button, .form input, .form select, .form textarea { border-radius: 14px; border: 1px solid rgba(112, 150, 143, 0.35); padding: 10px 12px; background: rgba(255,255,255,.88); font-size: 14px; }
    .toolbar button, .form button { background: linear-gradient(135deg, #6ecfc0, #4aa7a1); color: white; border: 0; cursor: pointer; font-weight: 600; }
    .grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; margin-top: 20px; }
    .card { background: rgba(255,255,255,.88); border-radius: 22px; padding: 18px; box-shadow: 0 10px 28px rgba(24, 50, 46, 0.08); border: 1px solid rgba(117, 170, 160, 0.18); }
    .card h2 { margin: 0 0 12px; font-size: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid rgba(129, 166, 159, 0.20); text-align: left; vertical-align: top; }
    th { color: #476660; font-weight: 700; }
    .pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .premium { background: rgba(244, 210, 137, 0.24); color: #8a6412; }
    .free { background: rgba(118, 177, 167, 0.16); color: #2c6d66; }
    .muted { color: #66807c; }
    .form { display: grid; gap: 12px; }
    .row { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    .row3 { display: grid; gap: 12px; grid-template-columns: 1.2fr .8fr 1fr; }
    textarea { min-height: 88px; resize: vertical; }
    .status { margin-top: 10px; min-height: 20px; color: #2f5b55; font-size: 13px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .memory-panel { margin-top: 12px; padding: 14px; border-radius: 16px; background: rgba(245,251,249,0.88); border: 1px solid rgba(117, 170, 160, 0.18); }
    .memory-line + .memory-line { margin-top: 8px; }
    .storage-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 18px; }
    .storage-card { background: rgba(255,255,255,.82); border-radius: 18px; padding: 14px; border: 1px solid rgba(117, 170, 160, 0.18); }
    .storage-label { font-size: 12px; color: #66807c; margin-bottom: 6px; }
    .storage-value { font-size: 14px; line-height: 1.6; color: #18322e; word-break: break-all; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .row, .row3 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>MingMe AI 用量后台</h1>
      <div class="sub">这里可以查看今天谁在用 AI、还剩多少次、是不是会员，也可以手动补会员、补次数，并查看会员记忆是否已经开始生效。</div>
      <div class="toolbar">
        <input id="dateKey" type="date" />
        <button id="reloadBtn">刷新今日数据</button>
      </div>
      <div class="storage-grid">
        <div class="storage-card">
          <div class="storage-label">SQLite 路径</div>
          <div class="storage-value mono" id="dbFileValue">加载中...</div>
        </div>
        <div class="storage-card">
          <div class="storage-label">数据目录</div>
          <div class="storage-value mono" id="dataDirValue">加载中...</div>
        </div>
        <div class="storage-card">
          <div class="storage-label">持久化状态</div>
          <div class="storage-value" id="storageStatusValue">加载中...</div>
        </div>
      </div>
      <div class="status" id="topStatus"></div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>今日 AI 用量</h2>
        <table>
          <thead>
            <tr>
              <th>用户资料</th>
              <th>今日已用</th>
              <th>剩余 / 总额</th>
              <th>会员状态</th>
              <th>最后使用</th>
            </tr>
          </thead>
          <tbody id="usageBody"></tbody>
        </table>
      </div>

      <div class="card">
        <h2>会员状态设置</h2>
        <div class="form">
          <input id="userKey" placeholder="输入 userKey，例如 chart:1990-06-15-10-30-female" />
          <div class="row3">
            <select id="tier">
              <option value="free">免费</option>
              <option value="premium">会员</option>
            </select>
            <select id="status">
              <option value="active">生效中</option>
              <option value="inactive">未生效</option>
            </select>
            <input id="expiresAt" type="datetime-local" />
          </div>
          <textarea id="notes" placeholder="备注，例如：iOS 审核测试会员 / 手动赠送 30 天"></textarea>
          <button id="saveBtn">保存会员状态</button>
          <div class="status" id="saveStatus"></div>
        </div>

        <h2 style="margin-top:20px;">增加今日 AI 次数</h2>
        <div class="form">
          <input id="quotaUserKey" placeholder="输入 userKey，给某个用户增加今天的 AI 次数" />
          <div class="row">
            <input id="quotaDateKey" type="date" />
            <input id="extraCount" type="number" min="0" step="1" placeholder="额外增加次数，例如 5" />
          </div>
          <textarea id="quotaNotes" placeholder="备注，例如：人工补偿 5 次 / 测试赠送"></textarea>
          <button id="saveQuotaBtn">保存额外次数</button>
          <div class="status" id="quotaStatus"></div>
        </div>

        <h2 style="margin-top:20px;">会员列表</h2>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <input id="membershipSearch" placeholder="搜索 userKey / 昵称 / 邮箱 / 手机号 / 城市" />
        </div>
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>注册资料</th>
              <th>档位</th>
              <th>状态</th>
              <th>服务备注</th>
            </tr>
          </thead>
          <tbody id="membershipBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">会员记忆查看区</h2>
        <div class="form">
          <input id="memoryUserKey" placeholder="输入 userKey，查看这个会员被记住了什么" />
          <button id="loadMemoryBtn">查看会员记忆</button>
          <div class="status" id="memoryStatus"></div>
        </div>
        <div id="memoryDetail" class="memory-panel muted">先输入 userKey，再查看这个会员的长期关注、反复卡点、回答偏好和上次没聊完的点。</div>

        <h2 style="margin-top:20px;">最近会员记忆概览</h2>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <input id="memorySearch" placeholder="搜索 userKey / 昵称 / 邮箱 / 手机号" />
        </div>
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>关联信息</th>
              <th>长期关注</th>
              <th>上次未完结点</th>
              <th>回答偏好</th>
            </tr>
          </thead>
          <tbody id="memoryBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">付费意向看板</h2>
        <div class="storage-grid" style="margin-top:12px; margin-bottom:12px;">
          <div class="storage-card">
            <div class="storage-label">近 7 天提交</div>
            <div class="storage-value" id="leadRecentValue">--</div>
          </div>
          <div class="storage-card">
            <div class="storage-label">年度方案</div>
            <div class="storage-value" id="leadAnnualValue">--</div>
          </div>
          <div class="storage-card">
            <div class="storage-label">月度方案</div>
            <div class="storage-value" id="leadMonthlyValue">--</div>
          </div>
        </div>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <select id="leadPlanFilter">
            <option value="all">全部方案</option>
            <option value="annual">只看年度</option>
            <option value="monthly">只看月度</option>
          </select>
          <select id="leadContactFilter">
            <option value="all">全部线索</option>
            <option value="email">只看有邮箱</option>
            <option value="phone">只看有手机号</option>
            <option value="both">邮箱和手机号都有</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>提交时间</th>
              <th>用户信息</th>
              <th>方案</th>
              <th>联系方式</th>
              <th>关注问题</th>
            </tr>
          </thead>
          <tbody id="leadBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">待确认付款名单</h2>
        <table>
          <thead>
            <tr>
              <th>提交时间</th>
              <th>用户</th>
              <th>方案 / 支付方式</th>
              <th>付款信息</th>
              <th>凭证</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="manualPaymentBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">已开通付款记录</h2>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <input id="approvedPaymentSearch" placeholder="搜索 userKey / 昵称 / 邮箱 / 手机号" />
        </div>
        <table>
          <thead>
            <tr>
              <th>开通时间</th>
              <th>用户</th>
              <th>方案 / 支付方式</th>
              <th>付款信息</th>
              <th>凭证</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody id="approvedPaymentBody"></tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    const token = "${token}";
    const usageBody = document.getElementById('usageBody');
    const membershipBody = document.getElementById('membershipBody');
    const membershipSearch = document.getElementById('membershipSearch');
    const memoryBody = document.getElementById('memoryBody');
    const memorySearch = document.getElementById('memorySearch');
    const leadBody = document.getElementById('leadBody');
    const manualPaymentBody = document.getElementById('manualPaymentBody');
    const approvedPaymentBody = document.getElementById('approvedPaymentBody');
    const leadRecentValue = document.getElementById('leadRecentValue');
    const leadAnnualValue = document.getElementById('leadAnnualValue');
    const leadMonthlyValue = document.getElementById('leadMonthlyValue');
    const leadPlanFilter = document.getElementById('leadPlanFilter');
    const leadContactFilter = document.getElementById('leadContactFilter');
    const approvedPaymentSearch = document.getElementById('approvedPaymentSearch');
    const dateInput = document.getElementById('dateKey');
    const topStatus = document.getElementById('topStatus');
    const dbFileValue = document.getElementById('dbFileValue');
    const dataDirValue = document.getElementById('dataDirValue');
    const storageStatusValue = document.getElementById('storageStatusValue');
    const saveStatus = document.getElementById('saveStatus');
    const quotaStatus = document.getElementById('quotaStatus');
    const memoryStatus = document.getElementById('memoryStatus');
    const memoryDetail = document.getElementById('memoryDetail');
    let latestMembershipItems = [];
    let latestMemoryItems = [];
    let latestLeadItems = [];
    let latestManualPaymentItems = [];
    let latestApprovedPaymentItems = [];

    dateInput.value = new Date().toISOString().slice(0, 10);
    document.getElementById('quotaDateKey').value = new Date().toISOString().slice(0, 10);

    function joinText(list, fallback = '暂无') {
      return Array.isArray(list) && list.filter(Boolean).length
        ? list.filter(Boolean).join('、')
        : fallback;
    }

    async function requestJson(path, options = {}) {
      const url = new URL(path, window.location.origin);
      if (token) url.searchParams.set('token', token);
      const response = await fetch(url.toString(), {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          ...(token ? { 'x-admin-token': token } : {}),
        },
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || '请求失败');
      }
      return payload?.data || {};
    }

    function membershipPill(item) {
      return item?.isPremium
        ? '<span class="pill premium">会员</span>'
        : '<span class="pill free">免费</span>';
    }

    function renderUsage(items) {
      usageBody.innerHTML = items.length
        ? items.map((item) => '<tr>' +
          '<td><div><strong>' + (item.nickname || '未命名') + '</strong></div><div class="mono">' + item.userKey + '</div><div class="muted">' + [item.birthText, item.gender, item.city].filter(Boolean).join(' / ') + '</div><div class="muted">' + [item.roleText, item.focusText].filter(Boolean).join(' / ') + '</div></td>' +
          '<td>' + item.used + '</td>' +
          '<td>' + item.remaining + ' / ' + item.dailyLimit + (item.extraQuota ? ' <span class="muted">(+ ' + item.extraQuota + ')</span>' : '') + '</td>' +
          '<td>' + membershipPill(item) + '</td>' +
          '<td class="muted">' + (item.lastUsedAt || '--') + '</td>' +
          '</tr>').join('')
        : '<tr><td colspan="5" class="muted">今天还没有 AI 使用记录。</td></tr>';
    }

    function getMembershipRelatedProfile(item) {
      const userKey = String(item?.userKey || '').trim();
      const fromManual = latestManualPaymentItems.find((entry) => entry.userKey === userKey) || {};
      const fromApproved = latestApprovedPaymentItems.find((entry) => entry.userKey === userKey) || {};
      const fromLead = latestLeadItems.find((entry) => entry.userKey === userKey) || {};

      return {
        nickname: item.nickname || fromApproved.nickname || fromManual.nickname || fromLead.nickname || '',
        city: item.city || fromApproved.city || fromManual.city || fromLead.city || '',
        email: fromApproved.email || fromManual.email || fromLead.email || '',
        phone: fromApproved.phone || fromManual.phone || fromLead.phone || '',
      };
    }

    function getFilteredMemberships(items) {
      const keyword = String(membershipSearch?.value || '').trim().toLowerCase();
      if (!keyword) return items;
      return items.filter((item) => {
        const related = getMembershipRelatedProfile(item);
        const searchBase = [
          item.userKey,
          related.nickname,
          related.city,
          related.email,
          related.phone,
          item.birthText,
          item.roleText,
          item.focusText,
          item.notes,
        ].join(' ').toLowerCase();
        return searchBase.includes(keyword);
      });
    }

    function renderMemberships(items) {
      latestMembershipItems = Array.isArray(items) ? items : [];
      const filteredItems = getFilteredMemberships(latestMembershipItems);
      membershipBody.innerHTML = filteredItems.length
        ? filteredItems.map((item) => {
          const related = getMembershipRelatedProfile(item);
          const tierText = item.tier === 'premium' ? '会员' : '免费';
          const statusText = item.status === 'active' ? '生效中' : '未生效';
          return '<tr>' +
            '<td><div><strong>' + (related.nickname || '未留昵称') + '</strong></div><div class="mono">' + item.userKey + '</div><div class="muted">' + [item.birthText, item.gender, related.city].filter(Boolean).join(' / ') + '</div></td>' +
            '<td><div>' + (related.email || '未留邮箱') + '</div><div class="muted">' + (related.phone || '未留手机号') + '</div><div class="muted">' + (item.roleText || '未留角色') + '</div><div class="muted">' + (item.focusText || '未留关注方向') + '</div></td>' +
            '<td>' + tierText + (item.expiresAt ? '<div class="muted">到期：' + item.expiresAt + '</div>' : '') + '</td>' +
            '<td>' + statusText + '<div class="muted">更新：' + (item.updatedAt || '--') + '</div></td>' +
            '<td><div class="muted">' + (item.notes || '无备注') + '</div></td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="muted">还没有符合条件的会员记录。</td></tr>';
    }

    function getMemoryRelatedProfile(item) {
      const userKey = String(item?.userKey || '').trim();
      const fromMembership = latestMembershipItems.find((entry) => entry.userKey === userKey) || {};
      const fromManual = latestManualPaymentItems.find((entry) => entry.userKey === userKey) || {};
      const fromApproved = latestApprovedPaymentItems.find((entry) => entry.userKey === userKey) || {};
      const fromLead = latestLeadItems.find((entry) => entry.userKey === userKey) || {};

      return {
        nickname: fromManual.nickname || fromApproved.nickname || fromLead.nickname || fromMembership.nickname || '',
        email: fromManual.email || fromApproved.email || fromLead.email || '',
        phone: fromManual.phone || fromApproved.phone || fromLead.phone || '',
        city: fromManual.city || fromApproved.city || fromLead.city || fromMembership.city || '',
      };
    }

    function getFilteredMemories(items) {
      const keyword = String(memorySearch?.value || '').trim().toLowerCase();
      if (!keyword) return items;
      return items.filter((item) => {
        const related = getMemoryRelatedProfile(item);
        const searchBase = [
          item.userKey,
          related.nickname,
          related.email,
          related.phone,
          related.city,
          ...(item.profileMemory?.longTermFocus || []),
          item.sessionMemory?.lastOpenLoop,
        ].join(' ').toLowerCase();
        return searchBase.includes(keyword);
      });
    }

    function renderMemoryList(items) {
      latestMemoryItems = Array.isArray(items) ? items : [];
      const filteredItems = getFilteredMemories(latestMemoryItems);
      memoryBody.innerHTML = filteredItems.length
        ? filteredItems.map((item) => {
          const related = getMemoryRelatedProfile(item);
          const focus = joinText(item.profileMemory?.longTermFocus, '未形成');
          const openLoop = item.sessionMemory?.lastOpenLoop || '暂无';
          const prefs = [
            item.responsePreference?.likesStrongConclusion ? '喜欢直接结论' : '',
            item.responsePreference?.likesMysticLanguage ? '偏术语' : '',
            item.responsePreference?.likesModernExplanation ? '要现代解释' : '',
            item.responsePreference?.avoidVerboseTemplate ? '不爱模板腔' : '',
          ].filter(Boolean).join(' / ') || '未形成';
          return '<tr>' +
            '<td><div class="mono">' + item.userKey + '</div></td>' +
            '<td><div><strong>' + (related.nickname || '未留昵称') + '</strong></div><div class="muted">' + (related.email || '未留邮箱') + '</div><div class="muted">' + (related.phone || '未留手机号') + '</div><div class="muted">' + (related.city || '未留城市') + '</div></td>' +
            '<td>' + focus + '</td>' +
            '<td>' + openLoop + '</td>' +
            '<td>' + prefs + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="muted">还没有符合条件的会员记忆记录。</td></tr>';
    }

    function renderMemoryDetail(memory) {
      const focus = joinText(memory.profileMemory?.longTermFocus, '未形成');
      const pain = joinText(memory.profileMemory?.recurringPainPoints, '未形成');
      const compared = joinText(memory.sessionMemory?.lastComparedOptions, '无');
      const prefs = [
        memory.responsePreference?.likesStrongConclusion ? '喜欢直接结论' : '',
        memory.responsePreference?.likesMysticLanguage ? '接受玄学术语' : '',
        memory.responsePreference?.likesModernExplanation ? '希望有人话解释' : '',
        memory.responsePreference?.likesComparisonAnswer ? '常问比较题' : '',
        memory.responsePreference?.likesFollowupQuestion ? '接受追问' : '',
        memory.responsePreference?.avoidVerboseTemplate ? '不喜欢模板长答' : '',
      ].filter(Boolean).join('、') || '未形成';

      memoryDetail.innerHTML = [
        '<div class="memory-line"><strong>用户键：</strong><span class="mono">' + (memory.userKey || '--') + '</span></div>',
        '<div class="memory-line"><strong>长期关注：</strong>' + focus + '</div>',
        '<div class="memory-line"><strong>反复卡点：</strong>' + pain + '</div>',
        '<div class="memory-line"><strong>上次核心判断：</strong>' + (memory.sessionMemory?.lastCoreJudgment || '暂无') + '</div>',
        '<div class="memory-line"><strong>上次给的动作：</strong>' + (memory.sessionMemory?.lastActionGiven || '暂无') + '</div>',
        '<div class="memory-line"><strong>上次未完结点：</strong>' + (memory.sessionMemory?.lastOpenLoop || '暂无') + '</div>',
        '<div class="memory-line"><strong>上次比较题：</strong>' + compared + '</div>',
        '<div class="memory-line"><strong>最近情绪走势：</strong>' + (memory.sessionMemory?.recentMoodTrend || 'unknown') + '</div>',
        '<div class="memory-line"><strong>回答偏好：</strong>' + prefs + '</div>',
      ].join('');
    }

    function isRecentLead(item) {
      const time = item?.createdAt ? new Date(item.createdAt).getTime() : NaN;
      if (!Number.isFinite(time)) return false;
      return Date.now() - time <= 7 * 24 * 60 * 60 * 1000;
    }

    function getFilteredLeads(items) {
      const planFilter = leadPlanFilter?.value || 'all';
      const contactFilter = leadContactFilter?.value || 'all';

      return items.filter((item) => {
        if (planFilter !== 'all' && item.selectedPlan !== planFilter) {
          return false;
        }

        const hasEmail = Boolean(String(item.email || '').trim());
        const hasPhone = Boolean(String(item.phone || '').trim());

        if (contactFilter === 'email' && !hasEmail) return false;
        if (contactFilter === 'phone' && !hasPhone) return false;
        if (contactFilter === 'both' && !(hasEmail && hasPhone)) return false;
        return true;
      });
    }

    function renderLeadStats(items) {
      const annualCount = items.filter((item) => item.selectedPlan === 'annual').length;
      const monthlyCount = items.filter((item) => item.selectedPlan === 'monthly').length;
      const recentCount = items.filter(isRecentLead).length;

      leadAnnualValue.textContent = annualCount + ' 条';
      leadMonthlyValue.textContent = monthlyCount + ' 条';
      leadRecentValue.textContent = recentCount + ' 条';
    }

    function renderPaywallLeads(items) {
      latestLeadItems = Array.isArray(items) ? items : [];
      renderLeadStats(latestLeadItems);
      const filteredItems = getFilteredLeads(latestLeadItems);

      leadBody.innerHTML = filteredItems.length
        ? filteredItems.map((item) => {
          const hasEmail = Boolean(String(item.email || '').trim());
          const hasPhone = Boolean(String(item.phone || '').trim());
          const contactText = hasEmail && hasPhone
            ? '邮箱 + 手机'
            : hasEmail
              ? '仅邮箱'
              : hasPhone
                ? '仅手机'
                : '未留联系方式';

          return '<tr>' +
            '<td class="muted">' + (item.createdAt || '--') + '</td>' +
            '<td><div><strong>' + (item.nickname || '未留称呼') + '</strong></div><div class="mono">' + (item.userKey || '--') + '</div><div class="muted">' + (item.city || '未留城市') + '</div></td>' +
            '<td><strong>' + (item.selectedPlan === 'annual' ? '年度会员' : '月度会员') + '</strong><div class="muted">' + (item.source || '--') + '</div></td>' +
            '<td><div>' + (item.email || '未留邮箱') + '</div><div class="muted">' + (item.phone || '未留手机号') + '</div><div class="muted">' + contactText + '</div></td>' +
            '<td>' + (item.focus || '未填写') + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="muted">当前筛选条件下还没有新的付费意向。</td></tr>';
    }

    function renderManualPaymentReviews(items) {
      latestManualPaymentItems = Array.isArray(items) ? items : [];
      manualPaymentBody.innerHTML = items.length
        ? items.map((item) => {
          const preview = item.screenshotDataUrl
            ? '<img src="' + item.screenshotDataUrl + '" alt="付款凭证" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid rgba(117,170,160,0.18);" />'
            : '<span class="muted">未上传截图</span>';
          const approveButton = item.status === 'approved'
            ? '<span class="pill premium">已开通</span>'
            : '<button data-approve-review="' + item.id + '" style="background:linear-gradient(135deg,#6ecfc0,#4aa7a1);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700;">一键开通会员</button>';

          return '<tr>' +
            '<td class="muted">' + (item.createdAt || '--') + '</td>' +
            '<td><div><strong>' + (item.nickname || '未留称呼') + '</strong></div><div class="mono">' + (item.userKey || '--') + '</div><div class="muted">' + (item.city || '未留城市') + '</div><div class="muted">' + (item.email || '未留邮箱') + '</div><div class="muted">' + (item.phone || '未留手机号') + '</div></td>' +
            '<td><div><strong>' + (item.selectedPlan === 'annual' ? '年度会员' : '月度会员') + '</strong></div><div class="muted">' + (item.paymentMethod === 'wechat' ? '微信收款码' : '支付宝收款码') + '</div><div class="muted">' + (item.status === 'approved' ? '已开通' : '待确认') + '</div></td>' +
            '<td><div>金额：' + (item.amountText || '未填') + '</div><div class="muted">付款时间：' + (item.paidAtText || '未填') + '</div><div class="muted">' + (item.notes || '无备注') + '</div></td>' +
            '<td>' + preview + '</td>' +
            '<td>' + approveButton + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="6" class="muted">还没有待确认付款记录。</td></tr>';
    }

    function getFilteredApprovedPayments(items) {
      const keyword = String(approvedPaymentSearch?.value || '').trim().toLowerCase();
      if (!keyword) return items;
      return items.filter((item) => {
        const searchBase = [
          item.userKey,
          item.nickname,
          item.email,
          item.phone,
          item.city,
          item.amountText,
          item.paidAtText,
        ].join(' ').toLowerCase();
        return searchBase.includes(keyword);
      });
    }

    function renderApprovedPaymentReviews(items) {
      latestApprovedPaymentItems = Array.isArray(items) ? items : [];
      const filteredItems = getFilteredApprovedPayments(latestApprovedPaymentItems);
      approvedPaymentBody.innerHTML = filteredItems.length
        ? filteredItems.map((item) => {
          const preview = item.screenshotDataUrl
            ? '<a href="' + item.screenshotDataUrl + '" target="_blank" rel="noreferrer"><img src="' + item.screenshotDataUrl + '" alt="付款凭证" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid rgba(117,170,160,0.18);" /></a>'
            : '<span class="muted">未上传截图</span>';

          return '<tr>' +
            '<td class="muted">' + (item.reviewedAt || item.createdAt || '--') + '</td>' +
            '<td><div><strong>' + (item.nickname || '未留称呼') + '</strong></div><div class="mono">' + (item.userKey || '--') + '</div><div class="muted">' + (item.city || '未留城市') + '</div><div class="muted">' + (item.email || '未留邮箱') + '</div><div class="muted">' + (item.phone || '未留手机号') + '</div></td>' +
            '<td><div><strong>' + (item.selectedPlan === 'annual' ? '年度会员' : '月度会员') + '</strong></div><div class="muted">' + (item.paymentMethod === 'wechat' ? '微信收款码' : '支付宝收款码') + '</div><div class="muted">已开通</div></td>' +
            '<td><div>金额：' + (item.amountText || '未填') + '</div><div class="muted">付款时间：' + (item.paidAtText || '未填') + '</div></td>' +
            '<td>' + preview + '</td>' +
            '<td><div class="muted">' + (item.reviewedNotes || item.notes || '无备注') + '</div></td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="6" class="muted">还没有已开通付款记录。</td></tr>';
    }

    function renderStorage(storage) {
      dbFileValue.textContent = storage?.dbFile || '--';
      dataDirValue.textContent = storage?.dataDir || '--';
      storageStatusValue.textContent = storage?.statusText || '--';
      storageStatusValue.style.color = storage?.persistent ? '#2c6d66' : '#8a6412';
    }

    async function approveManualPayment(id) {
      topStatus.textContent = '正在开通会员...';
      try {
        await requestJson('/admin/api/manual-payment-approve', {
          method: 'POST',
          body: JSON.stringify({ id }),
        });
        topStatus.textContent = '已开通会员。';
        await loadOverview();
      } catch (error) {
        topStatus.textContent = '开通失败：' + error.message;
      }
    }

    async function loadOverview() {
      topStatus.textContent = '正在刷新...';
      try {
        const [usage, memberships, memories, storage, leads, manualPayments, approvedManualPayments] = await Promise.all([
          requestJson('/admin/api/usage-overview?dateKey=' + encodeURIComponent(dateInput.value)),
          requestJson('/admin/api/memberships'),
          requestJson('/admin/api/member-memories'),
          requestJson('/admin/api/storage-status'),
          requestJson('/admin/api/paywall-leads'),
          requestJson('/admin/api/manual-payment-reviews?status=pending'),
          requestJson('/admin/api/manual-payment-reviews?status=approved'),
        ]);
        renderUsage(usage.items || []);
        renderMemberships(memberships.items || []);
        renderMemoryList(memories.items || []);
        renderStorage(storage.storage || {});
        renderPaywallLeads(leads.items || []);
        renderManualPaymentReviews(manualPayments.items || []);
        renderApprovedPaymentReviews(approvedManualPayments.items || []);
        topStatus.textContent = '已刷新。';
      } catch (error) {
        topStatus.textContent = '刷新失败：' + error.message;
      }
    }

    async function saveMembership() {
      saveStatus.textContent = '正在保存...';
      try {
        const payload = {
          userKey: document.getElementById('userKey').value.trim(),
          tier: document.getElementById('tier').value,
          status: document.getElementById('status').value,
          expiresAt: document.getElementById('expiresAt').value || null,
          notes: document.getElementById('notes').value.trim(),
        };
        if (!payload.userKey) {
          throw new Error('请先输入 userKey');
        }
        const result = await requestJson('/admin/api/set-membership', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        saveStatus.textContent = '保存成功：' + result.membership.userKey + ' -> ' + result.membership.tier;
        await loadOverview();
      } catch (error) {
        saveStatus.textContent = '保存失败：' + error.message;
      }
    }

    async function saveExtraQuota() {
      quotaStatus.textContent = '正在保存...';
      try {
        const payload = {
          userKey: document.getElementById('quotaUserKey').value.trim(),
          dateKey: document.getElementById('quotaDateKey').value,
          extraCount: Number(document.getElementById('extraCount').value || 0),
          notes: document.getElementById('quotaNotes').value.trim(),
        };
        if (!payload.userKey) {
          throw new Error('请先输入 userKey');
        }
        const result = await requestJson('/admin/api/set-extra-quota', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        quotaStatus.textContent = '保存成功：' + result.quotaOverride.userKey + ' -> +' + result.quotaOverride.extraCount + ' 次';
        await loadOverview();
      } catch (error) {
        quotaStatus.textContent = '保存失败：' + error.message;
      }
    }

    async function loadMemberMemory() {
      memoryStatus.textContent = '正在读取会员记忆...';
      try {
        const payload = {
          userKey: document.getElementById('memoryUserKey').value.trim(),
        };
        if (!payload.userKey) {
          throw new Error('请先输入 userKey');
        }
        const result = await requestJson('/admin/api/member-memory', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        renderMemoryDetail(result.memory || {});
        memoryStatus.textContent = '会员记忆已加载。';
      } catch (error) {
        memoryStatus.textContent = '读取失败：' + error.message;
      }
    }

    document.getElementById('reloadBtn').addEventListener('click', loadOverview);
    document.getElementById('saveBtn').addEventListener('click', saveMembership);
    document.getElementById('saveQuotaBtn').addEventListener('click', saveExtraQuota);
    document.getElementById('loadMemoryBtn').addEventListener('click', loadMemberMemory);
    membershipSearch.addEventListener('input', () => renderMemberships(latestMembershipItems));
    leadPlanFilter.addEventListener('change', () => renderPaywallLeads(latestLeadItems));
    leadContactFilter.addEventListener('change', () => renderPaywallLeads(latestLeadItems));
    memorySearch.addEventListener('input', () => renderMemoryList(latestMemoryItems));
    approvedPaymentSearch.addEventListener('input', () => renderApprovedPaymentReviews(latestApprovedPaymentItems));
    document.addEventListener('click', (event) => {
      const reviewId = event.target?.getAttribute?.('data-approve-review');
      if (reviewId) {
        approveManualPayment(reviewId);
      }
    });
    loadOverview();
  </script>
</body>
</html>`);
});

module.exports = router;
