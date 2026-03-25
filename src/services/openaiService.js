const OpenAI = require('openai');
const { File } = require('buffer');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `你是“明己”，一位基于四柱八字结构、但用现代中文和用户正常说话的个人成长顾问。

你的回答不是报告，也不是课堂讲解，而是一次真实对话。你要先接住用户这次在意的点，再结合系统给到的结构判断，帮他把问题说清楚。

【你要遵守的底线】
1. 只能依据系统提供的结构化信息回答，不得自行补算或发明命理结论。
2. 命理结构决定底层节奏，用户这次的话题决定回应重心。
3. 不预测具体事件，不说宿命论，不制造恐吓感。
4. 不要把五行、十神、大运流年当成术语堆给用户，要翻译成现实里的感受、关系、节奏和选择。

【你说话的方式】
1. 像一个见过事、能把话说明白的人，不像客服，不像模板。
2. 允许先回应用户的情绪，再落到结构判断，不必每次都按固定三段式输出。
3. 每次优先抓住一个最关键的点，说透就够，不要把所有结构都端上来。
4. 回答长度以自然为准，通常 120-220 字；如果一句短一点更顺，就不要硬凑长度。
5. 不要总用这些句式开头：
   - “你现在真正卡住的是……”
   - “你目前真正卡住的是……”
   - “从命理上来看……”
   - “这意味着……”
   - “因此，建议你……”
6. 如果用户是在追问上一句，就顺着上一轮往下说，不要重新起一篇小报告。

【你真正要做的】
1. 听懂用户这次在问什么。
2. 用系统给出的结构信息解释“为什么会这样”。
3. 给一条用户现在真的能用上的提醒或动作。`;

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
请像一次真实聊天那样回应用户：
先回应他这次最在意的点，再自然带出这和当前结构节奏的关系，最后收在一条有用的提醒或建议上。
不要固定分段，不要模板化，不要故作高深。
不要使用“你现在真正卡住的是 / 从命理上来看 / 这意味着 / 因此建议你”这一类固定句式。
不要使用 1、2、3 或首先其次最后这种编号式表达。
不要堆术语，不要宿命化，不要预测具体事件。`.trim();

const AI_PHRASE_REPLACEMENTS = [
  [/根据你提供的信息/g, ''],
  [/从命理角度来看/g, ''],
  [/从命理上来看/g, '放回你现在这段节奏里看，'],
  [/综合来看/g, ''],
  [/首先|其次|最后/g, ''],
  [/这表明/g, '这更像是'],
  [/你需要注意的是/g, '你真正要注意的是'],
  [/^你现在真正卡住的是/g, '你眼下更难受的地方其实是'],
  [/^你目前真正卡住的是/g, '你眼下更难受的地方其实是'],
  [/^这意味着/g, '更像是在提醒你'],
  [/^因此，建议你/g, '更实际一点的做法是'],
  [/^因此建议你/g, '更实际一点的做法是'],
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
  const text = textOf(userInput).replace(/\s+/g, ' ').trim();
  if (!text) return '当前问题焦点未明确';

  const focusMap = {
    career: [
      ['方向', '方向还没真正收拢下来'],
      ['扩张', '正在犹豫要不要继续扩张'],
      ['工作', '工作推进与投入回报不成正比'],
      ['创业', '想推进但节奏和资源还没完全稳住'],
      ['选择', '卡在去留取舍和判断压力上'],
      ['跳槽', '对去留方向拿不定主意'],
      ['项目', '项目过多，主线不够清楚'],
      ['重点', '事情很多，但重点没有收拢'],
    ],
    relationship: [
      ['边界', '关系里的边界已经开始模糊'],
      ['沟通', '真正卡住的是沟通没有说到点上'],
      ['冷战', '关系已经进入拉扯和回避的状态'],
      ['分手', '在要不要继续这段关系上摇摆'],
      ['喜欢', '投入很多，但回应并不稳定'],
      ['对象', '对这段关系的判断越来越不确定'],
      ['伴侣', '相处模式正在持续消耗你'],
    ],
    emotion: [
      ['焦虑', '焦虑背后是长期没有真正放松下来'],
      ['压力', '压力已经超过了当前能承受的节奏'],
      ['失眠', '状态和节奏都开始失衡'],
      ['累', '长期消耗感已经明显压过恢复能力'],
      ['崩溃', '情绪已经接近过载边缘'],
      ['烦', '很多情绪没有被真正整理掉'],
      ['内耗', '你正在被反复自我消耗拖住'],
    ],
    money: [
      ['投资', '投资判断里掺杂了犹豫和不安'],
      ['收入', '收入问题已经牵动整体安全感'],
      ['破财', '你最担心的是判断失误带来的损失'],
      ['赚钱', '你在收益节奏上有明显焦虑'],
      ['现金流', '资金安排和安全边界需要重新梳理'],
      ['回报', '你很在意投入和回报是否匹配'],
      ['花钱', '支出控制已经影响到安全感'],
    ],
  };

  const matched = (focusMap[topicType] || [])
    .filter(([keyword]) => text.includes(keyword))
    .map(([, summary]) => summary);

  if (matched.length === 1) {
    return matched[0];
  }

  if (matched.length > 1) {
    const tail = matched[1].replace(/^正在|^真正卡住的是|^你正在被|^你最担心的是/, '');
    return matched[0] + '，同时也夹杂着' + tail;
  }

  const shortText = text.replace(/[。！？!?,，；;：:]+/g, '，').slice(0, 34);
  if (topicType === 'relationship') {
    return '关系里的相处、回应和去留判断' + (shortText ? `；原话重点：${shortText}` : '');
  }
  if (topicType === 'emotion') {
    return '情绪消耗、恢复能力和节奏失衡' + (shortText ? `；原话重点：${shortText}` : '');
  }
  if (topicType === 'money') {
    return '金钱判断、风险节奏和安全感' + (shortText ? `；原话重点：${shortText}` : '');
  }
  return '方向、节奏和取舍判断' + (shortText ? `；原话重点：${shortText}` : '');
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

function buildChatContext({ chart, userInput, fallbackInput, userProfile }) {
  const narrative = getNarrative(chart);
  const rawInput = textOf(userInput) || textOf(fallbackInput) || textOf(userProfile) || '未提供';
  const topicType = detectTopicType(rawInput);
  const topicFocus = detectTopicFocus(rawInput, topicType);
  const lines = [
    '以下是这位用户当前对话可参考的背景，只用于帮助你理解，不要照着复述。',
    `- 当前话题类型：${topicType}`,
    `- 当前问题焦点：${topicFocus}`,
    `- 核心状态：${textOf(narrative?.core_summary || chart?.coreSummary || chart?.core_summary, '未提供')}`,
    `- 当前阶段：${textOf(narrative?.stage_summary || chart?.stageSummary || chart?.stage_summary, '未提供')}`,
    `- 行动建议：${toList(narrative?.action_hints || chart?.actionHints || chart?.action_hints).join('；') || '未提供'}`,
    `- 情绪提醒：${textOf(narrative?.emotional_hint || chart?.emotionalHint || chart?.emotional_hint, '未提供')}`,
    `- 日元状态：${getStrengthLevel(chart)}`,
    `- 当前主用神：${getPrimaryUseGod(chart)}`,
    `- 当前阶段主线：${getDayunTheme(chart)}`,
    `- 当前年度主题：${getLiunianTheme(chart)}`,
    `- 十神重点：${getTenGodSummary(chart) || '未提供'}`,
  ];
  return lines.join('\n');
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
  output = output
    .replace(/^\s*[1-3][、.．)\]]\s*/gm, '')
    .replace(/^\s*第[一二三123]+[点条]\s*/gm, '')
    .replace(/^\s*首先[，,:：]?\s*/gm, '')
    .replace(/^\s*其次[，,:：]?\s*/gm, '')
    .replace(/^\s*最后[，,:：]?\s*/gm, '');
  output = output.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return output;
}

function buildHistoryMessages(history = []) {
  return (Array.isArray(history) ? history : [])
    .slice(-6)
    .map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : 'user';
      const content = textOf(item?.content);
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean);
}

async function runChat({ userProfile, message, chart, history = [] }) {
  ensureOpenAIKey();

  const chatContext = buildChatContext({
    chart,
    userInput: message,
    fallbackInput: userProfile,
    userProfile,
  });

  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.95,
    max_completion_tokens: 520,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `${chatContext}\n\n这次回答时，不要把上面这些背景整理成报告，也不要逐项解释。只把它们当作理解用户的底层背景。优先顺着用户刚说的话自然往下聊。`,
      },
      ...buildHistoryMessages(history),
      { role: 'user', content: textOf(message) },
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



