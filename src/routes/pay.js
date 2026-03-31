const express = require('express');
const { requireAppToken } = require('../utils/auth');
const { ok, fail } = require('../utils/response');
const {
  createPaymentOrder,
  getPaymentOrder,
  logNotify,
  markOrderPaid,
} = require('../services/paymentService');

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

    res.locals.outputLength = JSON.stringify(result).length;
    return res.json(ok(result));
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
    logNotify({
      provider: 'wechat',
      notifyId: `${req.body?.id || req.body?.event_id || ''}`.trim(),
      orderId: `${req.body?.out_trade_no || req.body?.resource?.ciphertext || ''}`.trim(),
      verifyStatus: 'pending',
      httpStatus: 200,
      processResult: 'received',
      rawBody: JSON.stringify(req.body || {}),
    });
    return res.status(200).json({ code: 'SUCCESS' });
  } catch (error) {
    return res.status(500).json({ code: 'FAIL', message: error.message || 'notify error' });
  }
});

router.post('/notify/alipay', express.urlencoded({ extended: false }), (req, res) => {
  try {
    logNotify({
      provider: 'alipay',
      notifyId: `${req.body?.notify_id || ''}`.trim(),
      orderId: `${req.body?.out_trade_no || ''}`.trim(),
      verifyStatus: 'pending',
      httpStatus: 200,
      processResult: 'received',
      rawBody: JSON.stringify(req.body || {}),
    });
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
