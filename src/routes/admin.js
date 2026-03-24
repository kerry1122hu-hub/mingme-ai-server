const express = require('express');
const {
  getMembershipStatus,
  setMembership,
  setExtraQuota,
  listUsageOverview,
  listMemberships,
} = require('../services/quotaService');
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
    .sub { color: #4d6964; margin-bottom: 20px; }
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
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .row, .row3 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>MingMe AI 用量后台</h1>
      <div class="sub">直接查看今天谁用了 AI、用了几次、是不是会员。也可以手动把某个用户改成会员，方便你测试真实额度控制。</div>
      <div class="toolbar">
        <input id="dateKey" type="date" />
        <button id="reloadBtn">刷新今天用量</button>
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
              <th>会员</th>
              <th>更新时间</th>
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

        <h2 style="margin-top:20px;">最近会员记录</h2>
        <table>
          <thead>
            <tr>
              <th>用户键</th>
              <th>档位</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody id="membershipBody"></tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    const token = "${token}";
    const usageBody = document.getElementById('usageBody');
    const membershipBody = document.getElementById('membershipBody');
    const dateInput = document.getElementById('dateKey');
    const topStatus = document.getElementById('topStatus');
    const saveStatus = document.getElementById('saveStatus');
    const quotaStatus = document.getElementById('quotaStatus');

    dateInput.value = new Date().toISOString().slice(0, 10);
    document.getElementById('quotaDateKey').value = new Date().toISOString().slice(0, 10);

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

    function renderMemberships(items) {
      membershipBody.innerHTML = items.length
        ? items.map((item) => '<tr>' +
          '<td><div><strong>' + (item.nickname || '未命名') + '</strong></div><div class="mono">' + item.userKey + '</div><div class="muted">' + [item.birthText, item.gender, item.city].filter(Boolean).join(' / ') + '</div></td>' +
          '<td>' + (item.tier || 'free') + '</td>' +
          '<td>' + (item.status || 'active') + '</td>' +
          '</tr>').join('')
        : '<tr><td colspan="3" class="muted">还没有会员记录。</td></tr>';
    }

    async function loadOverview() {
      topStatus.textContent = '正在刷新...';
      try {
        const usage = await requestJson('/admin/api/usage-overview?dateKey=' + encodeURIComponent(dateInput.value));
        const memberships = await requestJson('/admin/api/memberships');
        renderUsage(usage.items || []);
        renderMemberships(memberships.items || []);
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

    document.getElementById('reloadBtn').addEventListener('click', loadOverview);
    document.getElementById('saveBtn').addEventListener('click', saveMembership);
    document.getElementById('saveQuotaBtn').addEventListener('click', saveExtraQuota);
    loadOverview();
  </script>
</body>
</html>`);
});

module.exports = router;
