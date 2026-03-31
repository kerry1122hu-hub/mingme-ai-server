const crypto = require('crypto');

function normalizePem(value = '') {
  return `${value || ''}`.trim().replace(/\\n/g, '\n');
}

function sha256WithRsaSign(privateKeyPem, message) {
  return crypto.createSign('RSA-SHA256').update(message).end().sign(privateKeyPem, 'base64');
}

function sha256WithRsaVerify(publicKeyPem, message, signature) {
  return crypto.createVerify('RSA-SHA256').update(message).end().verify(publicKeyPem, signature, 'base64');
}

function getWechatConfig() {
  const config = {
    mchId: `${process.env.WECHAT_MCH_ID || ''}`.trim(),
    appId: `${process.env.WECHAT_APP_ID || ''}`.trim(),
    serialNo: `${process.env.WECHAT_SERIAL_NO || ''}`.trim(),
    privateKey: normalizePem(process.env.WECHAT_PRIVATE_KEY),
    apiV3Key: `${process.env.WECHAT_API_V3_KEY || ''}`.trim(),
    notifyUrl: `${process.env.WECHAT_NOTIFY_URL || ''}`.trim(),
    platformPublicKey: normalizePem(process.env.WECHAT_PLATFORM_PUBLIC_KEY),
  };

  const missing = [];
  if (!config.mchId) missing.push('WECHAT_MCH_ID');
  if (!config.appId) missing.push('WECHAT_APP_ID');
  if (!config.serialNo) missing.push('WECHAT_SERIAL_NO');
  if (!config.privateKey) missing.push('WECHAT_PRIVATE_KEY');
  if (!config.notifyUrl) missing.push('WECHAT_NOTIFY_URL');
  return { ...config, missing };
}

function getAlipayConfig() {
  const config = {
    appId: `${process.env.ALIPAY_APP_ID || ''}`.trim(),
    privateKey: normalizePem(process.env.ALIPAY_PRIVATE_KEY),
    publicKey: normalizePem(process.env.ALIPAY_PUBLIC_KEY),
    notifyUrl: `${process.env.ALIPAY_NOTIFY_URL || ''}`.trim(),
    returnUrl: `${process.env.ALIPAY_RETURN_URL || ''}`.trim(),
    gateway: `${process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do'}`.trim(),
  };

  const missing = [];
  if (!config.appId) missing.push('ALIPAY_APP_ID');
  if (!config.privateKey) missing.push('ALIPAY_PRIVATE_KEY');
  if (!config.notifyUrl) missing.push('ALIPAY_NOTIFY_URL');
  return { ...config, missing };
}

function buildWechatAuthorization({ mchId, serialNo, privateKey, method, urlPath, body }) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body || {});
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyText}\n`;
  const signature = sha256WithRsaSign(privateKey, message);

  return {
    timestamp,
    nonce,
    signature,
    authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`,
  };
}

function buildWechatH5CreateOrder({ order, payerClientIp = '127.0.0.1' }) {
  const config = getWechatConfig();
  if (config.missing.length) {
    return {
      provider: 'wechat',
      mode: 'wechat_h5',
      ready: false,
      missingConfig: config.missing,
    };
  }

  const urlPath = '/v3/pay/transactions/h5';
  const body = {
    appid: config.appId,
    mchid: config.mchId,
    description: order.productName,
    out_trade_no: order.orderId,
    notify_url: config.notifyUrl,
    amount: {
      total: order.amountFen,
      currency: 'CNY',
    },
    scene_info: {
      payer_client_ip: payerClientIp,
      h5_info: {
        type: 'Wap',
      },
    },
  };

  const auth = buildWechatAuthorization({
    mchId: config.mchId,
    serialNo: config.serialNo,
    privateKey: config.privateKey,
    method: 'POST',
    urlPath,
    body,
  });

  return {
    provider: 'wechat',
    mode: 'wechat_h5',
    ready: true,
    endpoint: `https://api.mch.weixin.qq.com${urlPath}`,
    method: 'POST',
    headers: {
      Authorization: auth.authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Wechatpay-Serial': config.serialNo,
    },
    body,
  };
}

function buildAlipaySignContent(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

function buildAlipayWapCreateOrder({ order }) {
  const config = getAlipayConfig();
  if (config.missing.length) {
    return {
      provider: 'alipay',
      mode: 'alipay_wap',
      ready: false,
      missingConfig: config.missing,
    };
  }

  const bizContent = {
    out_trade_no: order.orderId,
    total_amount: (order.amountFen / 100).toFixed(2),
    subject: order.productName,
    product_code: 'QUICK_WAP_WAY',
  };

  const params = {
    app_id: config.appId,
    method: 'alipay.trade.wap.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    version: '1.0',
    notify_url: config.notifyUrl,
    return_url: order.returnUrl || config.returnUrl || '',
    biz_content: JSON.stringify(bizContent),
  };

  const signContent = buildAlipaySignContent(params);
  const sign = sha256WithRsaSign(config.privateKey, signContent);
  const query = new URLSearchParams({ ...params, sign }).toString();

  return {
    provider: 'alipay',
    mode: 'alipay_wap',
    ready: true,
    endpoint: `${config.gateway}?${query}`,
    method: 'GET',
    query,
    params,
  };
}

function decryptWechatResource(resource, apiV3Key) {
  const key = Buffer.from(apiV3Key, 'utf8');
  const nonce = Buffer.from(resource.nonce, 'utf8');
  const associatedData = Buffer.from(resource.associated_data || '', 'utf8');
  const cipherText = Buffer.from(resource.ciphertext, 'base64');
  const data = cipherText.subarray(0, cipherText.length - 16);
  const authTag = cipherText.subarray(cipherText.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  decipher.setAAD(associatedData);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function verifyWechatNotify({ headers, rawBody }) {
  const config = getWechatConfig();
  const signature = headers['wechatpay-signature'];
  const timestamp = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const serial = headers['wechatpay-serial'];

  if (!config.platformPublicKey) {
    return { verified: false, reason: 'missing WECHAT_PLATFORM_PUBLIC_KEY' };
  }
  if (!signature || !timestamp || !nonce) {
    return { verified: false, reason: 'missing wechatpay headers' };
  }

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verified = sha256WithRsaVerify(config.platformPublicKey, message, signature);
  return { verified, serial, config };
}

function parseWechatNotify({ headers, rawBody }) {
  const verify = verifyWechatNotify({ headers, rawBody });
  if (!verify.verified) return { ...verify, data: null };

  const payload = JSON.parse(rawBody || '{}');
  if (!payload?.resource) {
    return { verified: true, data: payload };
  }
  if (!verify.config.apiV3Key) {
    return { verified: false, reason: 'missing WECHAT_API_V3_KEY', data: null };
  }
  const decrypted = decryptWechatResource(payload.resource, verify.config.apiV3Key);
  return {
    verified: true,
    data: JSON.parse(decrypted),
  };
}

function verifyAlipayNotify(params) {
  const config = getAlipayConfig();
  if (!config.publicKey) {
    return { verified: false, reason: 'missing ALIPAY_PUBLIC_KEY' };
  }
  const copied = { ...params };
  const signature = copied.sign;
  delete copied.sign;
  delete copied.sign_type;
  if (!signature) {
    return { verified: false, reason: 'missing sign' };
  }
  const signContent = buildAlipaySignContent(copied);
  const verified = sha256WithRsaVerify(config.publicKey, signContent, signature);
  return { verified };
}

module.exports = {
  buildWechatH5CreateOrder,
  buildAlipayWapCreateOrder,
  parseWechatNotify,
  verifyAlipayNotify,
  getWechatConfig,
  getAlipayConfig,
};
