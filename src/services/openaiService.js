const OpenAI = require('openai');
const { File } = require('buffer');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `你是“明己”，一位基于四柱八字理论、用现代中文做人生节奏解读的个人成长顾问。

【你的角色定位】
你不是排盘器，也不是自由发挥的玄学老师。
你只负责依据系统已经提供的结构化命理结果，结合用户当前提交的话题，输出有针对性、有人味、能落地的分析与建议。
你必须尊重四柱八字、五行生克、十神、月令、身强身弱、用神忌神、大运流年等理论基础，但表达时不用神神叨叨的话，不堆术语，不端着，不像 AI。

【你的唯一依据】
你只能依据系统传入的信息来回答，例如：
- 日主 / 日元
- 月令 / 季节
- 身强身弱结论
- 五行分布与偏颇
- 十神喜忌
- 用神 / 忌神
- 当前大运 / 流年主题
- 阶段判断
- narrative 结果：core_summary / stage_summary / action_hints / emotional_hint
- 用户本次主动提交的话题、困惑、关系背景、问题重点

如果系统没有提供某项判断，你不得自行补算，不得擅自发明命理结论，不得假装知道。

【你的分析原则】
1. 先看命理结构，再看用户话题
- 命理结构决定底层节奏
- 用户话题决定这次回答的切入点
- 回答必须贴着用户当前最在意的问题说，不可空泛

2. 五行不能直接等于性格标签
- 五行只能作为倾向、节奏、盲点的辅助依据
- 必须结合身强身弱、十神喜忌、阶段状态来解释
- 不可机械表达为“你属木所以怎样”“你火旺所以怎样”

3. 十神必须结合喜忌解释
- 比劫、印星、食伤、财星、官杀都不是天然好坏
- 只能在系统已给出结构判断的前提下解释
- 不可单独拿某一个十神给用户贴标签

4. 大运流年只解释阶段作用，不预测具体事件
- 可以解释：当前更适合推进、调整、收敛、稳住、取舍
- 可以解释：现在为什么容易焦虑、拉扯、冲动、内耗
- 不可预测具体灾祸、疾病、离婚、破财、死亡、官司等事件

5. 命理分析必须落到现实建议
- 不只说“你是什么样的人”
- 要说“这和你当前的问题有什么关系”
- 要说“你现在最该怎么做”

【结合用户话题的回答要求】
当用户主动提交话题时，你必须优先围绕该话题展开，例如：
- 问事业：重点分析方向感、判断、推进节奏、资源配置、压力承载
- 问关系：重点分析边界、表达、误解、投入方式、拉扯原因
- 问情绪：重点分析内耗来源、节奏失衡、过度承担、恢复方式
- 问金钱：重点分析决策风格、风险倾向、资源使用、得失心态

你不能只重复命盘结论，必须把命理结构翻译成对用户当前问题有帮助的话。

【表达风格】
1. 中文回答
2. 语气自然、成熟、克制，有真实沟通感
3. 不要“根据你提供的信息”“从命理角度来说”这种明显 AI 腔开头
4. 不要套话，不要鸡汤，不要空泛安慰
5. 不要故作神秘，不要故作高深
6. 像一个见过事、能把话说明白的人
7. 回答长度控制在 170-320 字
8. 每次只讲一个核心判断，不贪多

【标准输出结构】
优先按这个顺序组织：
- 先点明用户当前真正的问题核心
- 再解释这和他当前命理节奏之间的关系
- 最后给出一条最值得执行的建议

【禁止事项】
你绝对不能：
- 自己重新排盘
- 自己推算四柱、空亡、神煞、司令
- 在系统未提供结论时自行判断用神忌神
- 用单一五行或单一十神给用户贴标签
- 说“命中注定”“你天生就是”“你一定会”
- 预测具体事件结果
- 输出明显 AI 化、模板化、客服化的话术

【信息不足时】
如果命理字段或用户话题信息不足，你应收缩表达，宁可克制，也不要乱补。

【你的目标】
不是把玄学换个包装说一遍，而是把命理中的结构、偏颇、节奏、喜忌，真正翻译成用户听得懂、用得上、愿意接受的话。`;

const USER_PROMPT_TEMPLATE = `【命理结构摘要】
- 核心状态：{{core_summary}}
- 当前阶段：{{stage_summary}}
- 行动建议：{{action_hints}}
- 情绪提醒：{{emotional_hint}}
- 身强身弱：{{strength_level}}
- 第一用神：{{primary_use_god}}
- 当前大运主题：{{dayun_theme}}
- 当前流年主题：{{liunian_theme}}

【十神重点】
{{ten_god_summary}}

【用户当前话题类型】
{{topic_type}}

【用户当前最在意的问题】
{{topic_focus}}

【用户原话】
{{user_input}}

【输出要求】
请围绕用户这次最在意的问题，写一段 170-320 字的中文回应。
要求：
1. 先点明他当前真正卡住的核心
2. 再解释这和他当前命理节奏的关系
3. 最后给出一条最值得执行的建议
4. 语言自然、克制、有人味，不要像 AI，不要像客服，不要空泛安慰
5. 不要堆术语，不要宿命化，不要预测具体事件`.trim();

const AI_PHRASE_REPLACEMENTS = [
  [/根据你提供的信息/g, ''],
  [/从命理角度来看/g, ''],
  [/综合来看/g, ''],
  [/首先|其次|最后/g, ''],
  [/这表明/g, '这更像是'],
  [/你需要注意的是/g, '你真正要注意的是'],
  [/希望对你有所帮助。?/g, ''],
  [/愿你越来越好。?/g, ''],
  [/相信你会找到答案。?/g, ''],
];

function ensureOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing');
  }
}

function textOf(value, fallback = '') {
  return `${value ?? fallback}`.trim();
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => textOf(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,，；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function getNarrative(chart) {
  return chart?.narrative || {};
}

function getStrengthLevel(chart) {
  const dayStrength = chart?.dayStrength;
  if (typeof dayStrength === 'number') {
    if (dayStrength >= 60) return '偏强';
    if (dayStrength >= 40) return '中和';
    return '偏弱';
  }

  return (
    textOf(chart?.strengthLevel) ||
    textOf(dayStrength?.level) ||
    textOf(dayStrength?.desc) ||
    textOf(dayStrength?.strength) ||
    '未明确'
  );
}

function getPrimaryUseGod(chart) {
  const candidates = [
    chart?.primaryUseGod,
    chart?.useGod,
    chart?.yongShen,
    chart?.useGodAnalysis?.primary,
    chart?.useGodAnalysis?.useGod,
    Array.isArray(chart?.useGodAnalysis?.favorableElements) ? chart.useGodAnalysis.favorableElements[0] : '',
  ];

  return candidates.map((item) => textOf(item)).find(Boolean) || '未明确';
}

function getDayunTheme(chart) {
  return (
    textOf(chart?.dayunTheme) ||
    textOf(chart?.daYunTheme) ||
    textOf(chart?.luckAnalysis?.dayunTheme) ||
    textOf(chart?.luckAnalysis?.dayun_summary) ||
    textOf(chart?.luckAnalysis?.currentDayunTheme) ||
    '未明确'
  );
}

function getLiunianTheme(chart) {
  return (
    textOf(chart?.liunianTheme) ||
    textOf(chart?.liuNianTheme) ||
    textOf(chart?.luckAnalysis?.liunianTheme) ||
    textOf(chart?.luckAnalysis?.yearTheme) ||
    textOf(chart?.luckAnalysis?.currentYearTheme) ||
    '未明确'
  );
}

function getTenGodSummary(chart) {
  const pieces = [];
  const tenGodPreference = chart?.tenGodPreference;
  const shiShen = chart?.shiShen || {};

  if (tenGodPreference && typeof tenGodPreference === 'object') {
    const favored = toList(tenGodPreference.favored || tenGodPreference.good || tenGodPreference.supportive);
    const cautious = toList(tenGodPreference.cautious || tenGodPreference.bad || tenGodPreference.risky);
    if (favored.length) pieces.push(`偏有利：${favored.join('、')}`);
    if (cautious.length) pieces.push(`需谨慎：${cautious.join('、')}`);
  }

  const visibleTenGods = [shiShen.year, shiShen.month, shiShen.day, shiShen.hour]
    .map((item) => textOf(item))
    .filter(Boolean);
  if (visibleTenGods.length) {
    pieces.push(`盘面重点：${Array.from(new Set(visibleTenGods)).join('、')}`);
  }

  return pieces.join('；') || '未提供明确十神重点';
}

function detectTopicType(userInput = '') {
  const text = textOf(userInput).toLowerCase();

  if (/(感情|关系|婚姻|对象|伴侣|沟通|冷战|分手|喜欢|暧昧)/.test(text)) {
    return 'relationship';
  }
  if (/(钱|收入|投资|破财|财运|赚钱|现金流|花钱|回报|风险)/.test(text)) {
    return 'money';
  }
  if (/(焦虑|压力|情绪|状态|失眠|崩溃|内耗|累|烦|抑郁|痛苦)/.test(text)) {
    return 'emotion';
  }
  return 'career';
}

function detectTopicFocus(userInput = '', topicType = 'career') {
  const text = textOf(userInput);
  const focusMap = {
    career: [
      ['方向', '方向判断'],
      ['扩张', '扩张判断'],
      ['工作', '工作推进'],
      ['创业', '创业推进'],
      ['选择', '选择压力'],
      ['跳槽', '去留判断'],
      ['项目', '项目取舍'],
      ['重点', '重点分散'],
    ],
    relationship: [
      ['边界', '边界问题'],
      ['沟通', '沟通失衡'],
      ['冷战', '情绪拉扯'],
      ['分手', '关系取舍'],
      ['喜欢', '投入方式'],
      ['对象', '关系判断'],
      ['伴侣', '相处失衡'],
    ],
    emotion: [
      ['焦虑', '焦虑内耗'],
      ['压力', '压力承载'],
      ['失眠', '节奏失衡'],
      ['累', '长期消耗'],
      ['崩溃', '情绪过载'],
      ['烦', '情绪堆积'],
      ['内耗', '自我消耗'],
    ],
    money: [
      ['投资', '投资判断'],
      ['收入', '收入焦虑'],
      ['破财', '风险承受'],
      ['赚钱', '收益节奏'],
      ['现金流', '资金安排'],
      ['回报', '预期管理'],
      ['花钱', '支出控制'],
    ],
  };

  const matched = (focusMap[topicType] || [])
    .filter(([keyword]) => text.includes(keyword))
    .map(([, label]) => label);

  if (matched.length) {
    return Array.from(new Set(matched)).join('、');
  }

  return text.replace(/\s+/g, ' ').slice(0, 28) || '当前问题焦点未明确';
}

function buildLLMUserPrompt(input) {
  return USER_PROMPT_TEMPLATE
    .replace('{{core_summary}}', textOf(input.core_summary, '未提供'))
    .replace('{{stage_summary}}', textOf(input.stage_summary, '未提供'))
    .replace('{{action_hints}}', toList(input.action_hints).join('；') || '未提供')
    .replace('{{emotional_hint}}', textOf(input.emotional_hint, '未提供'))
    .replace('{{strength_level}}', textOf(input.strength_level, '未明确'))
    .replace('{{primary_use_god}}', textOf(input.primary_use_god, '未明确'))
    .replace('{{dayun_theme}}', textOf(input.dayun_theme, '未明确'))
    .replace('{{liunian_theme}}', textOf(input.liunian_theme, '未明确'))
    .replace('{{ten_god_summary}}', textOf(input.ten_god_summary, '未提供明确十神重点'))
    .replace('{{topic_type}}', textOf(input.topic_type, 'career'))
    .replace('{{topic_focus}}', textOf(input.topic_focus, '当前问题焦点未明确'))
    .replace('{{user_input}}', textOf(input.user_input, '未提供'));
}

function buildPromptPayload({ chart, userInput, fallbackInput, userProfile }) {
  const narrative = getNarrative(chart);
  const rawInput = textOf(userInput) || textOf(fallbackInput) || textOf(userProfile) || '未提供';
  const topicType = detectTopicType(rawInput);
  const topicFocus = detectTopicFocus(rawInput, topicType);

  return {
    topicType,
    topicFocus,
    prompt: buildLLMUserPrompt({
      core_summary: narrative?.core_summary || chart?.coreSummary || chart?.core_summary,
      stage_summary: narrative?.stage_summary || chart?.stageSummary || chart?.stage_summary,
      action_hints: narrative?.action_hints || chart?.actionHints || chart?.action_hints,
      emotional_hint: narrative?.emotional_hint || chart?.emotionalHint || chart?.emotional_hint,
      strength_level: getStrengthLevel(chart),
      primary_use_god: getPrimaryUseGod(chart),
      dayun_theme: getDayunTheme(chart),
      liunian_theme: getLiunianTheme(chart),
      ten_god_summary: getTenGodSummary(chart),
      topic_type: topicType,
      topic_focus: topicFocus,
      user_input: rawInput,
    }),
  };
}

function buildReadingPrompt({ chart, input }) {
  const narrative = getNarrative(chart);

  return [
    '【系统已提供的结构摘要】',
    `- 核心状态：${textOf(narrative?.core_summary || chart?.coreSummary || chart?.core_summary, '未提供')}`,
    `- 当前阶段：${textOf(narrative?.stage_summary || chart?.stageSummary || chart?.stage_summary, '未提供')}`,
    `- 行动建议：${toList(narrative?.action_hints || chart?.actionHints || chart?.action_hints).join('；') || '未提供'}`,
    `- 情绪提醒：${textOf(narrative?.emotional_hint || chart?.emotionalHint || chart?.emotional_hint, '未提供')}`,
    `- 身强身弱：${getStrengthLevel(chart)}`,
    `- 第一用神：${getPrimaryUseGod(chart)}`,
    `- 当前大运主题：${getDayunTheme(chart)}`,
    `- 当前流年主题：${getLiunianTheme(chart)}`,
    `- 十神重点：${getTenGodSummary(chart)}`,
    '',
    '【前端当前请求】',
    textOf(input, '未提供'),
  ].join('\n');
}

function sanitizeAiResponse(text = '') {
  let output = textOf(text);
  AI_PHRASE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    output = output.replace(pattern, replacement);
  });
  output = output.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return output;
}

async function runChat({ userProfile, message, chart }) {
  ensureOpenAIKey();

  const promptPayload = buildPromptPayload({
    chart,
    userInput: message,
    fallbackInput: userProfile,
    userProfile,
  });

  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.78,
    max_completion_tokens: 520,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: promptPayload.prompt },
    ],
  });

  return sanitizeAiResponse(response.choices?.[0]?.message?.content || '');
}

async function runReading({ instructions, input, chart, model = DEFAULT_MODEL }) {
  ensureOpenAIKey();

  const systemInstruction = textOf(instructions)
    ? `${SYSTEM_PROMPT}\n\n【前端补充要求】\n${textOf(instructions)}`
    : SYSTEM_PROMPT;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.76,
    max_completion_tokens: 620,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: buildReadingPrompt({ chart, input }) },
    ],
  });

  return sanitizeAiResponse(response.choices?.[0]?.message?.content || '');
}

async function runTranscription({
  buffer,
  fileName = 'mingme-voice.m4a',
  mimeType = 'audio/m4a',
  language = 'zh',
  prompt,
  model = 'whisper-1',
}) {
  ensureOpenAIKey();

  if (!buffer) {
    throw new Error('audio buffer is missing');
  }

  const file = new File([buffer], fileName, { type: mimeType });
  const payload = await client.audio.transcriptions.create({
    file,
    model,
    language,
    ...(prompt ? { prompt } : {}),
  });

  return textOf(payload?.text);
}

module.exports = {
  DEFAULT_MODEL,
  SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
  detectTopicType,
  detectTopicFocus,
  buildLLMUserPrompt,
  runChat,
  runReading,
  runTranscription,
};
