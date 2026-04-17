const SCHEMA_VERSION = 'mingsky-narrative-output.v1';

function textOf(value, fallback = '') {
  return `${value ?? fallback}`.trim();
}

function stripMarkdownCodeFence(text = '') {
  const raw = textOf(text);
  if (!raw) return '';
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function tryParseJson(text = '') {
  const raw = stripMarkdownCodeFence(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function normalizeSectionId(value, index) {
  const fallback = `section_${index + 1}`;
  return textOf(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

function normalizeMingSkyNarrativeSection(section, index, fallbackEvidenceRefs = []) {
  const title = textOf(section?.title || section?.heading, `段落 ${index + 1}`);
  const content = textOf(section?.content || section?.body);
  if (!content) return null;

  return {
    section_id: normalizeSectionId(section?.section_id || section?.id, index),
    type: textOf(section?.type, 'summary'),
    title,
    content,
    evidence_refs: Array.isArray(section?.evidence_refs)
      ? section.evidence_refs.map((item) => textOf(item)).filter(Boolean)
      : fallbackEvidenceRefs,
  };
}

function normalizeMingSkyNarrativeOutput(candidate, payload = {}) {
  const fallbackTitle = textOf(payload?.chart_meta?.report_title, '明空星盘报告');
  const fallbackSummary = textOf(payload?.chart_meta?.summary, '');
  const fallbackEvidenceRefs = Array.isArray(payload?.semantic?.evidence)
    ? payload.semantic.evidence.map((item) => textOf(item?.code)).filter(Boolean).slice(0, 8)
    : [];
  const rawSections = Array.isArray(candidate?.sections) ? candidate.sections : [];

  const sections = rawSections
    .map((section, index) => normalizeMingSkyNarrativeSection(section, index, fallbackEvidenceRefs))
    .filter(Boolean)
    .slice(0, 6);

  if (!sections.length) {
    const fallbackBodies = [
      textOf(payload?.semantic?.insights?.[0]?.body),
      textOf(payload?.sections?.[0]?.body),
      fallbackSummary,
    ].filter(Boolean);

    sections.push({
      section_id: 'orientation',
      type: 'summary',
      title: '报告导语',
      content: fallbackBodies.join(' '),
      evidence_refs: fallbackEvidenceRefs,
    });
  }

  return {
    schema_version: SCHEMA_VERSION,
    title: textOf(candidate?.title, fallbackTitle),
    summary: textOf(candidate?.summary, fallbackSummary || sections[0]?.content || ''),
    sections,
  };
}

function buildMingSkyNarrativePrompt(payload = {}) {
  const chartMeta = payload?.chart_meta || {};
  const insights = Array.isArray(payload?.semantic?.insights) ? payload.semantic.insights : [];
  const tags = Array.isArray(payload?.semantic?.tags) ? payload.semantic.tags : [];
  const evidence = Array.isArray(payload?.semantic?.evidence) ? payload.semantic.evidence : [];
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];

  return [
    '你是明空星占的 AI narrative layer。',
    '你的职责是把结构化解释结果改写成更自然、更有产品感的中文报告预览。',
    '你不能修改任何底层事实，也不能发明不存在的星盘结论。',
    '',
    '【硬性规则】',
    '- 不得改动生日、时间、地点、时区、上升星座、宫位制、行星位置、相位、evidence code。',
    '- 不得新增 payload 中不存在的事实性断言。',
    '- 允许润色语气、整理段落、压缩重复信息。',
    '- 语气要温和、清楚、可信，不要神神叨叨，也不要像客服。',
    '- 输出必须是 JSON，不要带 markdown 代码块，不要额外解释。',
    '',
    '【输出 JSON schema】',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
    '  "sections": [',
    '    {',
    '      "section_id": "string",',
    '      "type": "summary|personality|relationships|career|money|growth|timing|shadow|cta",',
    '      "title": "string",',
    '      "content": "string",',
    '      "evidence_refs": ["string"]',
    '    }',
    '  ]',
    '}',
    '',
    '【图盘元信息】',
    `- 报告标题：${textOf(chartMeta.report_title, '未提供')}`,
    `- 当前标题：${textOf(chartMeta.headline, '未提供')}`,
    `- 当前摘要：${textOf(chartMeta.summary, '未提供')}`,
    `- 出生：${textOf(chartMeta.birth_date, '未提供')} ${textOf(chartMeta.birth_time, '')}`.trim(),
    `- 地点：${textOf(chartMeta.city, '未提供')} ${textOf(chartMeta.province, '')}`.trim(),
    `- 时区：${textOf(chartMeta.timezone, '未提供')}`,
    `- 上升：${textOf(chartMeta.asc_sign, '未提供')}`,
    `- 宫位制：${textOf(chartMeta.house_system_label || chartMeta.house_system, '未提供')}`,
    '',
    '【insights】',
    ...insights.slice(0, 8).map((item, index) => `${index + 1}. [${textOf(item.code)}] ${textOf(item.title)}｜${textOf(item.body)}｜section=${textOf(item.section)}｜confidence=${textOf(item.confidence)}`),
    '',
    '【tags】',
    ...tags.slice(0, 12).map((item, index) => `${index + 1}. [${textOf(item.code)}] ${textOf(item.label)}｜cross_system=${item?.cross_system_agreement ? 'true' : 'false'}`),
    '',
    '【evidence】',
    ...evidence.slice(0, 12).map((item, index) => `${index + 1}. [${textOf(item.code)}] ${textOf(item.label)}｜system=${textOf(item.system)}`),
    '',
    '【章节草稿】',
    ...sections.slice(0, 6).map((item, index) => `${index + 1}. ${textOf(item.title)}：${textOf(item.body)}`),
    '',
    '请返回 3 到 5 个 sections，其中最后一个 section 可以是 CTA，提醒用户创建账户或开通会员查看完整分析。',
  ].join('\n');
}

function validateMingSkyNarrativeOutputShape(output) {
  const errors = [];
  if (!output || typeof output !== 'object') errors.push('output must be an object');
  if (!textOf(output?.title)) errors.push('title is required');
  if (!textOf(output?.summary)) errors.push('summary is required');
  if (!Array.isArray(output?.sections) || !output.sections.length) errors.push('sections must be a non-empty array');

  (output?.sections || []).forEach((section, index) => {
    if (!textOf(section?.section_id)) errors.push(`sections[${index}].section_id is required`);
    if (!textOf(section?.type)) errors.push(`sections[${index}].type is required`);
    if (!textOf(section?.title)) errors.push(`sections[${index}].title is required`);
    if (!textOf(section?.content)) errors.push(`sections[${index}].content is required`);
    if (!Array.isArray(section?.evidence_refs)) errors.push(`sections[${index}].evidence_refs must be an array`);
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildMingSkyNarrativePrompt,
  normalizeMingSkyNarrativeOutput,
  tryParseJson,
  validateMingSkyNarrativeOutputShape,
};
