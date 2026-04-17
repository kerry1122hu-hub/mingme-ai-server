const express = require('express');
const { getQuotaStatus, consumeQuota } = require('../services/quotaService');
const { requireAppToken } = require('../utils/auth');
const { fail, ok } = require('../utils/response');
const { generateMingKongReply, DEFAULT_MODEL } = require('../services/mingkongAiReplyService');

const router = express.Router();

function textOf(value, fallback = '') {
  return `${value ?? fallback}`.trim();
}

function normalizeProfile(userId, profileCard = {}, topic = '') {
  return {
    nickname: textOf(profileCard?.user_name),
    gender: '',
    city: '',
    role: 'mingsky_user',
    focus: textOf(topic),
    user_id: textOf(userId),
  };
}

function normalizeChart(profileCard = {}, topic = '') {
  const summary = profileCard?.chart_core_summary || {};
  return {
    profile: {
      city: '',
      focus: textOf(topic),
    },
    birthInfo: {
      year: '',
      month: '',
      day: '',
      hour: '',
      minute: '',
      gender: '',
    },
    chartCoreSummary: summary,
    timeAccuracy: textOf(profileCard?.time_accuracy, 'unknown'),
  };
}

function buildTrace(requestId, model, latencyMs) {
  return {
    request_id: requestId,
    model,
    latency_ms: latencyMs,
  };
}

router.use(requireAppToken);

router.post('/reply', async (req, res) => {
  const startedAt = Date.now();
  const requestId = `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const {
      user_id,
      scene = 'chat',
      topic = 'general',
      profile_card,
      semantic_profile,
      intent_packet,
      session_state,
      output_contract,
      model,
    } = req.body || {};

    if (!profile_card || typeof profile_card !== 'object') {
      return res.status(400).json(fail('profile_card is required', 'BAD_REQUEST'));
    }
    if (!semantic_profile || typeof semantic_profile !== 'object') {
      return res.status(400).json(fail('semantic_profile is required', 'BAD_REQUEST'));
    }
    if (!intent_packet || typeof intent_packet !== 'object') {
      return res.status(400).json(fail('intent_packet is required', 'BAD_REQUEST'));
    }
    if (!output_contract || typeof output_contract !== 'object') {
      return res.status(400).json(fail('output_contract is required', 'BAD_REQUEST'));
    }
    if (!textOf(intent_packet?.user_question)) {
      return res.status(400).json(fail('intent_packet.user_question is required', 'BAD_REQUEST'));
    }

    const resolvedUserKey = textOf(user_id, requestId);
    const chart = normalizeChart(profile_card, topic);
    const profile = normalizeProfile(user_id, profile_card, topic);
    const quota = consumeQuota({
      chart,
      userKey: resolvedUserKey,
      profile,
    });

    const payload = {
      user_id: resolvedUserKey,
      scene: textOf(scene, 'chat'),
      topic: textOf(topic, 'general'),
      profile_card,
      semantic_profile,
      intent_packet,
      session_state: session_state && typeof session_state === 'object' ? session_state : {},
      output_contract,
    };

    const resolvedModel = textOf(model, DEFAULT_MODEL) || DEFAULT_MODEL;
    const { reply, trace } = await generateMingKongReply({
      payload,
      model: resolvedModel,
      requestId,
    });

    const finalTrace = buildTrace(requestId, trace?.model || resolvedModel, trace?.latency_ms || (Date.now() - startedAt));
    res.locals.outputLength = JSON.stringify(reply).length;
    return res.json(ok({ reply, quota, trace: finalTrace }));
  } catch (error) {
    res.locals.outputLength = 0;
    const status =
      error?.code === 'AI_REFUSAL' ? 422 :
      error?.code === 'AI_TIMEOUT' ? 504 :
      error?.status || 500;

    if (error.code === 'AI_QUOTA_EXCEEDED') {
      return res.status(status).json(fail('今日免费次数已用完，可开通会员继续使用 AI。', error.code, { quota: error.quota }));
    }

    return res.status(status).json(fail(error.message || 'server error', error.code || 'SERVER_ERROR', {
      trace: buildTrace(requestId, textOf(req.body?.model, DEFAULT_MODEL), Date.now() - startedAt),
    }));
  }
});

router.post('/quota-status', async (req, res) => {
  try {
    const { user_id, profile_card, topic } = req.body || {};
    const quota = getQuotaStatus({
      userKey: textOf(user_id),
      chart: normalizeChart(profile_card || {}, topic || ''),
      profile: normalizeProfile(user_id, profile_card || {}, topic || ''),
    });
    res.locals.outputLength = `${quota.remaining}`.length;
    return res.json(ok({ quota }));
  } catch (error) {
    res.locals.outputLength = 0;
    return res.status(500).json(fail(error.message || 'server error', 'SERVER_ERROR'));
  }
});

module.exports = router;
