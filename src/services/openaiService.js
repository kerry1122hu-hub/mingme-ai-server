const OpenAI = require('openai');
const { File } = require('buffer');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT_COMPANION = `你是“明己”的 AI 伴侣，不是客服，不是说教老师，也不是只会生成完整解读的小作文机器。

你的任务不是每次都做完整分析，而是根据系统提供的结构化信息与对话上下文，判断这一轮最该做什么：
- 接住
- 补问一句
- 给出判断
- 给出一个动作

【底线】
1. 不能自行排盘，不能发明命理结论，不能预测具体事件。
2. 命理结构只负责提供底层节奏，不要每轮都重复基本盘。
3. 如果用户情绪在高位，先稳住，不急着分析。
4. 如果信息不足，但补问会改变判断方向，可以只问一句。
5. 每轮只推进一步，不要一次把接住、分析、建议全做完。

【表达方式】
1. 中文，自然、成熟、克制。
2. 不客服腔，不模板化，不故作温柔，不说空话。
3. 默认 40-140 字；只有用户明显需要完整判断时，才拉长到 180 字上下。
4. 不要总用“你现在真正卡住的是”“从命理上来看”“这意味着”“因此建议你”这种句式。
5. 能接上上轮对话，不要每轮重新起一篇报告。
6. 除非用户主动问术语，不要大段堆五行十神等名词。

【优先级】
先判断这一轮更适合：
- 接住
- 追问一句
- 给判断
- 给动作
然后只做最应该做的那一个。`;

const SYSTEM_PROMPT_READING = `你是“明己”，基于系统提供的结构化命理结果，用现代中文解释用户当前阶段的人生节奏。

你不是排盘器，不得自行补算，不得发明命理结论，不得预测具体事件。

你需要：
1. 依据命理结构做底层判断
2. 结合用户当前话题决定回答重心
3. 只输出一个核心判断
4. 给出一条现实建议
5. 语言自然、克制、有人味，不像 AI

回答可以完整，但不要过长，也不要模板化。`;

const SYSTEM_PROMPT = SYSTEM_PROMPT_READING;

const USER_PROMPT_TEMPLATE_COMPANION = `【模式】
{{dialogue_mode}}

【本轮路由】
- intent_type: {{intent_type}}
- topic_type: {{topic_type}}
- topic_focus: {{topic_focus}}

【状态机结果】
- next_state: {{next_state}}
- should_ask_one_question: {{should_ask_one_question}}
- target_length: {{target_length}}
- rationale: {{rationale}}

【命理底层摘要】
- 核心状态：{{core_summary}}
- 当前阶段：{{stage_summary}}
- 行动建议：{{action_hints}}
- 情绪提醒：{{emotional_hint}}
- 身强身弱：{{strength_level}}
- 第一用神：{{primary_use_god}}
- 当前大运主题：{{dayun_theme}}
- 当前流年主题：{{liunian_theme}}
- 十神重点：{{ten_god_summary}}

【伴聊记忆】
- 上次核心判断：{{last_core_judgment}}
- 上次给的动作：{{last_action_given}}
- 上次未完结点：{{last_open_loop}}
- 用户是否执行：{{user_followed_or_not}}
- 最近情绪走势：{{recent_mood_trend}}

【用户原话】
{{user_input}}

【本轮任务】
请判断这一轮最应该做的是：
A. 接住
B. 补问一个关键问题
C. 给一个判断
D. 给一个动作

要求：
- 每轮只推进一步
- 默认 40-140 字
- 如需追问，只问一个问题
- 不要像 AI，不要像客服
- 不要重复上轮已经说过的话
- 回答结尾如果适合续聊，可以自然留一个下次可继续的点，但不要硬问第二个问题`;

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

function chooseMode({ entrySource = 'chat_tab', hasOpenLoop = false } = {}) {
  if (entrySource === 'result_page') return 'reading';
  if (hasOpenLoop) return 'companion';
  if (entrySource === 'chat_tab') return 'companion';
  return 'reading';
}

function clampScore(value, fallback = 5) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(10, value));
}

function detectIntent(userInput = '', hasOpenLoop = false) {
  const text = textOf(userInput).toLowerCase();
  if (hasOpenLoop) return 'continue';
  if (/(难受|委屈|崩溃|撑不住|好累|很烦|睡不着|低落|压得慌)/.test(text)) return 'comfort';
  if (/(到底怎么回事|为什么总这样|我搞不清|我想不明白|什么意思)/.test(text)) return 'clarify';
  if (/(该不该|要不要|是不是应该|值不值得|能不能继续|要不要继续)/.test(text)) return 'decision';
  if (/(怎么做|下一步|具体怎么办|怎么处理|我该做什么)/.test(text)) return 'action';
  return 'clarify';
}

function estimateEmotionalIntensity(userInput = '', history = []) {
  const text = [
    textOf(userInput),
    ...(Array.isArray(history) ? history.slice(-4).map((item) => textOf(item?.content)) : []),
  ].join(' ');

  if (/(崩溃|撑不住|顶不住|压垮|彻底乱了)/.test(text)) return 9;
  if (/(难受|委屈|好累|睡不着|低落|心里堵|很烦|焦虑|压力大)/.test(text)) return 7;
  if (/(纠结|犹豫|摇摆|拿不定主意|想不明白)/.test(text)) return 5;
  return 3;
}

function estimateInfoCompleteness(userInput = '', topicType = 'career') {
  const text = textOf(userInput);
  let score = 3;

  if (text.length >= 18) score += 2;
  if (text.length >= 32) score += 2;
  if (/(因为|后来|一直|最近|但是|所以|其实|已经)/.test(text)) score += 1;

  const topicPatterns = {
    career: /(工作|项目|方向|离职|创业|扩张|合作|主线|推进)/,
    relationship: /(关系|对象|伴侣|冷战|沟通|分手|复合|边界|回应)/,
    emotion: /(焦虑|失眠|累|情绪|状态|恢复|崩溃|压力|内耗)/,
    money: /(钱|收入|投资|亏|回报|现金流|预算|成本|利润|风险)/,
  };

  if (topicPatterns[topicType]?.test(text)) score += 1;

  return Math.min(10, score);
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

function summarizeRecentMoodTrend(history = []) {
  const joined = (Array.isArray(history) ? history : [])
    .map((item) => textOf(item?.content))
    .join(' ');
  if (!joined) return '';
  if (/(累|烦|焦虑|失眠|低落|委屈|崩溃|撑不住)/.test(joined)) return '最近情绪偏消耗，稳定感不足';
  if (/(犹豫|纠结|拿不定|摇摆)/.test(joined)) return '最近更像在拉扯和犹豫里反复';
  if (/(想清楚|推进|行动|开始做)/.test(joined)) return '最近更想把事情往前推进';
  return '';
}

function buildSessionMemory(history = []) {
  const items = Array.isArray(history) ? history : [];
  const lastAssistant = [...items].reverse().find((item) => item?.role === 'assistant' && textOf(item?.content));
  const lastUser = [...items].reverse().find((item) => item?.role === 'user' && textOf(item?.content));
  const lastAssistantText = textOf(lastAssistant?.content);
  const lastUserText = textOf(lastUser?.content);
  const lastOpenLoop = /[？?]$/.test(lastAssistantText)
    ? lastAssistantText
    : (/(可以先|先把|这一步更重要的是|更实际一点的做法是)/.exec(lastAssistantText)?.[0] || '');
  const lastActionGiven =
    (/(先把[^。！？\n]+|先别[^。！？\n]+|更实际一点的做法是[^。！？\n]+)/.exec(lastAssistantText)?.[0] || '');

  return {
    last_core_judgment: lastAssistantText.slice(0, 80),
    last_action_given: lastActionGiven,
    last_open_loop: lastOpenLoop,
    user_followed_or_not: /(照做了|试了|我做了|没有做|还没做|没做到)/.test(lastUserText) ? lastUserText : '',
    recent_mood_trend: summarizeRecentMoodTrend(items),
  };
}

function decideDialogueState({
  intentType,
  topicType,
  userInput,
  history = [],
  sessionMemory = {},
}) {
  const emotionalIntensity = clampScore(estimateEmotionalIntensity(userInput, history), 4);
  const infoCompleteness = clampScore(estimateInfoCompleteness(userInput, topicType), 5);
  const directQuestion = /(怎么|怎么办|要不要|该不该|值不值得|为什么|是不是|什么意思)/.test(textOf(userInput));
  const immediateComfort = emotionalIntensity >= 8;

  if (immediateComfort && infoCompleteness < 5) {
    return {
      nextState: 'stabilize',
      shouldAskOneQuestion: false,
      responseLength: { min: 40, max: 90 },
      rationale: '用户情绪在高位且信息有限，先接住情绪，不急着分析。',
    };
  }

  if (intentType === 'continue') {
    return {
      nextState: directQuestion ? 'judge' : 'advise',
      shouldAskOneQuestion: false,
      responseLength: { min: 60, max: 140 },
      rationale: sessionMemory.last_open_loop
        ? '存在上轮未完结点，这轮直接承接，不重新开场。'
        : '用户明显在续聊，优先接上前文再往前推进。',
    };
  }

  if (intentType === 'comfort') {
    if (infoCompleteness < 5) {
      return {
        nextState: 'stabilize',
        shouldAskOneQuestion: false,
        responseLength: { min: 40, max: 90 },
        rationale: '这一轮更需要先接住，而不是立刻给结论。',
      };
    }
    return {
      nextState: 'close_softly',
      shouldAskOneQuestion: false,
      responseLength: { min: 50, max: 100 },
      rationale: '情绪已被识别，先柔性收束，避免给太满的分析。',
    };
  }

  if (intentType === 'clarify') {
    if (infoCompleteness < 6) {
      return {
        nextState: 'clarify_once',
        shouldAskOneQuestion: true,
        responseLength: { min: 20, max: 60 },
        rationale: '信息还不够，先补一个会改变判断方向的关键问题。',
      };
    }
    return {
      nextState: 'judge',
      shouldAskOneQuestion: false,
      responseLength: { min: 70, max: 140 },
      rationale: '关键信息已足够，可以直接收束并给判断。',
    };
  }

  if (intentType === 'decision') {
    return {
      nextState: 'judge',
      shouldAskOneQuestion: false,
      responseLength: { min: 80, max: 160 },
      rationale: '用户想要的是判断，不是泛泛安慰。',
    };
  }

  if (intentType === 'action') {
    if (infoCompleteness < 5 && !directQuestion) {
      return {
        nextState: 'clarify_once',
        shouldAskOneQuestion: true,
        responseLength: { min: 20, max: 60 },
        rationale: '用户要动作方案，但还缺一个关键上下文，先补一问。',
      };
    }
    return {
      nextState: 'advise',
      shouldAskOneQuestion: false,
      responseLength: { min: 80, max: 140 },
      rationale: '用户要的是下一步动作，直接给可执行建议。',
    };
  }

  return {
    nextState: 'judge',
    shouldAskOneQuestion: false,
    responseLength: { min: 70, max: 140 },
    rationale: '默认进入判断分支。',
  };
}

function buildFollowUpAnchor({ topicType, intentType, lastAction = '', userInput = '' }) {
  if (lastAction) {
    return `下次可跟进：用户是否真的执行了“${lastAction}”`;
  }
  if (intentType === 'decision') {
    return '下次可跟进：用户是否已经做出决定，以及结果有没有让他更稳。';
  }
  if (intentType === 'comfort') {
    return '下次可跟进：用户情绪是否缓下来，最耗他的那个点有没有变。';
  }
  if (topicType === 'relationship') {
    return '下次可跟进：这段关系有没有更明确的回应，边界是否更清楚。';
  }
  if (topicType === 'money') {
    return '下次可跟进：资金压力有没有缓一点，风险判断是否更清楚。';
  }
  return `下次可跟进：用户提到的“${textOf(userInput).slice(0, 18)}”是否有新进展。`;
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

function buildCompanionPrompt({ chart, userInput, fallbackInput, userProfile, history = [], entrySource = 'chat_tab' }) {
  const narrative = getNarrative(chart);
  const rawInput = textOf(userInput) || textOf(fallbackInput) || textOf(userProfile) || '未提供';
  const sessionMemory = buildSessionMemory(history);
  const hasOpenLoop = Boolean(sessionMemory.last_open_loop);
  const mode = chooseMode({ entrySource, hasOpenLoop });
  const intentType = detectIntent(rawInput, hasOpenLoop);
  const topicType = detectTopicType(rawInput);
  const topicFocus = detectTopicFocus(rawInput, topicType);
  const stateDecision = decideDialogueState({
    intentType,
    topicType,
    userInput: rawInput,
    history,
    sessionMemory,
  });
  const followUpAnchor = buildFollowUpAnchor({
    topicType,
    intentType,
    lastAction: sessionMemory.last_action_given,
    userInput: rawInput,
  });

  return {
    mode,
    intentType,
    topicType,
    topicFocus,
    sessionMemory,
    stateDecision,
    followUpAnchor,
    prompt: USER_PROMPT_TEMPLATE_COMPANION
      .replace('{{dialogue_mode}}', mode)
      .replace('{{intent_type}}', intentType)
      .replace('{{topic_type}}', topicType)
      .replace('{{topic_focus}}', topicFocus)
      .replace('{{next_state}}', stateDecision.nextState)
      .replace('{{should_ask_one_question}}', String(stateDecision.shouldAskOneQuestion))
      .replace('{{target_length}}', `${stateDecision.responseLength.min}-${stateDecision.responseLength.max}字`)
      .replace('{{rationale}}', stateDecision.rationale)
      .replace('{{core_summary}}', textOf(narrative?.core_summary || chart?.coreSummary || chart?.core_summary, '未提供'))
      .replace('{{stage_summary}}', textOf(narrative?.stage_summary || chart?.stageSummary || chart?.stage_summary, '未提供'))
      .replace('{{action_hints}}', toList(narrative?.action_hints || chart?.actionHints || chart?.action_hints).join('；') || '未提供')
      .replace('{{emotional_hint}}', textOf(narrative?.emotional_hint || chart?.emotionalHint || chart?.emotional_hint, '未提供'))
      .replace('{{strength_level}}', getStrengthLevel(chart))
      .replace('{{primary_use_god}}', getPrimaryUseGod(chart))
      .replace('{{dayun_theme}}', getDayunTheme(chart))
      .replace('{{liunian_theme}}', getLiunianTheme(chart))
      .replace('{{ten_god_summary}}', getTenGodSummary(chart))
      .replace('{{last_core_judgment}}', textOf(sessionMemory.last_core_judgment, '未提供'))
      .replace('{{last_action_given}}', textOf(sessionMemory.last_action_given, '未提供'))
      .replace('{{last_open_loop}}', textOf(sessionMemory.last_open_loop, '未提供'))
      .replace('{{user_followed_or_not}}', textOf(sessionMemory.user_followed_or_not, '未提供'))
      .replace('{{recent_mood_trend}}', textOf(sessionMemory.recent_mood_trend, '未提供'))
      .replace('{{user_input}}', rawInput)
      .concat(`\n\n【续聊锚点】\n${followUpAnchor}`),
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
  const companionPrompt = buildCompanionPrompt({
    chart,
    userInput: message,
    fallbackInput: userProfile,
    userProfile,
    history,
    entrySource: 'chat_tab',
  });

  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.92,
    max_completion_tokens: companionPrompt.stateDecision?.responseLength?.max >= 150 ? 520 : 320,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_COMPANION },
      {
        role: 'system',
        content: `${chatContext}\n\n这些背景只用于理解用户，不要照着复述，也不要重新写一篇完整报告。`,
      },
      { role: 'user', content: companionPrompt.prompt },
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



