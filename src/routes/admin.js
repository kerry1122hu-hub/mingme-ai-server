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
      statusText: persistent ? '宸蹭娇鐢ㄦ寔涔呭寲纾佺洏' : (fallbackTmp ? '褰撳墠浠嶅湪涓存椂鐩綍 /tmp' : '褰撳墠涓鸿嚜瀹氫箟鐩綍'),
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
  <title>MingMe AI 鐢ㄩ噺鍚庡彴</title>
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
    .admin-shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px; margin-top: 20px; align-items: start; }
    .admin-sidebar { position: sticky; top: 20px; background: rgba(255,255,255,.9); border-radius: 22px; padding: 16px; box-shadow: 0 10px 28px rgba(24, 50, 46, 0.08); border: 1px solid rgba(117, 170, 160, 0.18); }
    .admin-sidebar-title { font-size: 13px; font-weight: 800; color: #4d6964; margin-bottom: 12px; }
    .admin-nav { display: grid; gap: 10px; }
    .admin-nav-button { width: 100%; text-align: left; border-radius: 14px; border: 1px solid rgba(117, 170, 160, 0.18); background: rgba(247,251,250,.95); color: #18322e; padding: 12px 14px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .admin-nav-button:hover { border-color: rgba(74,167,161,0.4); background: rgba(237,248,245,.98); }
    .admin-main .grid { grid-template-columns: 1fr; margin-top: 0; }
    .admin-main .card { padding: 0; background: transparent; border: 0; box-shadow: none; display: grid; gap: 16px; }
    .card { background: rgba(255,255,255,.88); border-radius: 22px; padding: 18px; box-shadow: 0 10px 28px rgba(24, 50, 46, 0.08); border: 1px solid rgba(117, 170, 160, 0.18); }
    .card h2 { margin: 0 0 12px; font-size: 20px; }
    .admin-section { background: rgba(255,255,255,.9); border-radius: 22px; border: 1px solid rgba(117, 170, 160, 0.18); box-shadow: 0 10px 28px rgba(24, 50, 46, 0.08); overflow: hidden; }
    .admin-section summary { list-style: none; cursor: pointer; padding: 18px 20px; font-size: 18px; font-weight: 800; color: #18322e; display: flex; align-items: center; justify-content: space-between; }
    .admin-section summary::-webkit-details-marker { display: none; }
    .admin-section summary::after { content: '灞曞紑'; font-size: 12px; font-weight: 700; color: #4aa7a1; background: rgba(234,243,240,.95); border-radius: 999px; padding: 5px 10px; }
    .admin-section[open] summary::after { content: '鏀惰捣'; }
    .section-content { padding: 0 20px 20px; }
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
    @media (max-width: 900px) { .grid, .admin-shell { grid-template-columns: 1fr; } .row, .row3 { grid-template-columns: 1fr; } .admin-sidebar { position: static; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>MingMe AI 鐢ㄩ噺鍚庡彴</h1>
      <div class="sub">杩欓噷鍙互鏌ョ湅浠婂ぉ璋佸湪鐢?AI銆佽繕鍓╁灏戞銆佹槸涓嶆槸浼氬憳锛屼篃鍙互鎵嬪姩琛ヤ細鍛樸€佽ˉ娆℃暟锛屽苟鏌ョ湅浼氬憳璁板繂鏄惁宸茬粡寮€濮嬬敓鏁堛€?/div>
      <div class="toolbar">
        <input id="dateKey" type="date" />
        <button id="reloadBtn">鍒锋柊浠婃棩鏁版嵁</button>
      </div>
      <div class="storage-grid">
        <div class="storage-card">
          <div class="storage-label">SQLite 璺緞</div>
          <div class="storage-value mono" id="dbFileValue">鍔犺浇涓?..</div>
        </div>
        <div class="storage-card">
          <div class="storage-label">鏁版嵁鐩綍</div>
          <div class="storage-value mono" id="dataDirValue">鍔犺浇涓?..</div>
        </div>
        <div class="storage-card">
          <div class="storage-label">鎸佷箙鍖栫姸鎬?/div>
          <div class="storage-value" id="storageStatusValue">鍔犺浇涓?..</div>
        </div>
      </div>
      <div class="status" id="topStatus"></div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>浠婃棩 AI 鐢ㄩ噺</h2>
        <table>
          <thead>
            <tr>
              <th>鐢ㄦ埛璧勬枡</th>
              <th>浠婃棩宸茬敤</th>
              <th>鍓╀綑 / 鎬婚</th>
              <th>浼氬憳鐘舵€?/th>
              <th>鏈€鍚庝娇鐢?/th>
            </tr>
          </thead>
          <tbody id="usageBody"></tbody>
        </table>
      </div>

      <div class="card">
        <h2>浼氬憳鐘舵€佽缃?/h2>
        <div class="form">
          <input id="userKey" placeholder="杈撳叆 userKey锛屼緥濡?chart:1990-06-15-10-30-female" />
          <div class="row3">
            <select id="tier">
              <option value="free">鍏嶈垂</option>
              <option value="premium">浼氬憳</option>
            </select>
            <select id="status">
              <option value="active">鐢熸晥涓?/option>
              <option value="inactive">鏈敓鏁?/option>
            </select>
            <input id="expiresAt" type="datetime-local" />
          </div>
          <textarea id="notes" placeholder="澶囨敞锛屼緥濡傦細iOS 瀹℃牳娴嬭瘯浼氬憳 / 鎵嬪姩璧犻€?30 澶?></textarea>
          <button id="saveBtn">淇濆瓨浼氬憳鐘舵€?/button>
          <div class="status" id="saveStatus"></div>
        </div>

        <h2 style="margin-top:20px;">澧炲姞浠婃棩 AI 娆℃暟</h2>
        <div class="form">
          <input id="quotaUserKey" placeholder="杈撳叆 userKey锛岀粰鏌愪釜鐢ㄦ埛澧炲姞浠婂ぉ鐨?AI 娆℃暟" />
          <div class="row">
            <input id="quotaDateKey" type="date" />
            <input id="extraCount" type="number" min="0" step="1" placeholder="棰濆澧炲姞娆℃暟锛屼緥濡?5" />
          </div>
          <textarea id="quotaNotes" placeholder="澶囨敞锛屼緥濡傦細浜哄伐琛ュ伩 5 娆?/ 娴嬭瘯璧犻€?></textarea>
          <button id="saveQuotaBtn">淇濆瓨棰濆娆℃暟</button>
          <div class="status" id="quotaStatus"></div>
        </div>

        <h2 style="margin-top:20px;">浼氬憳鍒楄〃</h2>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <input id="membershipSearch" placeholder="鎼滅储 userKey / 鏄电О / 閭 / 鎵嬫満鍙?/ 鍩庡競" />
        </div>
        <table>
          <thead>
            <tr>
              <th>鐢ㄦ埛</th>
              <th>妗ｄ綅</th>
              <th>鐘舵€?/th>
              <th>鎿嶄綔</th>
            </tr>
          </thead>
          <tbody id="membershipBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">浼氬憳璁板繂鏌ョ湅鍖?/h2>
        <div class="form">
          <input id="memoryUserKey" placeholder="杈撳叆 userKey锛屾煡鐪嬭繖涓細鍛樿璁颁綇浜嗕粈涔? />
          <button id="loadMemoryBtn">鏌ョ湅浼氬憳璁板繂</button>
          <div class="status" id="memoryStatus"></div>
        </div>
        <div id="memoryDetail" class="memory-panel muted">鍏堣緭鍏?userKey锛屽啀鏌ョ湅杩欎釜浼氬憳鐨勯暱鏈熷叧娉ㄣ€佸弽澶嶅崱鐐广€佸洖绛斿亸濂藉拰涓婃娌¤亰瀹岀殑鐐广€?/div>

        <h2 style="margin-top:20px;">鏈€杩戜細鍛樿蹇嗘瑙?/h2>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <input id="memorySearch" placeholder="鎼滅储 userKey / 鏄电О / 閭 / 鎵嬫満鍙? />
        </div>
        <table>
          <thead>
            <tr>
              <th>鐢ㄦ埛</th>
              <th>鍏宠仈淇℃伅</th>
              <th>闀挎湡鍏虫敞</th>
              <th>涓婃鏈畬缁撶偣</th>
              <th>鍥炵瓟鍋忓ソ</th>
            </tr>
          </thead>
          <tbody id="memoryBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">浠樿垂鎰忓悜鐪嬫澘</h2>
        <div class="storage-grid" style="margin-top:12px; margin-bottom:12px;">
          <div class="storage-card">
            <div class="storage-label">杩?7 澶╂彁浜?/div>
            <div class="storage-value" id="leadRecentValue">--</div>
          </div>
          <div class="storage-card">
            <div class="storage-label">骞村害鏂规</div>
            <div class="storage-value" id="leadAnnualValue">--</div>
          </div>
          <div class="storage-card">
            <div class="storage-label">鏈堝害鏂规</div>
            <div class="storage-value" id="leadMonthlyValue">--</div>
          </div>
        </div>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <select id="leadPlanFilter">
            <option value="all">鍏ㄩ儴鏂规</option>
            <option value="annual">鍙湅骞村害</option>
            <option value="monthly">鍙湅鏈堝害</option>
          </select>
          <select id="leadContactFilter">
            <option value="all">鍏ㄩ儴绾跨储</option>
            <option value="email">鍙湅鏈夐偖绠?/option>
            <option value="phone">鍙湅鏈夋墜鏈哄彿</option>
            <option value="both">閭鍜屾墜鏈哄彿閮芥湁</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>鎻愪氦鏃堕棿</th>
              <th>鐢ㄦ埛淇℃伅</th>
              <th>鏂规</th>
              <th>鑱旂郴鏂瑰紡</th>
              <th>鍏虫敞闂</th>
            </tr>
          </thead>
          <tbody id="leadBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">寰呯‘璁や粯娆惧悕鍗?/h2>
        <table>
          <thead>
            <tr>
              <th>鎻愪氦鏃堕棿</th>
              <th>鐢ㄦ埛</th>
              <th>鏂规 / 鏀粯鏂瑰紡</th>
              <th>浠樻淇℃伅</th>
              <th>鍑瘉</th>
              <th>鎿嶄綔</th>
            </tr>
          </thead>
          <tbody id="manualPaymentBody"></tbody>
        </table>

        <h2 style="margin-top:20px;">宸插紑閫氫粯娆捐褰?/h2>
        <div class="toolbar" style="margin-top:0; margin-bottom:12px;">
          <input id="approvedPaymentSearch" placeholder="鎼滅储 userKey / 鏄电О / 閭 / 鎵嬫満鍙? />
        </div>
        <table>
          <thead>
            <tr>
              <th>寮€閫氭椂闂?/th>
              <th>鐢ㄦ埛</th>
              <th>鏂规 / 鏀粯鏂瑰紡</th>
              <th>浠樻淇℃伅</th>
              <th>鍑瘉</th>
              <th>澶囨敞</th>
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
    let expandedMembershipRows = {};
    let latestMemoryItems = [];
    let latestLeadItems = [];
    let latestManualPaymentItems = [];
    let latestApprovedPaymentItems = [];

    dateInput.value = new Date().toISOString().slice(0, 10);
    document.getElementById('quotaDateKey').value = new Date().toISOString().slice(0, 10);

    function joinText(list, fallback = '鏆傛棤') {
      return Array.isArray(list) && list.filter(Boolean).length
        ? list.filter(Boolean).join('銆?)
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
        throw new Error(payload?.error || '璇锋眰澶辫触');
      }
      return payload?.data || {};
    }

    function membershipPill(item) {
      return item?.isPremium
        ? ''<span class="pill premium">浼氬憳</span>''
        : ''<span class="pill free">鍏嶈垂</span>'';
    }

    function buildAdminSection(title, nodes, sectionId, shouldOpen = false) {
      const details = document.createElement('details');
      details.className = 'admin-section';
      details.id = sectionId;
      details.open = shouldOpen;

      const summary = document.createElement('summary');
      summary.textContent = title || '未命名栏目';

      const content = document.createElement('div');
      content.className = 'section-content';
      nodes.forEach((node) => content.appendChild(node));

      details.appendChild(summary);
      details.appendChild(content);
      return details;
    }

    function transformCardToSections(card, prefix, openFirst = false) {
      const children = Array.from(card.children);
      const groups = [];
      let currentTitle = '';
      let currentNodes = [];

      children.forEach((node) => {
        if (node.tagName === 'H2') {
          if (currentTitle || currentNodes.length) {
            groups.push({ title: currentTitle || '未命名栏目', nodes: currentNodes });
          }
          currentTitle = node.textContent.trim();
          currentNodes = [];
          return;
        }
        currentNodes.push(node);
      });

      if (currentTitle || currentNodes.length) {
        groups.push({ title: currentTitle || '未命名栏目', nodes: currentNodes });
      }

      card.innerHTML = '';
      return groups.map((group, index) => {
        const sectionId = prefix + '-' + (index + 1);
        const section = buildAdminSection(group.title, group.nodes, sectionId, openFirst && index === 0);
        card.appendChild(section);
        return { id: sectionId, title: group.title };
      });
    }

    function enhanceAdminAccordionLayout() {
      if (document.body.dataset.adminEnhanced === '1') return;
      const wrap = document.querySelector('.wrap');
      const grid = document.querySelector('.grid');
      if (!wrap || !grid) return;

      const shell = document.createElement('div');
      shell.className = 'admin-shell';
      const sidebar = document.createElement('aside');
      sidebar.className = 'admin-sidebar';
      const sidebarTitle = document.createElement('div');
      sidebarTitle.className = 'admin-sidebar-title';
      sidebarTitle.textContent = '后台栏目';
      const nav = document.createElement('div');
      nav.className = 'admin-nav';
      sidebar.appendChild(sidebarTitle);
      sidebar.appendChild(nav);

      const main = document.createElement('div');
      main.className = 'admin-main';

      wrap.insertBefore(shell, grid);
      shell.appendChild(sidebar);
      shell.appendChild(main);
      main.appendChild(grid);

      const cards = Array.from(grid.querySelectorAll(':scope > .card'));
      const sections = [];
      cards.forEach((card, index) => {
        sections.push(...transformCardToSections(card, index === 0 ? 'usage' : 'manage', index === 0));
      });

      sections.forEach((section) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-nav-button';
        button.dataset.sectionTarget = section.id;
        button.textContent = section.title;
        nav.appendChild(button);
      });

      document.body.dataset.adminEnhanced = '1';
    }

    function renderUsage(items) {
      usageBody.innerHTML = items.length
        ? items.map((item) => '<tr>' +
          '<td><div><strong>' + (item.nickname || '鏈懡鍚?) + '</strong></div><div class="mono">' + item.userKey + '</div><div class="muted">' + [item.birthText, item.gender, item.city].filter(Boolean).join(' / ') + '</div><div class="muted">' + [item.roleText, item.focusText].filter(Boolean).join(' / ') + '</div></td>' +
          '<td>' + item.used + '</td>' +
          '<td>' + item.remaining + ' / ' + item.dailyLimit + (item.extraQuota ? ' <span class="muted">(+ ' + item.extraQuota + ')</span>' : '') + '</td>' +
          '<td>' + membershipPill(item) + '</td>' +
          '<td class="muted">' + (item.lastUsedAt || '--') + '</td>' +
          '</tr>').join('')
        : '<tr><td colspan="5" class="muted">浠婂ぉ杩樻病鏈?AI 浣跨敤璁板綍銆?/td></tr>';
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
          const tierText = item.tier === 'premium' ? '浼氬憳' : '鍏嶈垂';
          const statusText = item.status === 'active' ? '鐢熸晥涓? : '鏈敓鏁?;
          const isExpanded = Boolean(expandedMembershipRows[item.userKey]);
          const summaryRow = '<tr>' +
            '<td><div><strong>' + (related.nickname || '鏈暀鏄电О') + '</strong></div><div class="mono">' + item.userKey + '</div><div class="muted">' + [item.birthText, item.gender, related.city].filter(Boolean).join(' / ') + '</div></td>' +
            '<td>' + tierText + (item.expiresAt ? '<div class="muted">鍒版湡锛? + item.expiresAt + '</div>' : '') + '</td>' +
            '<td>' + statusText + '<div class="muted">鏇存柊锛? + (item.updatedAt || '--') + '</div></td>' +
            '<td><button data-toggle-membership="' + item.userKey + '" style="background:rgba(255,255,255,0.94);color:#2c6d66;border:1px solid rgba(117,170,160,0.26);border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700;">' + (isExpanded ? '鏀惰捣璧勬枡' : '灞曞紑璧勬枡') + '</button></td>' +
            '</tr>';
          const detailRow = isExpanded
            ? '<tr><td colspan="4" style="background:rgba(245,251,249,0.9);border-bottom:1px solid rgba(129,166,159,0.20);"><div style="padding:10px 4px 2px; display:grid; gap:6px;"><div><strong>娉ㄥ唽璧勬枡锛?/strong>' + (related.email || '鏈暀閭') + ' / ' + (related.phone || '鏈暀鎵嬫満鍙?) + ' / ' + (related.city || '鏈暀鍩庡競') + '</div><div class="muted"><strong>瑙掕壊涓庡叧娉細</strong>' + (item.roleText || '鏈暀瑙掕壊') + ' / ' + (item.focusText || '鏈暀鍏虫敞鏂瑰悜') + '</div><div class="muted"><strong>鏈嶅姟澶囨敞锛?/strong>' + (item.notes || '鏃犲娉?) + '</div></div></td></tr>'
            : '';
          return summaryRow + detailRow;
        }).join('')
        : '<tr><td colspan="4" class="muted">杩樻病鏈夌鍚堟潯浠剁殑浼氬憳璁板綍銆?/td></tr>';
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
          const focus = joinText(item.profileMemory?.longTermFocus, '鏈舰鎴?);
          const openLoop = item.sessionMemory?.lastOpenLoop || '鏆傛棤';
          const prefs = [
            item.responsePreference?.likesStrongConclusion ? '鍠滄鐩存帴缁撹' : '',
            item.responsePreference?.likesMysticLanguage ? '鍋忔湳璇? : '',
            item.responsePreference?.likesModernExplanation ? '瑕佺幇浠ｈВ閲? : '',
            item.responsePreference?.avoidVerboseTemplate ? '涓嶇埍妯℃澘鑵? : '',
          ].filter(Boolean).join(' / ') || '鏈舰鎴?;
          return '<tr>' +
            '<td><div class="mono">' + item.userKey + '</div></td>' +
            '<td><div><strong>' + (related.nickname || '鏈暀鏄电О') + '</strong></div><div class="muted">' + (related.email || '鏈暀閭') + '</div><div class="muted">' + (related.phone || '鏈暀鎵嬫満鍙?) + '</div><div class="muted">' + (related.city || '鏈暀鍩庡競') + '</div></td>' +
            '<td>' + focus + '</td>' +
            '<td>' + openLoop + '</td>' +
            '<td>' + prefs + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="muted">杩樻病鏈夌鍚堟潯浠剁殑浼氬憳璁板繂璁板綍銆?/td></tr>';
    }

    function renderMemoryDetail(memory) {
      const focus = joinText(memory.profileMemory?.longTermFocus, '鏈舰鎴?);
      const pain = joinText(memory.profileMemory?.recurringPainPoints, '鏈舰鎴?);
      const compared = joinText(memory.sessionMemory?.lastComparedOptions, '鏃?);
      const prefs = [
        memory.responsePreference?.likesStrongConclusion ? '鍠滄鐩存帴缁撹' : '',
        memory.responsePreference?.likesMysticLanguage ? '鎺ュ彈鐜勫鏈' : '',
        memory.responsePreference?.likesModernExplanation ? '甯屾湜鏈変汉璇濊В閲? : '',
        memory.responsePreference?.likesComparisonAnswer ? '甯搁棶姣旇緝棰? : '',
        memory.responsePreference?.likesFollowupQuestion ? '鎺ュ彈杩介棶' : '',
        memory.responsePreference?.avoidVerboseTemplate ? '涓嶅枩娆㈡ā鏉块暱绛? : '',
      ].filter(Boolean).join('銆?) || '鏈舰鎴?;

      memoryDetail.innerHTML = [
        '<div class="memory-line"><strong>鐢ㄦ埛閿細</strong><span class="mono">' + (memory.userKey || '--') + '</span></div>',
        '<div class="memory-line"><strong>闀挎湡鍏虫敞锛?/strong>' + focus + '</div>',
        '<div class="memory-line"><strong>鍙嶅鍗＄偣锛?/strong>' + pain + '</div>',
        '<div class="memory-line"><strong>涓婃鏍稿績鍒ゆ柇锛?/strong>' + (memory.sessionMemory?.lastCoreJudgment || '鏆傛棤') + '</div>',
        '<div class="memory-line"><strong>涓婃缁欑殑鍔ㄤ綔锛?/strong>' + (memory.sessionMemory?.lastActionGiven || '鏆傛棤') + '</div>',
        '<div class="memory-line"><strong>涓婃鏈畬缁撶偣锛?/strong>' + (memory.sessionMemory?.lastOpenLoop || '鏆傛棤') + '</div>',
        '<div class="memory-line"><strong>涓婃姣旇緝棰橈細</strong>' + compared + '</div>',
        '<div class="memory-line"><strong>鏈€杩戞儏缁蛋鍔匡細</strong>' + (memory.sessionMemory?.recentMoodTrend || 'unknown') + '</div>',
        '<div class="memory-line"><strong>鍥炵瓟鍋忓ソ锛?/strong>' + prefs + '</div>',
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

      leadAnnualValue.textContent = annualCount + ' 鏉?;
      leadMonthlyValue.textContent = monthlyCount + ' 鏉?;
      leadRecentValue.textContent = recentCount + ' 鏉?;
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
            ? '閭 + 鎵嬫満'
            : hasEmail
              ? '浠呴偖绠?
              : hasPhone
                ? '浠呮墜鏈?
                : '鏈暀鑱旂郴鏂瑰紡';

          return '<tr>' +
            '<td class="muted">' + (item.createdAt || '--') + '</td>' +
            '<td><div><strong>' + (item.nickname || '鏈暀绉板懠') + '</strong></div><div class="mono">' + (item.userKey || '--') + '</div><div class="muted">' + (item.city || '鏈暀鍩庡競') + '</div></td>' +
            '<td><strong>' + (item.selectedPlan === 'annual' ? '骞村害浼氬憳' : '鏈堝害浼氬憳') + '</strong><div class="muted">' + (item.source || '--') + '</div></td>' +
            '<td><div>' + (item.email || '鏈暀閭') + '</div><div class="muted">' + (item.phone || '鏈暀鎵嬫満鍙?) + '</div><div class="muted">' + contactText + '</div></td>' +
            '<td>' + (item.focus || '鏈～鍐?) + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="muted">褰撳墠绛涢€夋潯浠朵笅杩樻病鏈夋柊鐨勪粯璐规剰鍚戙€?/td></tr>';
    }

    function renderManualPaymentReviews(items) {
      latestManualPaymentItems = Array.isArray(items) ? items : [];
      manualPaymentBody.innerHTML = items.length
        ? items.map((item) => {
          const preview = item.screenshotDataUrl
            ? '<img src="' + item.screenshotDataUrl + '" alt="浠樻鍑瘉" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid rgba(117,170,160,0.18);" />'
            : '<span class="muted">鏈笂浼犳埅鍥?/span>';
          const approveButton = item.status === 'approved'
            ? '<span class="pill premium">宸插紑閫?/span>'
            : '<button data-approve-review="' + item.id + '" style="background:linear-gradient(135deg,#6ecfc0,#4aa7a1);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700;">涓€閿紑閫氫細鍛?/button>';

          return '<tr>' +
            '<td class="muted">' + (item.createdAt || '--') + '</td>' +
            '<td><div><strong>' + (item.nickname || '鏈暀绉板懠') + '</strong></div><div class="mono">' + (item.userKey || '--') + '</div><div class="muted">' + (item.city || '鏈暀鍩庡競') + '</div><div class="muted">' + (item.email || '鏈暀閭') + '</div><div class="muted">' + (item.phone || '鏈暀鎵嬫満鍙?) + '</div></td>' +
            '<td><div><strong>' + (item.selectedPlan === 'annual' ? '骞村害浼氬憳' : '鏈堝害浼氬憳') + '</strong></div><div class="muted">' + (item.paymentMethod === 'wechat' ? '寰俊鏀舵鐮? : '鏀粯瀹濇敹娆剧爜') + '</div><div class="muted">' + (item.status === 'approved' ? '宸插紑閫? : '寰呯‘璁?) + '</div></td>' +
            '<td><div>閲戦锛? + (item.amountText || '鏈～') + '</div><div class="muted">浠樻鏃堕棿锛? + (item.paidAtText || '鏈～') + '</div><div class="muted">' + (item.notes || '鏃犲娉?) + '</div></td>' +
            '<td>' + preview + '</td>' +
            '<td>' + approveButton + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="6" class="muted">杩樻病鏈夊緟纭浠樻璁板綍銆?/td></tr>';
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
            ? '<a href="' + item.screenshotDataUrl + '" target="_blank" rel="noreferrer"><img src="' + item.screenshotDataUrl + '" alt="浠樻鍑瘉" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid rgba(117,170,160,0.18);" /></a>'
            : '<span class="muted">鏈笂浼犳埅鍥?/span>';

          return '<tr>' +
            '<td class="muted">' + (item.reviewedAt || item.createdAt || '--') + '</td>' +
            '<td><div><strong>' + (item.nickname || '鏈暀绉板懠') + '</strong></div><div class="mono">' + (item.userKey || '--') + '</div><div class="muted">' + (item.city || '鏈暀鍩庡競') + '</div><div class="muted">' + (item.email || '鏈暀閭') + '</div><div class="muted">' + (item.phone || '鏈暀鎵嬫満鍙?) + '</div></td>' +
            '<td><div><strong>' + (item.selectedPlan === 'annual' ? '骞村害浼氬憳' : '鏈堝害浼氬憳') + '</strong></div><div class="muted">' + (item.paymentMethod === 'wechat' ? '寰俊鏀舵鐮? : '鏀粯瀹濇敹娆剧爜') + '</div><div class="muted">宸插紑閫?/div></td>' +
            '<td><div>閲戦锛? + (item.amountText || '鏈～') + '</div><div class="muted">浠樻鏃堕棿锛? + (item.paidAtText || '鏈～') + '</div></td>' +
            '<td>' + preview + '</td>' +
            '<td><div class="muted">' + (item.reviewedNotes || item.notes || '鏃犲娉?) + '</div></td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="6" class="muted">杩樻病鏈夊凡寮€閫氫粯娆捐褰曘€?/td></tr>';
    }

    function renderStorage(storage) {
      dbFileValue.textContent = storage?.dbFile || '--';
      dataDirValue.textContent = storage?.dataDir || '--';
      storageStatusValue.textContent = storage?.statusText || '--';
      storageStatusValue.style.color = storage?.persistent ? '#2c6d66' : '#8a6412';
    }

    async function approveManualPayment(id) {
      topStatus.textContent = '姝ｅ湪寮€閫氫細鍛?..';
      try {
        await requestJson('/admin/api/manual-payment-approve', {
          method: 'POST',
          body: JSON.stringify({ id }),
        });
        topStatus.textContent = '宸插紑閫氫細鍛樸€?;
        await loadOverview();
      } catch (error) {
        topStatus.textContent = '寮€閫氬け璐ワ細' + error.message;
      }
    }

    async function loadOverview() {
      topStatus.textContent = '姝ｅ湪鍒锋柊...';
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
        topStatus.textContent = '宸插埛鏂般€?;
      } catch (error) {
        topStatus.textContent = '鍒锋柊澶辫触锛? + error.message;
      }
    }

    async function saveMembership() {
      saveStatus.textContent = '姝ｅ湪淇濆瓨...';
      try {
        const payload = {
          userKey: document.getElementById('userKey').value.trim(),
          tier: document.getElementById('tier').value,
          status: document.getElementById('status').value,
          expiresAt: document.getElementById('expiresAt').value || null,
          notes: document.getElementById('notes').value.trim(),
        };
        if (!payload.userKey) {
          throw new Error('璇峰厛杈撳叆 userKey');
        }
        const result = await requestJson('/admin/api/set-membership', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        saveStatus.textContent = '淇濆瓨鎴愬姛锛? + result.membership.userKey + ' -> ' + result.membership.tier;
        await loadOverview();
      } catch (error) {
        saveStatus.textContent = '淇濆瓨澶辫触锛? + error.message;
      }
    }

    async function saveExtraQuota() {
      quotaStatus.textContent = '姝ｅ湪淇濆瓨...';
      try {
        const payload = {
          userKey: document.getElementById('quotaUserKey').value.trim(),
          dateKey: document.getElementById('quotaDateKey').value,
          extraCount: Number(document.getElementById('extraCount').value || 0),
          notes: document.getElementById('quotaNotes').value.trim(),
        };
        if (!payload.userKey) {
          throw new Error('璇峰厛杈撳叆 userKey');
        }
        const result = await requestJson('/admin/api/set-extra-quota', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        quotaStatus.textContent = '淇濆瓨鎴愬姛锛? + result.quotaOverride.userKey + ' -> +' + result.quotaOverride.extraCount + ' 娆?;
        await loadOverview();
      } catch (error) {
        quotaStatus.textContent = '淇濆瓨澶辫触锛? + error.message;
      }
    }

    async function loadMemberMemory() {
      memoryStatus.textContent = '姝ｅ湪璇诲彇浼氬憳璁板繂...';
      try {
        const payload = {
          userKey: document.getElementById('memoryUserKey').value.trim(),
        };
        if (!payload.userKey) {
          throw new Error('璇峰厛杈撳叆 userKey');
        }
        const result = await requestJson('/admin/api/member-memory', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        renderMemoryDetail(result.memory || {});
        memoryStatus.textContent = '浼氬憳璁板繂宸插姞杞姐€?;
      } catch (error) {
        memoryStatus.textContent = '璇诲彇澶辫触锛? + error.message;
      }
    }

    enhanceAdminAccordionLayout();
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
      const sectionTarget = event.target?.getAttribute?.('data-section-target');
      if (sectionTarget) {
        const section = document.getElementById(sectionTarget);
        if (section) {
          section.open = true;
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      const reviewId = event.target?.getAttribute?.('data-approve-review');
      if (reviewId) {
        approveManualPayment(reviewId);
        return;
      }
      const membershipKey = event.target?.getAttribute?.('data-toggle-membership');
      if (membershipKey) {
        expandedMembershipRows = {
          ...expandedMembershipRows,
          [membershipKey]: !expandedMembershipRows[membershipKey],
        };
        renderMemberships(latestMembershipItems);
      }
    });
    loadOverview();
  </script>
</body>
</html>`);
});

module.exports = router;


