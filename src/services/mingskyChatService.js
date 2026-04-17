const SCHEMA_VERSION = 'mingsky-chat-output.v1';

function textOf(value, fallback = '') {
  return `${value ?? fallback}`.trim();
}

function compactList(items = [], limit = 6) {
  return (Array.isArray(items) ? items : [])
    .map((item) => textOf(item))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: textOf(item?.content || item?.text),
    }))
    .filter((item) => item.content)
    .slice(-8);
}

function buildMingSkyChatPrompt(payload = {}, message = '') {
  const chartMeta = payload?.chart_meta || {};
  const semantic = payload?.semantic || {};
  const narrative = payload?.narrative || {};
  const sections = Array.isArray(narrative?.sections) ? narrative.sections : [];

  const insightLines = (Array.isArray(semantic?.insights) ? semantic.insights : [])
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${textOf(item?.title)}：${textOf(item?.body)}`);
  const tagLines = (Array.isArray(semantic?.tags) ? semantic.tags : [])
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${textOf(item?.label || item?.code)}${item?.cross_system_agreement ? '（跨体系共振）' : ''}`);
  const sectionLines = sections
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${textOf(item?.title)}：${textOf(item?.content || item?.body)}`);
  const actionLines = compactList(payload?.action_items, 6).map((item, index) => `${index + 1}. ${item}`);

  return [
    '你是明空星占的专用 AI 星盘助手。',
    '你的职责是基于已经生成好的明空星盘、语义标签和 narrative 章节，用中文直接回答用户问题。',
    '',
    '【回答原则】',
    '- 只能基于提供的 payload 回答，不要杜撰新的行星位置、宫位、相位或时间判断。',
    '- 口吻要自然、温和、像懂星盘的人在陪用户读报告，不要写成客服腔。',
    '- 回答要先直答问题，再补一层解释；通常控制在 2 到 4 段。',
    '- 如果用户问超出当前试读范围，可以先回答能回答的部分，再提醒“完整报告会展开更多细节”。',
    '- 不提供医疗、法律、投资类确定性建议。',
    '',
    '【当前星盘上下文】',
    `- 报告标题：${textOf(chartMeta?.report_title, '明空星盘试读')}`,
    `- 当前主标题：${textOf(chartMeta?.headline, '未提供')}`,
    `- 摘要：${textOf(chartMeta?.summary, '未提供')}`,
    `- 出生信息：${textOf(chartMeta?.birth_date, '未提供')} ${textOf(chartMeta?.birth_time, '')}`.trim(),
    `- 地点：${textOf(chartMeta?.city, '未提供')} ${textOf(chartMeta?.province, '')}`.trim(),
    `- 时区：${textOf(chartMeta?.timezone, '未提供')}`,
    `- 上升星座：${textOf(chartMeta?.asc_sign, '未提供')}`,
    `- 宫位制度：${textOf(chartMeta?.house_system_label || chartMeta?.house_system, '未提供')}`,
    '',
    '【核心 insights】',
    ...(insightLines.length ? insightLines : ['- 未提供']),
    '',
    '【tags】',
    ...(tagLines.length ? tagLines : ['- 未提供']),
    '',
    '【报告章节】',
    ...(sectionLines.length ? sectionLines : ['- 未提供']),
    '',
    '【行动提示】',
    ...(actionLines.length ? actionLines : ['- 未提供']),
    '',
    `【用户问题】${textOf(message, '未提供')}`,
  ].join('\n');
}

function normalizeMingSkyChatOutput(candidate = {}, fallback = {}) {
  const reply = textOf(candidate?.reply || candidate?.text || candidate?.content, fallback.reply || '');
  const suggestedQuestions = compactList(
    candidate?.suggested_questions || candidate?.suggestedQuestions || fallback.suggested_questions,
    3,
  );

  return {
    schema_version: SCHEMA_VERSION,
    reply,
    suggested_questions: suggestedQuestions,
  };
}

function validateMingSkyChatOutput(output) {
  const errors = [];
  if (!output || typeof output !== 'object') errors.push('output must be an object');
  if (!textOf(output?.reply)) errors.push('reply is required');
  if (!Array.isArray(output?.suggested_questions)) errors.push('suggested_questions must be an array');
  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildMingSkyChatPrompt,
  normalizeHistory,
  normalizeMingSkyChatOutput,
  validateMingSkyChatOutput,
};
