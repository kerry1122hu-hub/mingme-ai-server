const OpenAI = require('openai');
const replySchema = require('../schemas/mingkong-ai-reply-v1.schema.json');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = `${process.env.MINGKONG_REPLY_MODEL || 'gpt-4o-mini'}`.trim() || 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = Math.max(3000, Number(process.env.MINGKONG_REPLY_TIMEOUT_MS || 20000) || 20000);
const MAX_RETRIES = 1;
const OPENAI_REPLY_SCHEMA = {
  type: replySchema.type,
  additionalProperties: replySchema.additionalProperties,
  required: replySchema.required,
  properties: replySchema.properties,
};

function log(level, message, extra = null) {
  const prefix = `[mingkong-ai-reply] ${message}`;
  if (level === 'error') {
    console.error(prefix, extra || '');
    return;
  }
  if (level === 'warn') {
    console.warn(prefix, extra || '');
    return;
  }
  console.info(prefix, extra || '');
}

function textOf(value, fallback = '') {
  return `${value ?? fallback}`.trim();
}

function clip(value, maxLength = 500) {
  const text = textOf(value);
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function stripCodeFence(text = '') {
  return textOf(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function tryParseJson(text = '') {
  const raw = stripCodeFence(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`MingKong AI reply timed out after ${timeoutMs}ms`);
        error.code = 'AI_TIMEOUT';
        reject(error);
      }, timeoutMs);
    }),
  ]);
}

function buildDeveloperPrompt() {
  return `你是“明空”APP 的 AI 星盘解读助手。

你的职责：
1. 你不负责重新计算星盘。
2. 你只基于输入中的 profile_card、semantic_profile、intent_packet、session_state 回答。
3. 你要优先使用 priority_insights 和 priority_tags。
4. 你的回答必须贴合用户当前问题，而不是泛泛分析整张盘。

你的输出目标：
1. 先给结论。
2. 再解释为什么会这样。
3. 最后给一条可执行建议。
4. 语言保持清晰、温和、专业，不玄，不神化，不空泛。

严格规则：
1. 不得编造任何不存在的星盘事实、相位、宫位、insight 或 tag。
2. 不得跳出提供的数据自行重算。
3. 如果 time_accuracy 不是 exact，则不得对宫位、上升、天顶、时间敏感结论做强判断。
4. 不得使用宿命论、绝对化、恐吓式表达。
5. 不得给出医疗、法律、金融上的确定性建议。
6. 如果用户问题与提供的 insight 相关度不足，应尽量给出低推断强度回答，并可提出一个简短澄清问题。
7. 如果 session_state.avoid_repetition 为 true，避免重复 already_explained 中的原句。
8. 回答必须尽量短而准，优先围绕当前 topic。
9. 结论要像产品内回答，不要像百科，不要像论坛长帖。

风格要求：
1. 默认中文简体。
2. 风格为：直接、结构化、略温和、不过度安抚。
3. 避免“你注定”“命里就是”“一定会”等措辞。
4. 可以使用“更容易”“倾向于”“这阶段可能更明显”等表述。

选择规则：
1. 优先使用 confidence 更高的 insights。
2. 如果两个 insight 有张力，允许同时保留，但表达成“你一方面……另一方面……”。
3. used_insights 最多选 3 个。
4. used_tags 最多选 5 个。
5. 如果信息已足够，则 needs_followup=false，followup_question=null。
6. 如果确实缺关键信息，则 needs_followup=true，并给一个单句追问。

你必须只输出符合 schema 的 JSON，不要输出额外文本。`;
}

function buildUserPayload(payload = {}) {
  return JSON.stringify(payload);
}

function normalizeReply(candidate = {}) {
  const answer = candidate?.answer || {};
  const normalized = {
    answer: {
      conclusion: clip(answer?.conclusion, 180),
      explanation: clip(answer?.explanation, 500),
      advice: clip(answer?.advice, 220),
    },
    used_insights: Array.isArray(candidate?.used_insights)
      ? candidate.used_insights.map((item) => textOf(item)).filter(Boolean).slice(0, 3)
      : [],
    used_tags: Array.isArray(candidate?.used_tags)
      ? candidate.used_tags.map((item) => textOf(item)).filter(Boolean).slice(0, 5)
      : [],
    confidence: Math.max(0, Math.min(1, Number(candidate?.confidence || 0))),
    needs_followup: Boolean(candidate?.needs_followup),
    followup_question: candidate?.followup_question == null ? null : clip(candidate?.followup_question, 120),
    safety_flags: Array.isArray(candidate?.safety_flags)
      ? candidate.safety_flags.map((item) => textOf(item)).filter(Boolean)
      : [],
  };

  if (!normalized.safety_flags.length) {
    normalized.safety_flags = ['none'];
  }
  if (!normalized.needs_followup) {
    normalized.followup_question = null;
  }

  return normalized;
}

function validateReplyShape(output) {
  const errors = [];
  if (!textOf(output?.answer?.conclusion)) errors.push('answer.conclusion is required');
  if (!textOf(output?.answer?.explanation)) errors.push('answer.explanation is required');
  if (!textOf(output?.answer?.advice)) errors.push('answer.advice is required');
  if (!Array.isArray(output?.used_insights)) errors.push('used_insights must be an array');
  if (!Array.isArray(output?.used_tags)) errors.push('used_tags must be an array');
  if (typeof output?.confidence !== 'number' || Number.isNaN(output.confidence)) errors.push('confidence must be a number');
  if (typeof output?.needs_followup !== 'boolean') errors.push('needs_followup must be a boolean');
  if (!(typeof output?.followup_question === 'string' || output?.followup_question === null)) errors.push('followup_question must be string or null');
  if (!Array.isArray(output?.safety_flags)) errors.push('safety_flags must be an array');
  return {
    ok: errors.length === 0,
    errors,
  };
}

async function requestOnce({ payload, model, timeoutMs }) {
  const startedAt = Date.now();
  const response = await withTimeout(
    client.chat.completions.create({
      model,
      messages: [
        {
          role: 'developer',
          content: buildDeveloperPrompt(),
        },
        {
          role: 'user',
          content: buildUserPayload(payload),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mingkong_ai_reply_v1',
          strict: true,
          schema: OPENAI_REPLY_SCHEMA,
        },
      },
    }),
    timeoutMs,
  );

  const latencyMs = Date.now() - startedAt;
  const message = response?.choices?.[0]?.message || {};

  if (message?.refusal) {
    const error = new Error(message.refusal);
    error.code = 'AI_REFUSAL';
    error.refusal = message.refusal;
    throw error;
  }

  const parsed = tryParseJson(message?.content || '');
  if (!parsed) {
    const error = new Error('AI reply returned non-JSON content');
    error.code = 'AI_JSON_PARSE_FAILED';
    throw error;
  }

  const normalized = normalizeReply(parsed);
  const validation = validateReplyShape(normalized);
  if (!validation.ok) {
    const error = new Error(`AI reply failed schema validation: ${validation.errors.join('; ')}`);
    error.code = 'AI_SCHEMA_INVALID';
    throw error;
  }

  return {
    reply: normalized,
    trace: {
      model,
      latency_ms: latencyMs,
    },
  };
}

async function generateMingKongReply({ payload, model = DEFAULT_MODEL, timeoutMs = DEFAULT_TIMEOUT_MS, requestId = '' }) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      log('info', `request started${requestId ? ` (${requestId})` : ''}`, { model, attempt });
      return await requestOnce({ payload, model, timeoutMs });
    } catch (error) {
      lastError = error;
      log(attempt < MAX_RETRIES ? 'warn' : 'error', `request failed${requestId ? ` (${requestId})` : ''}`, {
        attempt,
        code: error?.code || 'UNKNOWN',
        message: error?.message || 'Unknown error',
      });

      const retryable = !['AI_REFUSAL', 'AI_SCHEMA_INVALID'].includes(error?.code);
      if (!retryable || attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  throw lastError || new Error('MingKong AI reply failed');
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  buildDeveloperPrompt,
  generateMingKongReply,
  normalizeReply,
  replySchema,
  validateReplyShape,
};
