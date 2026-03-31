const express = require('express');
const multer = require('multer');
const { runChat, runReading, runTranscription } = require('../services/openaiService');
const { getQuotaStatus, consumeQuota, getMembershipStatus } = require('../services/quotaService');
const { trackAnalyticsEvent } = require('../services/analyticsService');
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

module.exports = router;
