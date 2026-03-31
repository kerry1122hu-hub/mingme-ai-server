const Database = require('better-sqlite3');
const { DB_FILE, buildUserKey, setMembership } = require('./quotaService');

const db = new Database(DB_FILE);

const PRODUCT_CATALOG = {
  vip_7d: {
    productCode: 'vip_7d',
    productName: '7天体验包',
    amountFen: 1900,
    entitlementType: 'vip',
    durationDays: 7,
  },
  vip_30d: {
    productCode: 'vip_30d',
    productName: '30天月卡',
    amountFen: 5900,
    entitlementType: 'vip',
    durationDays: 30,
  },
  vip_90d: {
    productCode: 'vip_90d',
    productName: '90天季卡',
    amountFen: 14900,
    entitlementType: 'vip',
    durationDays: 90,
  },
  vip_365d: {
    productCode: 'vip_365d',
    productName: '365天年卡',
    amountFen: 39900,
    entitlementType: 'vip',
    durationDays: 365,
  },
  topic_relationship: {
    productCode: 'topic_relationship',
    productName: '关系专题包',
    amountFen: 2900,
    entitlementType: 'topic_pack',
    durationDays: 30,
  },
  topic_career: {
    productCode: 'topic_career',
    productName: '事业专题包',
    amountFen: 2900,
    entitlementType: 'topic_pack',
    durationDays: 30,
  },
  topic_emotion: {
    productCode: 'topic_emotion',
    productName: '情绪专题包',
    amountFen: 2900,
    entitlementType: 'topic_pack',
    durationDays: 30,
  },
  topic_money: {
    productCode: 'topic_money',
    productName: '金钱专题包',
    amountFen: 2900,
    entitlementType: 'topic_pack',
    durationDays: 30,
  },
  topic_bundle: {
    productCode: 'topic_bundle',
    productName: '四类专题打包',
    amountFen: 9900,
    entitlementType: 'topic_pack',
    durationDays: 90,
  },
};

function ensurePaymentTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL UNIQUE,
      user_key TEXT NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      amount_fen INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      status TEXT NOT NULL DEFAULT 'created',
      channel TEXT NOT NULL,
      provider_order_no TEXT NOT NULL DEFAULT '',
      client_scene TEXT NOT NULL DEFAULT 'mobile_h5',
      channel_preference TEXT NOT NULL DEFAULT 'auto',
      return_url TEXT NOT NULL DEFAULT '',
      notify_url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      paid_at TEXT,
      closed_at TEXT,
      refunded_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_trade_no TEXT NOT NULL DEFAULT '',
      trade_status TEXT NOT NULL DEFAULT '',
      buyer_id TEXT NOT NULL DEFAULT '',
      trade_type TEXT NOT NULL DEFAULT '',
      amount_fen INTEGER NOT NULL DEFAULT 0,
      raw_payload TEXT NOT NULL DEFAULT '{}',
      verified INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      processed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_notify_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      notify_id TEXT NOT NULL DEFAULT '',
      order_id TEXT NOT NULL DEFAULT '',
      verify_status TEXT NOT NULL DEFAULT 'pending',
      http_status INTEGER NOT NULL DEFAULT 0,
      process_result TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT NOT NULL DEFAULT '',
      raw_body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      entitlement_type TEXT NOT NULL,
      product_code TEXT NOT NULL,
      source_order_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

ensurePaymentTables();

function createOrderId() {
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate()
  ).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(
    now.getUTCSeconds()
  ).padStart(2, '0')}`;
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MM${datePart}${randomPart}`;
}

function normalizeClientScene(clientScene = 'mobile_h5') {
  const value = `${clientScene || 'mobile_h5'}`.trim().toLowerCase();
  if (['wechat_inapp', 'mobile_h5', 'pc'].includes(value)) {
    return value;
  }
  return 'mobile_h5';
}

function resolvePayChannel({ clientScene, inWechat, channelPreference }) {
  const normalizedPreference = `${channelPreference || 'auto'}`.trim().toLowerCase();

  if (normalizedPreference === 'wechat') {
    if (clientScene === 'pc') return 'wechat_native';
    if (inWechat || clientScene === 'wechat_inapp') return 'wechat_jsapi';
    return 'wechat_h5';
  }

  if (normalizedPreference === 'alipay') {
    return clientScene === 'pc' ? 'alipay_pc' : 'alipay_wap';
  }

  if (inWechat || clientScene === 'wechat_inapp') return 'wechat_jsapi';
  if (clientScene === 'pc') return 'wechat_native';
  return 'wechat_h5';
}

function buildPayPayload({ channel, orderId, amountFen, returnUrl }) {
  const amountYuan = (amountFen / 100).toFixed(2);
  const safeReturnUrl = returnUrl || '';

  if (channel === 'wechat_jsapi') {
    return {
      mode: 'wechat_jsapi',
      actionText: '需在微信内授权并获取 OpenID 后发起支付',
      nextStep: '补齐公众号/服务号授权域名与 OpenID 获取流程',
      orderId,
      amountFen,
      amountYuan,
    };
  }

  if (channel === 'wechat_h5') {
    return {
      mode: 'wechat_h5',
      actionText: '微信外手机浏览器应跳转 mweb_url 完成支付',
      nextStep: '接入微信 H5 下单接口后返回 mweb_url',
      orderId,
      amountFen,
      amountYuan,
      returnUrl: safeReturnUrl,
    };
  }

  if (channel === 'wechat_native') {
    return {
      mode: 'wechat_native',
      actionText: 'PC 端应展示微信扫码二维码',
      nextStep: '接入 Native 下单接口后返回 code_url',
      orderId,
      amountFen,
      amountYuan,
    };
  }

  if (channel === 'alipay_pc') {
    return {
      mode: 'alipay_pc',
      actionText: 'PC 端应跳转支付宝电脑网站支付',
      nextStep: '接入支付宝电脑网站支付接口后返回支付表单',
      orderId,
      amountFen,
      amountYuan,
      returnUrl: safeReturnUrl,
    };
  }

  return {
    mode: 'alipay_wap',
    actionText: '手机浏览器应跳转支付宝手机网站支付',
    nextStep: '接入支付宝手机网站支付接口后返回支付表单',
    orderId,
    amountFen,
    amountYuan,
    returnUrl: safeReturnUrl,
  };
}

function createPaymentOrder({
  userKey,
  chart,
  profile,
  productCode,
  channelPreference = 'auto',
  clientScene = 'mobile_h5',
  inWechat = false,
  returnUrl = '',
  source = 'web_paywall',
  metadata,
}) {
  const product = PRODUCT_CATALOG[productCode];
  if (!product) {
    throw new Error('unsupported product code');
  }

  const resolvedUserKey = buildUserKey({ userKey, chart });
  const normalizedScene = normalizeClientScene(clientScene);
  const channel = resolvePayChannel({
    clientScene: normalizedScene,
    inWechat: Boolean(inWechat),
    channelPreference,
  });
  const orderId = createOrderId();
  const notifyUrlBase = `${process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || ''}`.replace(/\/$/, '');
  const notifyUrl = notifyUrlBase ? `${notifyUrlBase}/api/pay/notify/${channel.startsWith('wechat') ? 'wechat' : 'alipay'}` : '';
  const metadataJson = JSON.stringify(metadata || {});

  db.prepare(`
    INSERT INTO payment_orders (
      order_id, user_key, product_code, product_name, amount_fen, status, channel,
      client_scene, channel_preference, return_url, notify_url, source, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    orderId,
    resolvedUserKey,
    product.productCode,
    product.productName,
    product.amountFen,
    channel,
    normalizedScene,
    `${channelPreference || 'auto'}`.trim().toLowerCase() || 'auto',
    `${returnUrl || ''}`.trim(),
    notifyUrl,
    `${source || ''}`.trim(),
    metadataJson
  );

  const order = getPaymentOrder(orderId);
  return {
    order,
    payPayload: buildPayPayload({
      channel,
      orderId,
      amountFen: product.amountFen,
      returnUrl,
    }),
  };
}

function getPaymentOrder(orderId) {
  const row = db.prepare(`
    SELECT *
    FROM payment_orders
    WHERE order_id = ?
  `).get(orderId);

  if (!row) return null;
  return {
    orderId: row.order_id,
    userKey: row.user_key,
    productCode: row.product_code,
    productName: row.product_name,
    amountFen: Number(row.amount_fen || 0),
    currency: row.currency,
    status: row.status,
    channel: row.channel,
    providerOrderNo: row.provider_order_no || '',
    clientScene: row.client_scene,
    channelPreference: row.channel_preference,
    returnUrl: row.return_url || '',
    notifyUrl: row.notify_url || '',
    source: row.source || '',
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    paidAt: row.paid_at,
    closedAt: row.closed_at,
    refundedAt: row.refunded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listPaymentOrders({ limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 300));
  return db.prepare(`
    SELECT *
    FROM payment_orders
    ORDER BY created_at DESC
    LIMIT ?
  `).all(normalizedLimit).map((row) => getPaymentOrder(row.order_id));
}

function createEntitlement({ order, paidAt }) {
  const product = PRODUCT_CATALOG[order.productCode];
  if (!product) return null;

  const startedAt = paidAt || new Date().toISOString();
  const endAt = product.durationDays
    ? new Date(Date.parse(startedAt) + product.durationDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  db.prepare(`
    INSERT INTO user_entitlements (
      user_key, entitlement_type, product_code, source_order_id, start_at, end_at, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(
    order.userKey,
    product.entitlementType,
    order.productCode,
    order.orderId,
    startedAt,
    endAt
  );

  if (product.entitlementType === 'vip') {
    setMembership({
      userKey: order.userKey,
      tier: 'premium',
      status: 'active',
      expiresAt: endAt,
      notes: `payment:${order.orderId}:${order.productCode}`,
    });
  }

  return {
    userKey: order.userKey,
    entitlementType: product.entitlementType,
    productCode: order.productCode,
    sourceOrderId: order.orderId,
    startAt: startedAt,
    endAt,
    status: 'active',
  };
}

function markOrderPaid({
  orderId,
  provider = 'manual',
  providerTradeNo = '',
  tradeStatus = 'SUCCESS',
  tradeType = '',
  buyerId = '',
  amountFen,
  rawPayload,
  verified = true,
}) {
  const order = getPaymentOrder(orderId);
  if (!order) {
    throw new Error('order not found');
  }

  if (order.status === 'paid') {
    return {
      order,
      entitlement: null,
      duplicate: true,
    };
  }

  const paidAt = new Date().toISOString();
  const normalizedAmount = Number(amountFen || order.amountFen);
  if (normalizedAmount !== order.amountFen) {
    throw new Error('paid amount mismatch');
  }

  db.prepare(`
    UPDATE payment_orders
    SET status = 'paid',
        provider_order_no = ?,
        paid_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `).run(providerTradeNo || '', paidAt, orderId);

  db.prepare(`
    INSERT INTO payment_transactions (
      order_id, provider, provider_trade_no, trade_status, buyer_id, trade_type,
      amount_fen, raw_payload, verified, processed, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    orderId,
    provider,
    providerTradeNo || '',
    tradeStatus || '',
    buyerId || '',
    tradeType || '',
    normalizedAmount,
    JSON.stringify(rawPayload || {}),
    verified ? 1 : 0,
    paidAt
  );

  const updatedOrder = getPaymentOrder(orderId);
  const entitlement = createEntitlement({ order: updatedOrder, paidAt });
  return {
    order: updatedOrder,
    entitlement,
    duplicate: false,
  };
}

function logNotify({
  provider,
  notifyId = '',
  orderId = '',
  verifyStatus = 'pending',
  httpStatus = 200,
  processResult = 'success',
  errorMessage = '',
  rawBody = '',
}) {
  db.prepare(`
    INSERT INTO payment_notify_logs (
      provider, notify_id, order_id, verify_status, http_status, process_result, error_message, raw_body
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(provider, notifyId, orderId, verifyStatus, httpStatus, processResult, errorMessage, rawBody);
}

module.exports = {
  PRODUCT_CATALOG,
  createPaymentOrder,
  getPaymentOrder,
  listPaymentOrders,
  markOrderPaid,
  logNotify,
};
