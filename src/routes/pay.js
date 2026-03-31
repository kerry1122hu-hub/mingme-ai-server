const express = require('express');
const { requireAppToken } = require('../utils/auth');
const { ok, fail } = require('../utils/response');
const {
  createPaymentOrder,
  getPaymentOrder,
  logNotify,
  markOrderPaid,
} = require('../services/paymentService');
const {
  buildWechatH5CreateOrder,
  buildAlipayWapCreateOrder,
  parseWechatNotify,
  verifyAlipayNotify,
} = require('../services/paymentGatewayService');

const router = express.Router();

router.post('/create-order', requireAppToken, (req, res) => {
  try {
    const {
      userKey,
      chart,
      profile,
      productCode,
      channelPreference,
      clientScene,
      inWechat,
      returnUrl,
      source,
      metadata,
    } = req.body || {};

    if (!productCode) {
      return res.status(400).json(fail('productCode is required', 'BAD_REQUEST'));
    }

    const result = createPaymentOrder({
      userKey,
      chart,
      profile,
      productCode,
      channelPreference,
      clientScene,
      inWechat,
      returnUrl,
      source,
      metadata,
    });

    let gateway = null;
    if (result.order.channel === 'wechat_h5') {
      gateway = buildWechatH5CreateOrder({
        order: result.order,
        payerClientIp: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      });
    } else if (result.order.channel === 'alipay_wap') {
      gateway = buildAlipayWapCreateOrder({ order: result.order });
    }

    const payload = {
      ...result,
      gateway,
    };

    res.locals.outputLength = JSON.stringify(payload).length;
    return res.json(ok(payload));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'create order failed', 'CREATE_ORDER_FAILED'));
  }
});

router.get('/order/:orderId', requireAppToken, (req, res) => {
  try {
    const order = getPaymentOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json(fail('order not found', 'ORDER_NOT_FOUND'));
    }
    res.locals.outputLength = JSON.stringify(order).length;
    return res.json(ok({ order }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'query order failed', 'QUERY_ORDER_FAILED'));
  }
});

router.post('/notify/wechat', express.json({ limit: '1mb' }), (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const parsed = parseWechatNotify({ headers: req.headers || {}, rawBody });
    const orderId = parsed?.data?.out_trade_no || req.body?.out_trade_no || '';

    logNotify({
      provider: 'wechat',
      notifyId: `${req.body?.id || req.body?.event_id || ''}`.trim(),
      orderId: `${orderId}`.trim(),
      verifyStatus: parsed?.verified ? 'pass' : 'fail',
      httpStatus: 200,
      processResult: parsed?.verified ? 'received' : 'failed',
      errorMessage: parsed?.verified ? '' : (parsed?.reason || ''),
      rawBody,
    });

    if (parsed?.verified && parsed?.data?.trade_state === 'SUCCESS' && orderId) {
      markOrderPaid({
        orderId,
        provider: 'wechat',
        providerTradeNo: parsed?.data?.transaction_id || '',
        tradeStatus: parsed?.data?.trade_state || 'SUCCESS',
        tradeType: parsed?.data?.trade_type || 'H5',
        buyerId: parsed?.data?.payer?.openid || '',
        amountFen: parsed?.data?.amount?.total,
        rawPayload: parsed.data,
        verified: true,
      });
    }

    return res.status(200).json({ code: 'SUCCESS' });
  } catch (error) {
    return res.status(500).json({ code: 'FAIL', message: error.message || 'notify error' });
  }
});

router.post('/notify/alipay', express.urlencoded({ extended: false }), (req, res) => {
  try {
    const verify = verifyAlipayNotify(req.body || {});
    const orderId = `${req.body?.out_trade_no || ''}`.trim();

    logNotify({
      provider: 'alipay',
      notifyId: `${req.body?.notify_id || ''}`.trim(),
      orderId,
      verifyStatus: verify?.verified ? 'pass' : 'fail',
      httpStatus: 200,
      processResult: verify?.verified ? 'received' : 'failed',
      errorMessage: verify?.verified ? '' : (verify?.reason || ''),
      rawBody: JSON.stringify(req.body || {}),
    });

    if (verify?.verified && req.body?.trade_status === 'TRADE_SUCCESS' && orderId) {
      markOrderPaid({
        orderId,
        provider: 'alipay',
        providerTradeNo: req.body?.trade_no || '',
        tradeStatus: req.body?.trade_status || 'TRADE_SUCCESS',
        tradeType: 'WAP',
        buyerId: req.body?.buyer_id || '',
        amountFen: Math.round(Number(req.body?.total_amount || 0) * 100),
        rawPayload: req.body || {},
        verified: true,
      });
    }

    return res.status(200).send('success');
  } catch (error) {
    return res.status(500).send('fail');
  }
});

router.post('/simulate-paid', requireAppToken, (req, res) => {
  try {
    const {
      orderId,
      provider = 'manual',
      providerTradeNo = '',
      tradeStatus = 'SUCCESS',
      tradeType = '',
      buyerId = '',
      amountFen,
      rawPayload,
    } = req.body || {};

    if (!orderId) {
      return res.status(400).json(fail('orderId is required', 'BAD_REQUEST'));
    }

    const result = markOrderPaid({
      orderId,
      provider,
      providerTradeNo,
      tradeStatus,
      tradeType,
      buyerId,
      amountFen,
      rawPayload,
      verified: true,
    });

    res.locals.outputLength = JSON.stringify(result).length;
    return res.json(ok(result));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'simulate paid failed', 'SIMULATE_PAID_FAILED'));
  }
});

module.exports = router;
