const express = require('express');
const multer = require('multer');
const { runChat, runReading, runMingSkyChat, runMingSkyNarrative, runTranscription, runXiaoLiuRenReading } = require('../services/openaiService');
const {
  getQuotaStatus,
  consumeQuota,
  getMembershipStatus,
  grantRegistrationTrial,
} = require('../services/quotaService');
const { trackAnalyticsEvent } = require('../services/analyticsService');
const { savePaywallLead } = require('../services/paywallLeadService');
const { saveManualPaymentReview } = require('../services/manualPaymentService');
const { saveContactMessage } = require('../services/contactMessageService');
const {
  notifyAdminContactMessageNonBlocking,
  notifyAdminManualPaymentReviewNonBlocking,
} = require('../services/adminEmailService');
const { notifyOpenClawNewContact } = require('../services/openclawNotifyService');
const { notifyOpenClawNonBlocking } = require('../services/openclawWebhookService');
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

router.post('/mingsky-narrative', async (req, res) => {
  try {
    const { payload, chart, model, userKey, profile } = req.body || {};

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json(fail('payload is required', 'BAD_REQUEST'));
    }

    const quota = consumeQuota({ chart, userKey, profile });

    const narrative = await runMingSkyNarrative({
      payload,
      model: `${model || 'gpt-4o-mini'}`.trim(),
    });

    res.locals.outputLength = JSON.stringify(narrative).length;
    return res.json(ok({ narrative, quota }));
  } catch (error) {
    res.locals.outputLength = 0;
    const status = error.status || 500;
    if (error.code === 'AI_QUOTA_EXCEEDED') {
      return res.status(status).json(fail('今日免费次数已用完，可开通会员继续使用 AI。', error.code, { quota: error.quota }));
    }
    return res.status(status).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/mingsky-chat', async (req, res) => {
  try {
    const { payload, message, chart, model, userKey, profile, history } = req.body || {};

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json(fail('payload is required', 'BAD_REQUEST'));
    }

    if (!message || !`${message}`.trim()) {
      return res.status(400).json(fail('message is required', 'BAD_REQUEST'));
    }

    const quota = consumeQuota({ chart, userKey, profile });
    const chat = await runMingSkyChat({
      payload,
      message: `${message}`.trim(),
      history,
      model: `${model || 'gpt-4o-mini'}`.trim(),
    });

    res.locals.outputLength = JSON.stringify(chat).length;
    return res.json(ok({ chat, quota }));
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
    const membership = getMembershipStatus({ chart, userKey, profile });
    const resolvedMemberTier = `${membership?.memberTier || memberTier || 'free'}`.trim() || 'free';

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
      memberTier: resolvedMemberTier,
      engineVersion: resolvedEngineVersion,
      mode: `${mode || 'current'}`.trim() || 'current',
      sceneType: engineResult.sceneType,
      eventContext: engineResult.eventContext,
      clientMeta: client_meta || null,
      chart,
      question: `${question || ''}`.trim(),
      engineResult,
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
      memberTier: resolvedMemberTier,
      engineResult,
      model: `${model || 'gpt-4o-mini'}`.trim(),
    });

    res.locals.outputLength = `${text || ''}`.length;
    return res.json(ok({ text, engineResult, riskControl, membership }));
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

router.post('/registration-trial', async (req, res) => {
  try {
    const { chart, userKey, profile, registration } = req.body || {};
    const membership = grantRegistrationTrial({
      chart,
      userKey,
      profile: {
        ...(profile || {}),
        nickname: `${registration?.nickname || profile?.nickname || ''}`.trim(),
        city: `${registration?.city || profile?.city || ''}`.trim(),
        focus: `${registration?.focus || profile?.focus || ''}`.trim(),
      },
      registration,
      trialDays: 30,
    });

    notifyOpenClawNonBlocking('user.signup', 'MingMe', {
      userKey: userKey || membership?.userKey || '',
      nickname: `${registration?.nickname || profile?.nickname || ''}`.trim(),
      city: `${registration?.city || profile?.city || ''}`.trim(),
      focus: `${registration?.focus || profile?.focus || ''}`.trim(),
      email: `${registration?.email || profile?.email || ''}`.trim(),
      phone: `${registration?.phone || profile?.phone || ''}`.trim(),
      memberTier: membership?.tier || 'trial',
      status: membership?.status || 'active',
      source: 'registration_trial',
    });

    res.locals.outputLength = JSON.stringify(membership).length;
    return res.json(ok({ membership }));
  } catch (error) {
    notifyOpenClawNonBlocking('app.error', 'MingMe', {
      route: '/api/ai/registration-trial',
      code: error?.code || 'REGISTRATION_TRIAL_FAILED',
      message: error?.message || 'registration trial failed',
      severity: 'warning',
    });
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

router.post('/login-event', async (req, res) => {
  try {
    const { userKey, profile, source, method, sessionId } = req.body || {};
    notifyOpenClawNonBlocking('user.login', 'MingMe', {
      userKey: `${userKey || ''}`.trim(),
      nickname: `${profile?.nickname || profile?.name || ''}`.trim(),
      email: `${profile?.email || ''}`.trim(),
      phone: `${profile?.phone || ''}`.trim(),
      city: `${profile?.city || ''}`.trim(),
      source: `${source || 'client_login_event'}`.trim() || 'client_login_event',
      method: `${method || 'password'}`.trim() || 'password',
      sessionId: `${sessionId || ''}`.trim(),
      status: 'success',
    });

    res.locals.outputLength = 2;
    return res.json(ok({ accepted: true }));
  } catch (error) {
    notifyOpenClawNonBlocking('app.error', 'MingMe', {
      route: '/api/ai/login-event',
      code: error?.code || 'LOGIN_EVENT_FAILED',
      message: error?.message || 'login event failed',
      severity: 'warning',
    });
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

    notifyOpenClawNonBlocking('feedback.received', 'MingMe', {
      eventKind: 'paywall_lead',
      userKey: `${userKey || lead?.userKey || ''}`.trim(),
      nickname: `${registration?.nickname || profile?.nickname || ''}`.trim(),
      city: `${registration?.city || profile?.city || ''}`.trim(),
      focus: `${registration?.focus || profile?.focus || ''}`.trim(),
      email: `${registration?.email || profile?.email || ''}`.trim(),
      phone: `${registration?.phone || profile?.phone || ''}`.trim(),
      selectedPlan: `${selectedPlan?.productCode || selectedPlan?.key || selectedPlan?.value || ''}`.trim(),
      source: `${source || 'paywall_lead'}`.trim() || 'paywall_lead',
      status: 'submitted',
    });

    res.locals.outputLength = JSON.stringify(lead).length;
    return res.json(ok({ lead }));
  } catch (error) {
    notifyOpenClawNonBlocking('app.error', 'MingMe', {
      route: '/api/ai/paywall-lead',
      code: error?.code || 'SAVE_LEAD_FAILED',
      message: error?.message || 'save lead failed',
      severity: 'warning',
    });
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

    notifyOpenClawNonBlocking('payment.success', 'MingMe', {
      eventKind: 'manual_payment_review',
      userKey: `${userKey || review?.userKey || ''}`.trim(),
      nickname: `${registration?.nickname || profile?.nickname || ''}`.trim(),
      city: `${registration?.city || profile?.city || ''}`.trim(),
      email: `${registration?.email || profile?.email || ''}`.trim(),
      phone: `${registration?.phone || profile?.phone || ''}`.trim(),
      paymentMethod: `${paymentMethod || ''}`.trim(),
      amountText: `${amountText || ''}`.trim(),
      paidAtText: `${paidAtText || ''}`.trim(),
      screenshotName: `${screenshotName || ''}`.trim(),
      source: `${source || 'manual_payment_review'}`.trim() || 'manual_payment_review',
      status: 'submitted',
    });
    notifyAdminManualPaymentReviewNonBlocking({
      id: review?.id || null,
      userKey: `${userKey || review?.userKey || ''}`.trim(),
      nickname: `${registration?.nickname || profile?.nickname || ''}`.trim(),
      city: `${registration?.city || profile?.city || ''}`.trim(),
      focus: `${registration?.focus || profile?.focus || ''}`.trim(),
      email: `${registration?.email || profile?.email || ''}`.trim(),
      phone: `${registration?.phone || profile?.phone || ''}`.trim(),
      selectedPlan: `${selectedPlan || review?.selectedPlan || ''}`.trim(),
      paymentMethod: `${paymentMethod || review?.paymentMethod || ''}`.trim(),
      amountText: `${amountText || ''}`.trim(),
      paidAtText: `${paidAtText || ''}`.trim(),
      screenshotName: `${screenshotName || ''}`.trim(),
      screenshotDataUrl: `${screenshotDataUrl || ''}`.trim(),
      notes: `${notes || ''}`.trim(),
      source: `${source || 'manual_payment_review'}`.trim() || 'manual_payment_review',
      createdAt: new Date().toISOString(),
    });

    res.locals.outputLength = JSON.stringify(review).length;
    return res.json(ok({ review }));
  } catch (error) {
    notifyOpenClawNonBlocking('payment.failed', 'MingMe', {
      route: '/api/ai/manual-payment-review',
      code: error?.code || 'SAVE_MANUAL_PAYMENT_FAILED',
      message: error?.message || 'save manual payment failed',
      severity: 'warning',
    });
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

    void notifyOpenClawNewContact({
      ...contact,
      nickname: `${registration?.nickname || ''}`.trim(),
      city: `${registration?.city || ''}`.trim(),
      focus: `${registration?.focus || ''}`.trim(),
      email: `${registration?.email || ''}`.trim(),
      phone: `${registration?.phone || ''}`.trim(),
      message: `${message || ''}`.trim(),
      source: `${source || 'member_contact'}`.trim() || 'member_contact',
    }).catch((error) => {
      console.error('[openclaw] failed to notify new contact message:', error);
    });
    notifyAdminContactMessageNonBlocking({
      ...contact,
      userKey: `${userKey || contact?.userKey || ''}`.trim(),
      nickname: `${registration?.nickname || profile?.nickname || ''}`.trim(),
      city: `${registration?.city || profile?.city || ''}`.trim(),
      focus: `${registration?.focus || profile?.focus || ''}`.trim(),
      email: `${registration?.email || profile?.email || ''}`.trim(),
      phone: `${registration?.phone || profile?.phone || ''}`.trim(),
      topic: `${topic || ''}`.trim(),
      message: `${message || ''}`.trim(),
      source: `${source || 'member_contact'}`.trim() || 'member_contact',
      createdAt: new Date().toISOString(),
    });

    res.locals.outputLength = JSON.stringify(contact).length;
    return res.json(ok({ contact }));
  } catch (error) {
    notifyOpenClawNonBlocking('app.error', 'MingMe', {
      route: '/api/ai/contact-mingji',
      code: error?.code || 'SAVE_CONTACT_FAILED',
      message: error?.message || 'save contact failed',
      severity: 'warning',
    });
    res.locals.outputLength = 0;
    return res.status(400).json(fail(error.message || 'save contact failed', 'SAVE_CONTACT_FAILED'));
  }
});

module.exports = router;
