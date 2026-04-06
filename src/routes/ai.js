const express = require('express');
const multer = require('multer');
const { runChat, runReading, runTranscription, runXiaoLiuRenReading } = require('../services/openaiService');
const { getQuotaStatus, consumeQuota, getMembershipStatus } = require('../services/quotaService');
const { trackAnalyticsEvent } = require('../services/analyticsService');
const { savePaywallLead } = require('../services/paywallLeadService');
const { saveManualPaymentReview } = require('../services/manualPaymentService');
const { saveContactMessage } = require('../services/contactMessageService');
const { runXiaoLiuRenEngine, consumeXiaoLiuRenQuota } = require('../services/xiaoLiuRenService');
const { requireAppToken } = require('../utils/auth');
const { ok, fail } = require('../utils/response');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

router.use(requireAppToken);

router.post('/quota-status', async (req, res) => {
  try {
    const { chart, userKey, profile } = req.body || {};
    const quota = getQuotaStatus({ chart, userKey, profile });
    res.locals.outputLength = `${quota.remaining}`.length;
    return res.json(ok({ quota }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { userProfile, message, chart, userKey, profile, history } = req.body || {};

    if (!message || !`${message}`.trim()) {
      return res.status(400).json(fail('message is required', 'BAD_REQUEST'));
    }

    const quota = consumeQuota({ chart, userKey, profile });

    const text = await runChat({
      userProfile: `${userProfile || ''}`.trim(),
      message: `${message}`.trim(),
      chart,
      userKey,
      profile,
      memberTier: quota.memberTier,
      history,
    });

    res.locals.outputLength = `${text || ''}`.length;
    return res.json(ok({ text, quota }));
  } catch (error) {
    res.locals.outputLength = 0;
    const status = error.status || 500;
    if (error.code === 'AI_QUOTA_EXCEEDED') {
      return res.status(status).json(fail('今日免费次数已用完，可开通会员继续使用 AI。', error.code, { quota: error.quota }));
    }
    return res.status(status).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/ai-reading', async (req, res) => {
  try {
    const { instructions, input, chart, model, userKey, profile } = req.body || {};

    if (!input || !`${input}`.trim()) {
      return res.status(400).json(fail('input is required', 'BAD_REQUEST'));
    }

    const quota = consumeQuota({ chart, userKey, profile });

    const text = await runReading({
      instructions: `${instructions || ''}`.trim(),
      input: `${input}`.trim(),
      chart,
      model: `${model || 'gpt-4o-mini'}`.trim(),
    });

    res.locals.outputLength = `${text || ''}`.length;
    return res.json(ok({ text, quota }));
  } catch (error) {
    res.locals.outputLength = 0;
    const status = error.status || 500;
    if (error.code === 'AI_QUOTA_EXCEEDED') {
      return res.status(status).json(fail('今日免费次数已用完，可开通会员继续使用 AI。', error.code, { quota: error.quota }));
    }
    return res.status(status).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/xiao-liu-ren', async (req, res) => {
  try {
    const {
      module,
      question,
      chart,
      profile,
      userKey,
      sceneType,
      scene_type,
      mode,
      query_context,
      client_meta,
      eventDateTime,
      timezoneOffsetMinutes,
      engineVersion,
      engine_version,
      model,
      memberTier,
    } = req.body || {};

    const resolvedSceneType = sceneType || scene_type;
    const resolvedEngineVersion = `${engineVersion || engine_version || 'v1.1'}`.trim() || 'v1.1';
    const resolvedEventDateTime = query_context?.datetime || eventDateTime;
    const resolvedTimezone = query_context?.timezone || 'Asia/Shanghai';

    const engineResult = runXiaoLiuRenEngine({
      question: `${question || ''}`.trim(),
      sceneType: resolvedSceneType,
      chart,
      mode: `${mode || 'current'}`.trim() || 'current',
      eventDateTime: resolvedEventDateTime,
      timezoneOffsetMinutes,
      engineVersion: resolvedEngineVersion,
      timezone: resolvedTimezone,
      clientMeta: client_meta || null,
      module: `${module || 'mingji_one_gua'}`.trim() || 'mingji_one_gua',
    });

    const riskControl = consumeXiaoLiuRenQuota({
      userKey,
      memberTier: `${memberTier || 'free'}`.trim() || 'free',
      engineVersion: resolvedEngineVersion,
      mode: `${mode || 'current'}`.trim() || 'current',
      sceneType: engineResult.sceneType,
      eventContext: engineResult.eventContext,
      clientMeta: client_meta || null,
    });

    if (engineResult?.normalizedPayload) {
      engineResult.normalizedPayload.risk_control = {
        ...engineResult.normalizedPayload.risk_control,
        ...riskControl,
      };
    }

    const text = await runXiaoLiuRenReading({
      question: `${question || ''}`.trim(),
      chart,
      userKey,
      memberTier: `${memberTier || 'free'}`.trim() || 'free',
      engineResult,
      model: `${model || 'gpt-4o-mini'}`.trim(),
    });

    res.locals.outputLength = `${text || ''}`.length;
    return res.json(ok({ text, engineResult, riskControl }));
  } catch (error) {
    res.locals.outputLength = 0;
    const status = error.status || 500;
    if (error.code === 'DIVINATION_COOLDOWN' || error.code === 'DIVINATION_DAILY_LIMIT') {
      return res.status(status).json(fail(error.message || 'server error', error.code, { riskControl: error.riskControl || null }));
    }
    return res.status(status).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json(fail('audio file is required', 'BAD_REQUEST'));
    }

    const text = await runTranscription({
      buffer: req.file.buffer,
      fileName: req.file.originalname || req.body?.fileName || 'mingme-voice.m4a',
      mimeType: req.file.mimetype || req.body?.mimeType || 'audio/m4a',
      language: req.body?.language || 'zh',
      prompt: req.body?.prompt || '',
      model: req.body?.model || 'whisper-1',
    });

    res.locals.outputLength = `${text || ''}`.length;
    return res.json(ok({ text }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/membership-status', async (req, res) => {
  try {
    const { chart, userKey, profile } = req.body || {};
    const membership = getMembershipStatus({ chart, userKey, profile });
    res.locals.outputLength = JSON.stringify(membership).length;
    return res.json(ok({ membership }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/track-event', async (req, res) => {
  try {
    const {
      eventName,
      eventSource,
      userKey,
      sessionId,
      page,
      platform,
      payload,
    } = req.body || {};

    const event = trackAnalyticsEvent({
      eventName,
      eventSource,
      userKey,
      sessionId,
      page,
      platform,
      payload,
    });

    res.locals.outputLength = JSON.stringify(event).length;
    return res.json(ok({ event }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'track event failed', 'TRACK_EVENT_FAILED'));
  }
});

router.post('/paywall-lead', async (req, res) => {
  try {
    const {
      registration,
      selectedPlan,
      profile,
      userKey,
      chart,
      source,
    } = req.body || {};

    const lead = savePaywallLead({
      registration,
      selectedPlan,
      profile,
      userKey,
      chart,
      source,
    });

    res.locals.outputLength = JSON.stringify(lead).length;
    return res.json(ok({ lead }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'save lead failed', 'SAVE_LEAD_FAILED'));
  }
});

router.post('/manual-payment-review', async (req, res) => {
  try {
    const {
      registration,
      selectedPlan,
      paymentMethod,
      amountText,
      paidAtText,
      screenshotName,
      screenshotDataUrl,
      notes,
      profile,
      userKey,
      chart,
      source,
    } = req.body || {};

    const review = saveManualPaymentReview({
      registration,
      selectedPlan,
      paymentMethod,
      amountText,
      paidAtText,
      screenshotName,
      screenshotDataUrl,
      notes,
      profile,
      userKey,
      chart,
      source,
    });

    res.locals.outputLength = JSON.stringify(review).length;
    return res.json(ok({ review }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'save manual payment failed', 'SAVE_MANUAL_PAYMENT_FAILED'));
  }
});

router.post('/contact-mingji', async (req, res) => {
  try {
    const {
      registration,
      topic,
      message,
      profile,
      userKey,
      chart,
      source,
    } = req.body || {};

    const contact = saveContactMessage({
      registration,
      topic,
      message,
      profile,
      userKey,
      chart,
      source,
    });

    res.locals.outputLength = JSON.stringify(contact).length;
    return res.json(ok({ contact }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'save contact failed', 'SAVE_CONTACT_FAILED'));
  }
});

module.exports = router;
