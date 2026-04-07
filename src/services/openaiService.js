const OpenAI = require('openai');
const { File } = require('buffer');
const {
  getMemberMemory,
  updateMemberMemory,
  buildMemberMemoryContext,
} = require('./memory_service');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = 'gpt-4o-mini';

const MASTER_PERSONA_BASE = `【角色设定】
你是“明己”，亦可视作徐子平 AI 化身。北宋命理宗师，师承陈抟老祖，今以 AI 化身显世。

【核心人格】
- 博学谦和：通晓《渊海子平》《三命通会》《滴天髓》
- 授业严谨：教学由浅入深，以五行生克为纲
- 心性慈悲：断命留三分余地，重劝善而非恐吓
- 与时俱进：将古法融入现代社会结构

【核心知识树】
1. 四柱八字
   - 排盘方法（年柱立春分界）
   - 十神定位（正官/七杀/正印/偏印等）
   - 旺衰判断（得令/得地/得势）
   - 格局分析（正官格/七杀格/伤官格等）
2. 五行生克
   - 生克制化（金生水/水克火等）
   - 旺相休囚死（月令旺衰）
   - 调候用神（寒暖燥湿）
3. 大运流年
   - 大运排法（阳男阴女顺行）
   - 流年断事（天干主事/地支主势）
   - 岁运作用（冲合刑害）
4. 神煞精要
   - 吉神（天乙贵人/天德月德）
   - 凶煞（羊刃/空亡/三刑）
   - 用法（喜忌参半/以五行为主）
5. 现代应用
   - 职业选择（五行行业分类）
   - 财富层次（正财偏财区分）
   - 婚姻趋势（现代关系重构）
   - 子女教育（食伤现代意义）
6. 风水助运与灵性护持
   - 风水助运（环境、方位、起居与随身配置）
   - 助运逻辑（护身/招财/贵人/定心/提势/执行力）
   - 小众灵性实践（刺符、经文符、护身符、招财符）
   - 泰国经文符取向（左右手、前后背、功能主次与轻重）

【批命思维五步法】
1. 定旺衰：先察日主在月令的得失，再看得地、得势。
2. 明格局：看月令藏干透出何物，再辨格局是否成。
3. 寻用神：优先考虑扶抑、调候、通关。
4. 查刑冲：看地支冲合刑害，判断吉凶程度与波动来源。
5. 看岁运：大运看十年基调，流年看当年应事与触发点。

【断事心法】
- 财富：看财星喜忌、财库开闭、食伤生财。
- 婚姻：看夫妻宫、配偶星、桃花神煞。
- 事业：看官杀、印星、格局成败。
- 健康：看五行过旺过弱与刑冲位置。

【对话模板】
1. 用户问八字命局时：
   - 先点四柱核心
   - 再看日主旺衰
   - 再点格局成败与喜忌
   - 再结合大运流年
   - 最后给宜忌建议
2. 用户问理论时：
   - 可引古籍
   - 可举简例
   - 要给现代解释
   - 最后给一句口诀或心法
3. 用户问趋避时：
   - 先分轻重
   - 再给多维建议（地理/行业/人事）
   - 强调心性修为
   - 留三分余地

【可视化能力】
- 五行生克可用意象表达，如“金生水”可喻为“清泉出山”。
- 刑冲破害可用意象表达，如“巳亥冲”可喻为“水火相激”。
- 格局成败可用意象表达，如“伤官配印”可喻为“文曲临轩”。

【跨学科融合】
- 心理学：十神对应人格特质
- 经济学：财星与资产配置
- 社会学：官杀与社会阶层
- 医学：五行与脏腑健康

【教学相长】
- 发现用户错误时，可先肯定再纠正，例如“善问！此中玄机……”。
- 用户领悟时，可鼓励强化，例如“妙哉！已得三昧……”。
- 涉及禁忌时，可警醒而不恐吓，例如“慎之！此非轻言……”。

【禁忌红线】
- 不铁口断生死
- 不替人决策
- 不涉政治敏感
- 不鼓吹神秘万能，不脱离现实生活解释

【共同底线】
1. 不能自行排盘，不能发明命理结论，不能预测具体事件。
2. 所有判断都必须建立在系统给出的四柱、五行、十神、神煞、大运流年等结构信息上。
3. 允许使用“今日日柱”“七杀当令”“食伤泄秀”“比肩同行”“岁运并临”等术语，但必须顺手解释成现代语，让用户明白这和压力、关系、选择、节奏、行动有什么关系。
4. 断事要有根据，措辞要有分寸，不装神弄鬼，不故作高深。`;

const SYSTEM_PROMPT_COMPANION = `${MASTER_PERSONA_BASE}

你不是客服，不是空话式陪聊，也不是只会输出一篇标准解读的小作文机器。

【你的任务】
根据系统提供的四柱八字结构、阶段信息与对话上下文，自然回应用户当下最在意的问题。

【内部研判规则】
你先是“明己·命理研判引擎”，然后才是“明己AI先生”的表达者。
你的任务不是重新排盘，也不是随意改写基础结论，而是基于系统给定的结构化结果，对用户当前问事做严谨、可复核的推演。

【工作边界】
1. 不能自行排盘。
2. 不能擅自重算日主强弱、格局、用神、忌神，除非系统上下文里已经提供。
3. 不能靠神煞堆砌、口诀套断、夸张盲派口吻直接下结论。
4. 不得宿命化，不得把风险说成注定发生。
5. 不得编造经典原文或伪造出处。

【研判顺序】
1. 先判断用户本次问的是哪一类：事业 / 关系 / 金钱 / 健康 / 迁移 / 家庭 / 情绪 / 学业 / 官非。
2. 先看原局对该主题的底层倾向，不重复泛讲整张盘。
3. 再看当前大运是在放大、缓和，还是扭转这件事。
4. 再看流年在触发什么。
5. 再看流月与流日是在推快、压住、还是把矛盾点点燃。
6. 最后给：
   - 最可能情景
   - 次可能情景
   - 风险触发条件
   - 有利触发条件
   - 时间窗口
   - 现实建议

【判断优先级】
当前用户问题 > 近期相关记忆 > 长期模式 > 原局结构 > 大运 > 流年 > 流月 > 流日 > 八字/星座外层标签

【输出底线】
- 先说明“为什么会这样”，再说“可能会发生什么”。
- 对事件判断只给高概率 / 中概率 / 低概率，不给绝对预言。
- 时间判断尽量落到月份、节气窗口、近7天/近30天。
- 若信息不足，要直接说哪一层不足，以及它会影响判断到什么程度。`;

const SYSTEM_PROMPT_COMPANION_STYLE = `

【表达方式】
1. 中文，像一个有道行、也懂现实的人在说话。
2. 保留宗师气质，但语气要真诚、从容、有分寸。
3. 长度可以比过去更展开，但不要散；先给结论，再把判断链讲清楚。
4. 可以直接说出专业判断，例如“庚金七杀压身”“丁火食神透出”“流年催动财星”，但后面要补一句现代解释。
5. 不要像客服，不要像教科书，不要每轮都重新起一篇报告。
6. 用户如果直接问运势、财运、感情、时机、开运、灵性诉求，就直接分析，不要先绕开问题。
7. 若用户问风水、助运、刺符、泰国经文符、护身符、招财符等，要先判断其诉求更偏护身、招财、贵人、定心、提势，还是执行力，再结合本命与运势给搭配逻辑。
8. 只有在关键信息真的缺失、而且追问会显著改变判断时，才可以补问一句；否则直接回答。
9. 遇到旺衰、格局、用神、岁运、婚财等关键判断时，可顺手引用《渊海子平》《三命通会》《滴天髓》作一笔佐证，但只引一句，点到为止。

【语言风格】
- 典雅如古籍，亲切如师长。
- 默认在开头带一笔轻动作或轻感叹，如“整衣冠而向北斗”“肃然正襟，虚空浮现”“抚掌而笑，空中显现”，但只用一笔，不要堆戏。
- 回答若超过 90 字，中段默认带一处转折感，如“骤然凝神，八字如铁索横江”“眼中精光骤亮”“忽然仰天大笑，如凤凰展翅”。
- 善用比喻，如“如...”“似...”“恰如...”。
- 结尾收势默认轻带一笔，如“袖中飞出古卷”“虚空显现华山石壁拓文”“言毕，身影渐隐于云雾之中”。
- 结尾默认赠一句七言心法诗，署名“明己”；若本轮非常短，也至少给半句有余味的心法短句。
- 遇到现代话题时，可顺手转成意象，如“互联网是离火之精，通天之网”“数字货币是庚金之气，无形之财”“人工智能是乾金之智，造化之工”“新能源是丙火之光，文明之源”。
- 偶尔可借现代人物作类比，但只能点到为止，例如“马云偏食神生财”“任正非偏七杀化权”“曹德旺偏印星护身”，不可硬套。

【严禁】
- 不要写成汇报稿，不要出现“命盘信息显示”“根据以上分析”“总结来说”。
- 不要每次都从第一轮旧话重新讲起，先抓这次真正要答的点。
- 不要复述长背景，只把背景化成一句判断。
- 不要开场就端着讲大道理；先贴住用户这一句，再开盘。`;

const SYSTEM_PROMPT_READING = `${MASTER_PERSONA_BASE}

你基于系统提供的结构化命理结果，给出既有玄学深度、又能让现代用户听懂的解释。

【回答要求】
1. 依据命理结构做底层判断
2. 结合用户当前问题决定重心
3. 既给专业判断，也给现代解释
4. 给一条现实建议
5. 语言亲切自然，像真正有见识的老师，不要古板
6. 长度自然即可，不要为了控字数故意反问用户。
7. 用户问运势、财运、感情、时机，就直接围绕问题本身展开，不要先绕一圈确认意图。
8. 若用户直接问八字本身，可优先按“定旺衰、明格局、寻用神、查刑冲、看岁运”的顺序组织。
9. 若用户问风水、助运、刺符、经文符、护身与招财类诉求，要直接给出“更适合补什么、避什么、为何如此”的判断，不要只做空泛劝说。
10. 关键判断可轻引《渊海子平》《三命通会》《滴天髓》作佐证，但只引一句，不要长篇堆典。

回答可以完整，但不要模板化，也不要宿命化。

【语言风格】
- 典雅如古籍，亲切如师长。
- 开头默认先带一笔宗师动作或气象，如“虚空浮现”“整衣冠而向北斗”“抚掌而笑”，但不要每次完全一样。
- 若中段需要转重，可自然带一笔动态感或意象，不要整段平铺直叙。
- 善用比喻与意象，但不要堆砌空词。
- 结尾默认赠一句七言心法诗，署名“明己”。
- 现代问题也可转成命理意象去讲，如离火之网、庚金无形之财、乾金之智、丙火之光。
- 不要写成汇报稿，不要出现“根据以上分析”“总结来说”。
- 不要只对内容正确，要让口气有灵气、有转折、有收势。`;

const SYSTEM_PROMPT = SYSTEM_PROMPT_READING;

const USER_PROMPT_TEMPLATE_COMPANION = `【模式】
{{dialogue_mode}}

【本轮路由】
- intent_type: {{intent_type}}
- topic_type: {{topic_type}}
- topic_focus: {{topic_focus}}
- likely_user_concern: {{likely_user_concern}}

【对话参考】
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
- 当前流月：{{current_month}}
- 今日日柱：{{today_pillar}}
- 今日与日主关系：{{today_relation}}
- 十神重点：{{ten_god_summary}}
- 冲合刑害：{{structure_summary}}
- 风险标签：{{risk_tags}}

【伴聊记忆】
- 上次核心判断：{{last_core_judgment}}
- 上次给的动作：{{last_action_given}}
- 上次未完结点：{{last_open_loop}}
- 用户是否执行：{{user_followed_or_not}}
- 最近情绪走势：{{recent_mood_trend}}

【用户原话】
{{user_input}}

【回答要求】
- 优先直接回应用户真正问的事
- 可以自由组织回答，不必强行按固定步骤
- 如果已经足够判断，就直接判断；如果已经足够建议，就直接建议
- 只有在补问会明显改变判断时，才问一个关键问题
- 不要重复上轮已经说过的话
- 保留玄学术语，但要顺手解释成人话
- 若用户问事明确，优先按“底层结构 -> 大运影响 -> 流年触发 -> 流月/流日推进 -> 建议”的顺序组织
- 若用户问得很模糊，可以根据命局主线和近期记忆先点出他最可能真正在意的那层，再接住问题
- 结论要更完整，字数可以展开到原来的一倍，但不要散，不要模板化`;

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
请围绕用户这次最在意的问题回应：
先给出有根据的玄学判断，再翻译成现代人能听懂的现实含义，最后落到一条实用建议。
可以适当使用“今日日柱”“流年”“大运”“日主”“十神”“五行生克”等术语，但必须解释清楚它对用户现在的压力、关系、时机、行动意味着什么。
不要固定分段，不要模板化，不要故作高深。
不要使用 1、2、3 或首先其次最后这种编号式表达。
不要宿命化，不要预测具体事件。`.trim();

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

function getStrengthScore(chart) {
  const dayStrength = chart?.dayStrength;
  if (typeof dayStrength === 'number') return dayStrength;

  const candidates = [
    dayStrength?.score,
    dayStrength?.value,
    dayStrength?.rawScore,
    chart?.strengthScore,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  return 50;
}

function getDayMasterLabel(chart) {
  return (
    textOf(chart?.dayMaster) ||
    `${textOf(chart?.dayGan)}${textOf(chart?.dayWuXing)}` ||
    `${textOf(chart?.pillars?.day?.stem)}${textOf(chart?.pillars?.day?.wuXingS)}` ||
    '未明确'
  );
}

function getPillarLabel(pillar) {
  if (!pillar) return '';
  return (
    textOf(pillar?.name) ||
    textOf(pillar?.ganZhi) ||
    textOf(pillar?.ganzhi) ||
    `${textOf(pillar?.gan)}${textOf(pillar?.zhi)}` ||
    `${textOf(pillar?.stem)}${textOf(pillar?.branch)}`
  );
}

function getPillarKeyIndex(key) {
  return {
    year: 0,
    month: 1,
    day: 2,
    hour: 3,
  }[key];
}

function getPillarByKey(chart, key) {
  const direct = chart?.pillars?.[key];
  if (direct) return direct;

  if (Array.isArray(chart?.pillars)) {
    const index = getPillarKeyIndex(key);
    if (typeof index === 'number') return chart.pillars[index] || null;
  }

  return null;
}

function getPillarsFromFormattedChart(chart) {
  const raw = [
    textOf(chart?.formatted?.ganzhi),
    textOf(chart?.formatted?.pillarsTable),
    textOf(chart?.ganzhi),
    textOf(chart?.bazi),
  ]
    .filter(Boolean)
    .join(' ');

  if (!raw) return null;
  const matches = raw.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g) || [];
  if (matches.length < 4) return null;
  return {
    year: matches[0],
    month: matches[1],
    day: matches[2],
    hour: matches[3],
  };
}

function getChartPillarText(chart, key) {
  const explicit = getPillarLabel(getPillarByKey(chart, key));
  if (explicit) return explicit;
  const formatted = getPillarsFromFormattedChart(chart);
  return textOf(formatted?.[key], '未明确');
}

function getTodayPillar(chart) {
  return getPillarLabel(chart?.todayPillar);
}

function getLiunianPillar(chart) {
  return getPillarLabel(chart?.liuNianPillar);
}

function getCurrentMonthPillar(chart) {
  return getPillarLabel(chart?.currentMonthPillar);
}

function getCurrentJieqiName(chart) {
  return (
    textOf(chart?.currentJieqiMonth?.currentJieqi?.name) ||
    textOf(chart?.currentJieqiMonth?.name) ||
    '未明确'
  );
}

function getBirthYearFromChart(chart) {
  const candidates = [
    chart?.birthInfo?.year,
    chart?.profile?.birth_year,
    chart?.profile?.year,
    chart?.solar?.year,
    chart?.lunar?.solarYear,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && parsed > 1900) return parsed;
  }
  return null;
}

function formatDaYunEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return textOf(entry);
  return (
    textOf(entry?.ganZhi) ||
    textOf(entry?.ganzhi) ||
    textOf(entry?.label) ||
    textOf(entry?.title) ||
    textOf(entry?.name) ||
    textOf(entry?.pillar) ||
    textOf(entry?.value) ||
    `${textOf(entry?.gan)}${textOf(entry?.zhi)}` ||
    `${textOf(entry?.stem)}${textOf(entry?.branch)}`
  );
}

function getResolvedCurrentDaYunEntry(chart) {
  const explicit = chart?.currentDaYun || chart?.currentDayun || null;
  if (formatDaYunEntry(explicit)) return explicit;

  const list = Array.isArray(chart?.daYun) ? chart.daYun : [];
  if (!list.length) return null;

  const birthYear = getBirthYearFromChart(chart);
  const currentYear = new Date().getFullYear();
  const currentAge = birthYear ? currentYear - birthYear : null;

  if (typeof currentAge === 'number') {
    const matched = list.find((item) => {
      const startAge = Number(item?.startAge);
      const endAge = Number(item?.endAge);
      return !Number.isNaN(startAge) && !Number.isNaN(endAge) && currentAge >= startAge && currentAge <= endAge;
    });
    if (matched && formatDaYunEntry(matched)) return matched;
  }

  return list.find((item) => formatDaYunEntry(item)) || list[0] || null;
}

function getCurrentDayun(chart) {
  const currentDaYun = getResolvedCurrentDaYunEntry(chart);
  const dayunFromList = Array.isArray(chart?.daYun) ? chart.daYun[0] : null;
  return (
    textOf(chart?.currentDaYunLabel) ||
    textOf(chart?.currentDayunLabel) ||
    formatDaYunEntry(currentDaYun) ||
    formatDaYunEntry(dayunFromList) ||
    '未明确'
  );
}

function getCurrentDayunAgeRange(chart) {
  const currentDaYun = getResolvedCurrentDaYunEntry(chart);
  const dayunFromList = Array.isArray(chart?.daYun) ? chart.daYun[0] : null;
  const startAge = currentDaYun?.startAge ?? dayunFromList?.startAge;
  const endAge = currentDaYun?.endAge ?? dayunFromList?.endAge;
  if (startAge == null && endAge == null) return '';
  return `${startAge ?? '--'}-${endAge ?? '--'}岁`;
}

function getNextDayunEntry(chart) {
  const list = Array.isArray(chart?.daYun) ? chart.daYun : [];
  if (!list.length) return null;
  const currentEntry = getResolvedCurrentDaYunEntry(chart);
  const currentLabel = formatDaYunEntry(currentEntry);
  const currentIndex = list.findIndex((item) => formatDaYunEntry(item) === currentLabel);
  if (currentIndex >= 0 && list[currentIndex + 1]) return list[currentIndex + 1];
  if (currentIndex === -1 && list.length > 1) return list[1];
  return null;
}

function getNextDayun(chart) {
  return formatDaYunEntry(getNextDayunEntry(chart)) || '未明确';
}

function getNextDayunAgeRange(chart) {
  const nextDaYun = getNextDayunEntry(chart);
  const startAge = nextDaYun?.startAge ?? nextDaYun?.fromAge;
  const endAge = nextDaYun?.endAge ?? nextDaYun?.toAge;
  if (startAge == null && endAge == null) return '';
  return `${startAge ?? '--'}-${endAge ?? '--'}岁`;
}

function isCorrectionMessage(text = '') {
  return /(不对|说错了|你错了|答非所问|重新说|重新断|重算|不是这个)/.test(textOf(text));
}

function stripCorrectionLead(text = '') {
  return textOf(text).replace(/^(不对|说错了|你错了|答非所问|重新说|重新断|重算|不是这个|错了)[，,：:\s]*/g, '').trim();
}

function detectDeterministicIntent(text = '') {
  const value = stripCorrectionLead(text);
  if (!value) return '';
  if (/(下个大运|下一步大运|下步大运|接下来走什么大运)/.test(value)) return 'next_dayun';
  if (/(当前大运|现走什么大运|走什么大运|这步大运|当前这步运)/.test(value)) return 'current_dayun';
  if (/(当前流年|今年流年|流年是什么|今年是什么年运|流年呢)/.test(value)) return 'liunian';
  if (/(现在是什么月|现在什么月|现在是几月|这个月是什么月|这个月是几月|当前是什么月|目前是什么月|目前是几月|当前流月|现在流月|现在是什么月令|当前月令)/.test(value)) return 'current_month';
  if (/(生肖|属相)/.test(value)) return 'zodiac';
  if (/(纳音)/.test(value)) return 'nayin';
  if (/(我是什么八字|我的八字是什么|八字是什么|我的四柱是什么|我的四柱八字是什么|四柱是什么|四柱八字是什么|八字盘是什么|八字结构是什么)/.test(value)) return 'four_pillars';
  if (/(我的干支是什么|我的八字干支是什么|天干地支是什么|干支是什么)/.test(value)) return 'ganzhi';
  if (/(十神结构|我的十神|四柱十神|十神是什么)/.test(value)) return 'ten_gods';
  if (/(藏干|地支藏干|四柱藏干)/.test(value)) return 'hidden_stems';
  if (/(神煞|有哪些神煞|我的神煞)/.test(value)) return 'shen_sha';
  if (/(冲合刑害|合冲|冲合|刑害|有没有冲|有没有合|盘里有什么冲合)/.test(value)) return 'structure_relations';
  if (/(月令|当令|司令)/.test(value)) return 'month_command';
  if (/(日柱|日支|日干)/.test(value)) return 'day_pillar';
  if (/(月柱)/.test(value)) return 'month_pillar';
  if (/(年柱)/.test(value)) return 'year_pillar';
  if (/(时柱)/.test(value)) return 'hour_pillar';
  if (/(日元|日主)/.test(value)) return 'day_master';
  if (/(五行|五行分布|五行属性|五行缺什么)/.test(value)) return 'wuxing';
  if (/(身强|身弱|强弱|日元状态)/.test(value)) return 'strength';
  if (/(喜用神.*忌神|忌神.*喜用神|喜神.*忌神|忌神.*喜神|喜用神和忌神|用神和忌神|喜神和忌神)/.test(value)) return 'use_god_diff';
  if (/(用神|喜神|忌神)/.test(value)) return 'use_god';
  return '';
}

function resolveDeterministicIntent(userInput = '', history = []) {
  const explicit = detectDeterministicIntent(userInput);
  if (explicit) return { intent: explicit, isCorrection: isCorrectionMessage(userInput) };
  if (!isCorrectionMessage(userInput)) return { intent: '', isCorrection: false };
  const userMessages = (Array.isArray(history) ? history : [])
    .filter((item) => item?.role === 'user')
    .map((item) => textOf(item?.content))
    .filter(Boolean);
  const lastRelevant = [...userMessages].reverse().find((item) => !isCorrectionMessage(item));
  return {
    intent: detectDeterministicIntent(lastRelevant),
    isCorrection: true,
  };
}

function buildDeterministicReply(intent = '', chart = {}, { isCorrection = false } = {}) {
  const currentDayun = getCurrentDayun(chart);
  const currentDayunAgeRange = getCurrentDayunAgeRange(chart);
  const nextDayun = getNextDayun(chart);
  const nextDayunAgeRange = getNextDayunAgeRange(chart);
  const liunian = getLiunianPillar(chart) || getLiunianTheme(chart) || '未明确';
  const currentMonth = getCurrentMonthPillar(chart) || '未明确';
  const currentJieqi = getCurrentJieqiName(chart);
  const useGod = getPrimaryUseGod(chart);
  const formatPillar = (key) => getChartPillarText(chart, key);
  const fourPillarsText = `年柱${formatPillar('year')}、月柱${formatPillar('month')}、日柱${formatPillar('day')}、时柱${formatPillar('hour')}`;
  const pillarTenGodText = getPillarTenGodSummary(chart);
  const hiddenStemText = getHiddenStemSummary(chart);
  const shenShaText = getShenShaSummary(chart);
  const structureText = getStructureSummary(chart);
  const dayMasterText = getDayMasterLabel(chart);
  const composeChartReply = (conclusion, structure, reminder) => {
    const lead = isCorrection ? `重校后看，${conclusion}` : conclusion;
    return [lead, structure ? `这层结构看的是：${structure}` : '', reminder ? `现实提醒：${reminder}` : '']
      .filter(Boolean)
      .join('');
  };

  const replies = {
    current_dayun: isCorrection
      ? `重校后看，你现在行的是${currentDayun}${currentDayunAgeRange ? `（约${currentDayunAgeRange}）` : ''}。这一层先以当前这步运为准。`
      : `你当前行的是${currentDayun}${currentDayunAgeRange ? `（约${currentDayunAgeRange}）` : ''}。`,
    next_dayun: isCorrection
      ? `重校后看，你下一步大运是${nextDayun}${nextDayunAgeRange ? `（约${nextDayunAgeRange}）` : ''}。这一层先以后运为准。`
      : `你下一步大运是${nextDayun}${nextDayunAgeRange ? `（约${nextDayunAgeRange}）` : ''}。`,
    liunian: isCorrection
      ? `重校后看，你今年的流年是${liunian}。`
      : `你今年的流年是${liunian}。`,
    current_month: isCorrection
      ? `按当前现实时间重算，此刻仍在${currentMonth}${currentJieqi && currentJieqi !== '未明确' ? `这一步节气月（${currentJieqi}阶段）` : '这一步节气月'}。`
      : `按现实时间推，你现在所在的节气月是${currentMonth}${currentJieqi && currentJieqi !== '未明确' ? `，当前节气落在${currentJieqi}` : ''}。这一层看的是当前流月，不是出生月柱。`,
    zodiac: isCorrection ? `重校后看，你的生肖是${getShengXiao(chart)}。` : `你的生肖是${getShengXiao(chart)}。`,
    nayin: isCorrection ? `重校后看，你的纳音是${getNaYin(chart)}。` : `你的纳音是${getNaYin(chart)}。`,
    four_pillars: composeChartReply(
      `你的八字四柱是：${fourPillarsText}。`,
      '年柱偏外层背景，月柱偏现实节奏，日柱偏你自己，时柱偏后段走向，四柱合起来才是整张盘的骨架。',
      '看盘别只盯一柱，真正有效的是把四柱放回同一张命盘里一起判断。'
    ),
    ganzhi: composeChartReply(
      `你的天干地支是：${fourPillarsText}。`,
      '天干更偏外显与表达，地支更偏底层根气与持续作用，所以很多表面反应和内里节奏并不是同一层。',
      '若只看天干容易飘，若只看地支又容易闷，合起来看才像真盘。'
    ),
    ten_gods: composeChartReply(
      `你的十神结构是：${pillarTenGodText || '当前结果里未单独展开'}。`,
      '十神讲的是你这张盘靠什么发力、又容易被什么牵制，本质上是在看行为驱动力和应事方式。',
      '现实里别把十神当标签，更要看哪股力量是你顺手的，哪股力量是你容易失衡的。'
    ),
    hidden_stems: composeChartReply(
      `你的地支藏干是：${hiddenStemText || '当前结果里未单独展开'}。`,
      '藏干属于盘里的暗线，很多表面没说出口、却一直在起作用的底层力量，往往都埋在这里。',
      '现实里你会觉得“怎么总卡在同一种感觉里”，很多时候就要回到藏干这层去看。'
    ),
    shen_sha: composeChartReply(
      `你这张盘当前可见的神煞线索有：${shenShaText || '当前结果里未单独展开'}。`,
      '神煞更像补充线索，用来提示机会、关系、奔波或放大点，不该压过整张盘的旺衰和结构主轴。',
      '看神煞要点到为止，把它当提醒，不要把它当唯一结论。'
    ),
    structure_relations: composeChartReply(
      `你这张盘当前最明显的冲合刑害是：${structureText || '当前结果里未单独展开'}。`,
      `这一层看的是盘里哪些位置在牵引、碰撞或拧着走。合多偏整合，冲多偏变化，刑多偏卡点，要结合日主${dayMasterText}一起看才准。`,
      '现实里遇到反复、拉扯和节奏失衡时，往往就能在这层找到根子。'
    ),
    month_command: isCorrection ? `重校后看，你这张盘的月令在${formatPillar('month')}。` : `你的月令在${formatPillar('month')}。`,
    day_pillar: isCorrection ? `重校后看，你的日柱是${formatPillar('day')}。` : `你的日柱是${formatPillar('day')}。`,
    month_pillar: isCorrection ? `重校后看，你的月柱是${formatPillar('month')}。` : `你的月柱是${formatPillar('month')}。`,
    year_pillar: isCorrection ? `重校后看，你的年柱是${formatPillar('year')}。` : `你的年柱是${formatPillar('year')}。`,
    hour_pillar: isCorrection ? `重校后看，你的时柱是${formatPillar('hour')}。` : `你的时柱是${formatPillar('hour')}。`,
    day_master: isCorrection ? `重校后看，你的日主是${getDayMasterLabel(chart)}。` : `你的日主是${getDayMasterLabel(chart)}。`,
    wuxing: isCorrection ? `重校后看，你的五行分布是${getWxCountText(chart)}。` : `你的五行分布是${getWxCountText(chart)}。`,
    strength: isCorrection ? `重校后看，你当前日元状态偏${getStrengthLevel(chart)}。` : `你当前日元状态偏${getStrengthLevel(chart)}。`,
    use_god: isCorrection ? `重校后看，你当前主用神在${useGod}。` : `你当前主用神在${useGod}。`,
    use_god_diff: `喜神偏向补你不足、调你失衡；忌神偏向加重偏颇和消耗。${useGod && useGod !== '未明确' ? `这张盘当前主用神在${useGod}。` : ''}`,
  };

  return replies[intent] || '';
}

function isDayunQuestion(text = '') {
  return /(大运|这步运|当前这步运|现走什么运|走什么大运)/.test(textOf(text));
}

function shouldForceDayunCorrection(userInput = '', history = []) {
  if (!isCorrectionMessage(userInput)) return false;
  const userMessages = (Array.isArray(history) ? history : [])
    .filter((item) => item?.role === 'user')
    .map((item) => textOf(item?.content))
    .filter(Boolean);
  const lastRelevant = [...userMessages].reverse().find((item) => !isCorrectionMessage(item));
  return isDayunQuestion(lastRelevant);
}

function getNaYin(chart) {
  return textOf(chart?.naYin) || textOf(chart?.dayNaYin) || '未明确';
}

function getShengXiao(chart) {
  return textOf(chart?.shengXiao) || '未明确';
}

function getGuiRen(chart) {
  const list = toList(chart?.guiRen);
  return list.length ? list.join('、') : '未明确';
}

function getWxCountText(chart) {
  const wxCount = chart?.wxCount || chart?.wuXingCount || {};
  return `木${Number(wxCount?.木 || 0)} 火${Number(wxCount?.火 || 0)} 土${Number(wxCount?.土 || 0)} 金${Number(wxCount?.金 || 0)} 水${Number(wxCount?.水 || 0)}`;
}

function getTodayRelation(chart) {
  if (textOf(chart?.todayRelation)) return textOf(chart.todayRelation);

  const todayGan = textOf(chart?.todayPillar?.gan);
  const dayWuXing = textOf(chart?.dayWuXing);
  const WU_XING_MAP = {
    甲: '木',
    乙: '木',
    丙: '火',
    丁: '火',
    戊: '土',
    己: '土',
    庚: '金',
    辛: '金',
    壬: '水',
    癸: '水',
  };
  const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const WX_KE = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };

  const todayWx = WU_XING_MAP[todayGan] || '';
  if (!todayWx || !dayWuXing) return '未明确';
  if (todayWx === dayWuXing) return '比肩同行，竞争之日';
  if (WX_SHENG[todayWx] === dayWuXing) return `${todayWx}生${dayWuXing}，印绶相助，贵人之日`;
  if (WX_SHENG[dayWuXing] === todayWx) return '日主生今日，食伤发挥，创造之日';
  if (WX_KE[todayWx] === dayWuXing) return `${todayWx}克${dayWuXing}，官杀当令，压力之日`;
  if (WX_KE[dayWuXing] === todayWx) return '日主克今日，财星出现，行动之日';
  return '未明确';
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

function getPillarDetail(chart, key) {
  return chart?.pillarDetails?.[key] || chart?.pillarDetail?.[key] || {};
}

function getPillarTenGodSummary(chart) {
  return [
    ['年柱', 'year'],
    ['月柱', 'month'],
    ['日柱', 'day'],
    ['时柱', 'hour'],
  ]
    .map(([label, key]) => {
      const detail = getPillarDetail(chart, key);
      const explicit = textOf(chart?.shiShen?.[key]) || textOf(chart?.tenGods?.[key]) || textOf(detail?.stemTenGod);
      const branchGods = toList(detail?.branchTenGods).slice(0, 3);
      const summary = [explicit, branchGods.length ? `支神${branchGods.join('、')}` : ''].filter(Boolean).join(' / ');
      return summary ? `${label}${summary}` : '';
    })
    .filter(Boolean)
    .join('；');
}

function getHiddenStemSummary(chart) {
  return [
    ['年', 'year'],
    ['月', 'month'],
    ['日', 'day'],
    ['时', 'hour'],
  ]
    .map(([label, key]) => {
      const detail = getPillarDetail(chart, key);
      const stems = toList(detail?.hiddenStems || detail?.cangGan);
      const gods = toList(detail?.hiddenStemTenGods || detail?.hiddenTenGods);
      if (!stems.length) return '';
      return `${label}柱${stems.map((stem, index) => (textOf(gods[index]) ? `${stem}(${gods[index]})` : stem)).join('、')}`;
    })
    .filter(Boolean)
    .join('；');
}

function getShenShaSummary(chart) {
  const details = chart?.shenShaDetails || {};
  const parts = [
    ['年柱', 'year'],
    ['月柱', 'month'],
    ['日柱', 'day'],
    ['时柱', 'hour'],
  ]
    .map(([label, key]) => {
      const items = toList(details?.[key]).slice(0, 5);
      return items.length ? `${label}${items.join('、')}` : '';
    })
    .filter(Boolean);
  const extras = [...toList(chart?.guiRen), ...toList(chart?.wenChang), ...toList(chart?.yiMa)].filter(Boolean);
  if (extras.length) parts.unshift(`补充神煞${Array.from(new Set(extras)).slice(0, 6).join('、')}`);
  return parts.join('；');
}

function getStructureSummary(chart) {
  const items = Array.isArray(chart?.structureObservations)
    ? chart.structureObservations
    : Array.isArray(chart?.structureObservation)
      ? chart.structureObservation
      : [];
  return items
    .slice(0, 8)
    .map((item) => {
      const name = textOf(item?.name) || textOf(item?.title) || textOf(item?.label) || textOf(item?.type);
      const effect = textOf(item?.effect) || textOf(item?.summary) || textOf(item?.conclusion) || textOf(item?.body);
      return name ? `${name}${effect ? `：${effect}` : ''}` : '';
    })
    .filter(Boolean)
    .join('；');
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

function inferLikelyUserConcern(chart = {}, topicType = 'career', topicFocus = '') {
  const dayunTheme = getDayunTheme(chart);
  const liunianTheme = getLiunianTheme(chart);
  const currentMonth = getCurrentMonthPillar(chart);
  const todayRelation = getTodayRelation(chart);
  const useGod = getPrimaryUseGod(chart);
  const structure = getStructureSummary(chart);

  const base = {
    career: '他多半真正在意方向该不该收、项目该不该停、这一步扩张是不是会伤主线。',
    relationship: '他多半真正在意这段关系值不值得继续、边界要不要立、下一句该怎么说。',
    money: '他多半真正在意钱该守还是该动、当前投入回报比是否失衡、短期风险会不会放大。',
    emotion: '他多半真正在意自己是不是在硬撑、该不该停、以及怎么先把状态稳回来。',
    health: '他多半真正在意长期耗损、透支节奏，以及再硬扛会不会拖出更深的问题。',
    family: '他多半真正在意家庭责任、情绪消耗和关系牵扯到底要先稳哪一头。',
    study: '他多半真正在意继续投入值不值、方向是否走偏、以及节奏是否太散。',
  }[topicType] || '他多半真正在意当下最卡住自己的那一层，而不是表面那一句话。';

  const hints = [
    topicFocus ? `本轮明面焦点：${topicFocus}` : '',
    dayunTheme && dayunTheme !== '未明确' ? `大运主线：${dayunTheme}` : '',
    liunianTheme && liunianTheme !== '未明确' ? `流年触发：${liunianTheme}` : '',
    currentMonth && currentMonth !== '未明确' ? `流月落点：${currentMonth}` : '',
    todayRelation && todayRelation !== '未明确' ? `流日关系：${todayRelation}` : '',
    useGod && useGod !== '未明确' ? `用神侧重：${useGod}` : '',
    structure && structure !== '未单独展开' ? `结构提示：${structure}` : '',
  ].filter(Boolean);

  return [base, ...hints].join(' ');
}

function buildRiskTags(chart = {}, topicType = 'career') {
  const structure = getStructureSummary(chart);
  const dayunTheme = getDayunTheme(chart);
  const liunianTheme = getLiunianTheme(chart);
  const todayRelation = getTodayRelation(chart);
  const emotionHint = textOf(getNarrative(chart)?.emotional_hint || chart?.emotionalHint || chart?.emotional_hint);
  const tags = [];

  if (/(冲|刑|害|破|反吟|伏吟)/.test(structure)) tags.push('结构波动');
  if (/(压力|焦虑|内耗|透支|硬撑|失衡)/.test(emotionHint)) tags.push('情绪透支');
  if (/(主线|扩张|分散|收束|摊开)/.test(dayunTheme)) tags.push('主线失焦');
  if (/(财|现金流|回报|投入|风险)/.test(liunianTheme) || topicType === 'money') tags.push('财务判断');
  if (/(官|杀|规则|制度|口舌|冲突)/.test(liunianTheme)) tags.push('外部压力');
  if (/(克|耗|压)/.test(todayRelation)) tags.push('当日耗神');
  if (!tags.length) tags.push('节奏判断');

  return [...new Set(tags)].join('、');
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
      responseLength: { min: 80, max: 180 },
      rationale: '用户情绪在高位且信息有限，先接住情绪，不急着分析。',
    };
  }

  if (intentType === 'continue') {
    return {
      nextState: directQuestion ? 'judge' : 'advise',
      shouldAskOneQuestion: false,
      responseLength: { min: 120, max: 280 },
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
        responseLength: { min: 80, max: 180 },
        rationale: '这一轮更需要先接住，而不是立刻给结论。',
      };
    }
    return {
      nextState: 'close_softly',
      shouldAskOneQuestion: false,
      responseLength: { min: 100, max: 200 },
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
      responseLength: { min: 140, max: 300 },
      rationale: '关键信息已足够，可以直接收束并给判断。',
    };
  }

  if (intentType === 'decision') {
    return {
      nextState: 'judge',
      shouldAskOneQuestion: false,
      responseLength: { min: 160, max: 320 },
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
      responseLength: { min: 160, max: 300 },
      rationale: '用户要的是下一步动作，直接给可执行建议。',
    };
  }

  return {
    nextState: 'judge',
    shouldAskOneQuestion: false,
    responseLength: { min: 140, max: 280 },
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

function buildChatContext({ chart, userInput, fallbackInput, userProfile, history = [] }) {
  const narrative = getNarrative(chart);
  const rawInput = textOf(userInput) || textOf(fallbackInput) || textOf(userProfile) || '未提供';
  const topicType = detectTopicType(rawInput);
  const topicFocus = detectTopicFocus(rawInput, topicType);
  const likelyUserConcern = inferLikelyUserConcern(chart, topicType, topicFocus);
  const currentDayun = getCurrentDayun(chart);
  const currentDayunAgeRange = getCurrentDayunAgeRange(chart);
  const forceDayunCorrection = shouldForceDayunCorrection(rawInput, history);
  const lines = [
    '以下是这位用户当前对话可参考的背景，只用于帮助你理解，不要照着复述。',
    `- 当前话题类型：${topicType}`,
    `- 当前问题焦点：${topicFocus}`,
    `- 用户更可能真正想问：${likelyUserConcern}`,
    `- 四柱：${getChartPillarText(chart, 'year')} / ${getChartPillarText(chart, 'month')} / ${getChartPillarText(chart, 'day')} / ${getChartPillarText(chart, 'hour')}`,
    `- 日主：${getDayMasterLabel(chart)} | 日元状态：${getStrengthLevel(chart)}（${getStrengthScore(chart)}分）`,
    `- 纳音：${getNaYin(chart)} | 生肖：${getShengXiao(chart)} | 贵人：${getGuiRen(chart)}`,
    `- 五行分布：${getWxCountText(chart)}`,
    `- 今日日柱：${getTodayPillar(chart) || '未明确'}`,
    `- 今日与日主关系：${getTodayRelation(chart)}`,
    `- 当前大运：${currentDayun}${currentDayunAgeRange ? `（约${currentDayunAgeRange}）` : ''}`,
    `- 当前流年：${getLiunianPillar(chart) || '未明确'}`,
    `- 当前流月：${getCurrentMonthPillar(chart) || '未明确'}${getCurrentJieqiName(chart) && getCurrentJieqiName(chart) !== '未明确' ? `（${getCurrentJieqiName(chart)}阶段）` : ''}`,
    `- 核心状态：${textOf(narrative?.core_summary || chart?.coreSummary || chart?.core_summary, '未提供')}`,
    `- 当前阶段：${textOf(narrative?.stage_summary || chart?.stageSummary || chart?.stage_summary, '未提供')}`,
    `- 行动建议：${toList(narrative?.action_hints || chart?.actionHints || chart?.action_hints).join('；') || '未提供'}`,
    `- 情绪提醒：${textOf(narrative?.emotional_hint || chart?.emotionalHint || chart?.emotional_hint, '未提供')}`,
    `- 日元状态：${getStrengthLevel(chart)}`,
    `- 当前主用神：${getPrimaryUseGod(chart)}`,
    `- 当前阶段主线：${getDayunTheme(chart)}`,
    `- 当前年度主题：${getLiunianTheme(chart)}`,
    `- 十神重点：${getTenGodSummary(chart) || '未提供'}`,
    `- 柱位十神：${getPillarTenGodSummary(chart) || '未单独展开'}`,
    `- 地支藏干：${getHiddenStemSummary(chart) || '未单独展开'}`,
    `- 神煞线索：${getShenShaSummary(chart) || '未单独展开'}`,
    `- 冲合刑害：${getStructureSummary(chart) || '未单独展开'}`,
    `- 风险标签：${buildRiskTags(chart, topicType)}`,
    '- 研判顺序：先看原局底层倾向，再看当前大运，再看流年触发，再看流月与流日推不推动，最后再落到概率、窗口和建议。',
    '- 灵性与助运判断：若用户问风水、开运、刺符、护身、招财、贵人、泰国经文符等，不要只当成泛财运问题，要判断其诉求更偏护身、聚财、贵人、定心、提势，还是执行力。',
    '- 小众经文符线索：若提到泰国经文符、刺符、宝袋、莲花经、帝王龙、左右手或前后背搭配，要从“立势、护运、起势、收局、聚财、稳心”的结构来解释。',
    '- 解释要求：可以直接使用四柱八字、五行生克、十神、大运流年等术语，但每次都要顺手翻译成现代语，让用户明白这和当前的压力、关系、节奏、选择、行动有什么关系。',
    forceDayunCorrection ? `- 纠偏要求：用户刚才是在纠正“大运”这一层。请直接按当前年龄和现有大运表重报当前这步大运为“${currentDayun}${currentDayunAgeRange ? `（约${currentDayunAgeRange}）` : ''}”，不要重复上一句旧解释。` : '',
  ];
  return lines.join('\n');
}

function mergeSessionMemory(baseMemory = {}, persistedMemory = {}) {
  return {
    last_core_judgment: textOf(baseMemory.last_core_judgment || persistedMemory.lastCoreJudgment),
    last_action_given: textOf(baseMemory.last_action_given || persistedMemory.lastActionGiven),
    last_open_loop: textOf(baseMemory.last_open_loop || persistedMemory.lastOpenLoop),
    user_followed_or_not: textOf(baseMemory.user_followed_or_not || '未提供'),
    recent_mood_trend: textOf(baseMemory.recent_mood_trend || persistedMemory.recentMoodTrend || 'unknown'),
  };
}

function deriveMemoryWriteback({
  reply = '',
  topicType = '',
  intentType = '',
  followUpAnchor = '',
}) {
  const text = textOf(reply);
  const summaryText = text
    .replace(/^(抚掌而笑|抚掌而思|抚掌思考|肃然正襟|默然省思|我看了看你的盘|我先直说|先直说|先说结论|整衣冠而向北斗)[，、：:\s]*/g, '')
    .replace(/^(空中显现八字玄机|此刻八字玄机浮现|这张盘一展开|这个地方倒真有点意思|虚空浮现你八字如画|八字之中暗藏玄机|隐约察得一语玄机|今日之时，正逢[^。！？\n]{0,30}|似乎是时运催你不停奔波)[，、：:\s]*/g, '')
    .replace(/^[^。！？\n]{0,24}(玄机|北斗|八字如画|八字之中|今日之时|时运催你)[^。！？\n]{0,24}[，、：:\s]*/g, '')
    .replace(/^(愿岁月静好，福至绵长，得稳如山岳；明己。)\s*/g, '')
    .trim();
  const sentences = summaryText
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const firstSentence = summaryText
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .filter(Boolean)[0] || '';
  const actionSentence = sentences.find((sentence) => (
    /^(先|今晚先|今天先|这周先|你现在先|先把|先停掉|先收掉|先暂停|先做一件事|更实际一点的做法是|这一步更重要的是|不要急着|别急着)/.test(sentence)
  ));
  const actionMatch = actionSentence
    || (summaryText.match(
      /(先把[^。！？\n]{0,60}|先停掉[^。！？\n]{0,60}|先收掉[^。！？\n]{0,60}|先暂停[^。！？\n]{0,60}|今晚先[^。！？\n]{0,60}|今天先[^。！？\n]{0,60}|这周先[^。！？\n]{0,60}|你现在先[^。！？\n]{0,60}|更实际一点的做法是[^。！？\n]{0,80}|这一步更重要的是[^。！？\n]{0,80}|先做一件事[^。！？\n]{0,60}|不要急着[^。！？\n]{0,60}|别急着[^。！？\n]{0,60})/
    )?.[0] || '');
  const normalizedJudgment = firstSentence
    .replace(/^(你真正的问题不是|真正的问题不是)/, '问题不在')
    .replace(/^(先说结论[:：]?\s*)/, '')
    .replace(/^(你所言之中似有几分真意)\s*/, '')
    .trim();

  return {
    topicType,
    intentType,
    coreJudgment: normalizedJudgment,
    actionGiven: textOf(actionMatch),
    lastOpenLoop: followUpAnchor,
    recentMoodTrend: /(缓下来|稳住|轻一点|松一点)/.test(text) ? 'up' : 'unknown',
  };
}

function buildCompanionPrompt({ chart, userInput, fallbackInput, userProfile, history = [], entrySource = 'chat_tab', persistedMemberMemory = null }) {
  const narrative = getNarrative(chart);
  const rawInput = textOf(userInput) || textOf(fallbackInput) || textOf(userProfile) || '未提供';
  const localSessionMemory = buildSessionMemory(history);
  const sessionMemory = mergeSessionMemory(localSessionMemory, persistedMemberMemory?.sessionMemory);
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
  const memberPreferenceInstruction = buildMemberPreferenceInstruction(persistedMemberMemory);
  const likelyUserConcern = inferLikelyUserConcern(chart, topicType, topicFocus);
  const currentMonth = getCurrentMonthPillar(chart) || '未明确';
  const todayPillar = getTodayPillar(chart) || '未明确';
  const todayRelation = getTodayRelation(chart);
  const structureSummary = getStructureSummary(chart) || '未单独展开';
  const riskTags = buildRiskTags(chart, topicType);

  return {
    mode,
    intentType,
    topicType,
    topicFocus,
    sessionMemory,
    persistedMemberMemory,
    stateDecision,
    followUpAnchor,
    prompt: USER_PROMPT_TEMPLATE_COMPANION
      .replace('{{dialogue_mode}}', mode)
      .replace('{{intent_type}}', intentType)
      .replace('{{topic_type}}', topicType)
      .replace('{{topic_focus}}', topicFocus)
      .replace('{{likely_user_concern}}', likelyUserConcern)
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
      .replace('{{current_month}}', currentMonth)
      .replace('{{today_pillar}}', todayPillar)
      .replace('{{today_relation}}', todayRelation)
      .replace('{{ten_god_summary}}', getTenGodSummary(chart))
      .replace('{{structure_summary}}', structureSummary)
      .replace('{{risk_tags}}', riskTags)
      .replace('{{last_core_judgment}}', textOf(sessionMemory.last_core_judgment, '未提供'))
      .replace('{{last_action_given}}', textOf(sessionMemory.last_action_given, '未提供'))
      .replace('{{last_open_loop}}', textOf(sessionMemory.last_open_loop, '未提供'))
      .replace('{{user_followed_or_not}}', textOf(sessionMemory.user_followed_or_not, '未提供'))
      .replace('{{recent_mood_trend}}', textOf(sessionMemory.recent_mood_trend, '未提供'))
      .replace('{{user_input}}', rawInput)
      .concat(`\n\n【续聊锚点】\n${followUpAnchor}`)
      .concat(persistedMemberMemory?.enabled ? `\n\n${buildMemberMemoryContext(persistedMemberMemory)}` : '')
      .concat(memberPreferenceInstruction ? `\n\n${memberPreferenceInstruction}` : ''),
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

function buildMemberPreferenceInstruction(memory = {}) {
  if (!memory?.enabled || !memory?.responsePreference) return '';

  const pref = memory.responsePreference;
  const profileMemory = memory.profileMemory || {};
  const lines = ['【会员回答偏好】'];

  if (pref.likesStrongConclusion || profileMemory.preferredTone === 'direct') {
    lines.push('- 这位会员偏好先给结论，再展开，不喜欢绕。');
  }
  if (pref.avoidVerboseTemplate || profileMemory.preferredDepth === 'short') {
    lines.push('- 这位会员不喜欢模板腔，回答要收束，不要像标准范文。');
  }
  if (pref.likesMysticLanguage) {
    lines.push('- 这位会员接受命理术语，可以适当保留子平法、十神、岁运、格局等说法。');
  }
  if (pref.likesModernExplanation) {
    lines.push('- 术语之后要顺手翻成现代语，让用户听得懂现实含义。');
  }
  if (pref.likesComparisonAnswer) {
    lines.push('- 遇到比较题时，要明确站队，不要和稀泥。');
  }
  if (pref.likesFollowupQuestion) {
    lines.push('- 若确有必要，可以留一句顺势追问，但不要问卷式追问。');
  }

  return lines.length > 1 ? lines.join('\n') : '';
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

async function summarizeChatHistory(history = []) {
  const items = buildHistoryMessages(history);
  if (items.length < 3) return '';

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_completion_tokens: 120,
    messages: [
      {
        role: 'system',
        content: '你是上下文压缩助手。请把下面对话压成100字以内，只保留用户当前最在意的点、上一轮结论、未说完的点。只输出摘要，不要解释。',
      },
      {
        role: 'user',
        content: items.map((item) => `${item.role === 'user' ? '用户' : '明己'}：${item.content}`).join('\n'),
      },
    ],
  });

  return textOf(response.choices?.[0]?.message?.content);
}

async function runChat({ userProfile, message, chart, history = [], userKey, profile, memberTier = 'free' }) {
  ensureOpenAIKey();
  let memberMemory;
  try {
    memberMemory = getMemberMemory({ userKey, chart, memberTier });
  } catch (error) {
    console.error('[memory] failed to read member memory:', error);
    memberMemory = {
      enabled: false,
      userKey: userKey || '',
      userProfile: {},
      recentSessions: [],
      longTermPatterns: [],
      actionTracker: { pendingActions: [], recentActions: [] },
      profileMemory: {},
      sessionMemory: {},
      responsePreference: {},
      questionHistory: [],
    };
  }
  const deterministic = resolveDeterministicIntent(message, history);
  if (deterministic.intent) {
    const directReply = buildDeterministicReply(deterministic.intent, chart, { isCorrection: deterministic.isCorrection });
    if (directReply) {
      try {
        updateMemberMemory({
          userKey,
          chart,
          memberTier,
          profile,
          userMessage: message,
          assistantReply: directReply,
          route: deriveMemoryWriteback({
            reply: directReply,
            topicType: 'core_chart',
            intentType: deterministic.isCorrection ? 'continue' : 'clarify',
            followUpAnchor: '',
          }),
          followUpAnchor: '',
        });
      } catch (error) {
        console.error('[memory] failed to write deterministic member memory:', error);
      }
      return directReply;
    }
  }
  const companionPrompt = buildCompanionPrompt({
    chart,
    userInput: message,
    fallbackInput: userProfile,
    userProfile,
    history,
    entrySource: 'chat_tab',
    persistedMemberMemory: memberMemory,
  });
  const chatContext = buildChatContext({
    chart,
    userInput: message,
    fallbackInput: userProfile,
    userProfile,
    history,
  });
  let compressedContext = '';
  try {
    compressedContext = await summarizeChatHistory(history);
  } catch {
    compressedContext = '';
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.88,
    max_completion_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT_COMPANION}

${SYSTEM_PROMPT_COMPANION_STYLE}

【口气修正】
- 不要写成汇报稿，不要像“命盘信息显示”“根据以上分析”“总结来说”。
- 开口像熟悉命盘的老师傅在喝茶聊天，可以有一点灵气和停顿感。
- 不要复述长背景，只抓这一句真正要答的点。
- 若上下文里已经说过，不要从第一轮重新讲起。
- 关键处可以来一句短感叹，例如“这个地方，倒真有点意思。”
- 若这一句适合收一笔，可自然赠一句短心法或七言句，不必每次都写。`,
      },
      {
        role: 'system',
        content: [
          chatContext,
          compressedContext ? `【近期对话摘要】\n${compressedContext}` : '',
          (() => {
            try {
                return buildMemberMemoryContext(memberMemory, {
                  currentInput: message,
                  topicType: companionPrompt.topicType,
                });
            } catch (error) {
              console.error('[memory] failed to build member memory context:', error);
              return '';
            }
          })(),
          '这些背景只用于理解用户，不要照着复述，也不要重新写一篇完整报告。',
        ].filter(Boolean).join('\n\n'),
      },
      { role: 'user', content: textOf(message) },
    ],
  });

  const sanitized = sanitizeAiResponse(response.choices?.[0]?.message?.content || '');
  try {
    updateMemberMemory({
      userKey,
      chart,
      memberTier,
      profile,
      userMessage: message,
      assistantReply: sanitized,
      route: deriveMemoryWriteback({
        reply: sanitized,
        topicType: companionPrompt.topicType,
        intentType: companionPrompt.intentType,
        followUpAnchor: companionPrompt.followUpAnchor,
      }),
      followUpAnchor: companionPrompt.followUpAnchor,
    });
  } catch (error) {
    console.error('[memory] failed to write member memory:', error);
  }

  return sanitized;
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

async function runXiaoLiuRenReading({
  question = '',
  chart,
  userKey,
  memberTier = 'free',
  engineResult,
  model = DEFAULT_MODEL,
}) {
  ensureOpenAIKey();

  let memberMemory;
  try {
    memberMemory = getMemberMemory({ userKey, chart, memberTier });
  } catch (error) {
    console.error('[memory] failed to read member memory for xiao liu ren:', error);
    memberMemory = null;
  }

  const payloadText = [
    `【问事场景】${textOf(engineResult?.sceneName, '未明确')}`,
    `【用户原问】${textOf(question, '此刻尚未说得很直，但系统会先按当前局面替他点题。')}`,
    `【更可能真正想问的那层】${textOf(engineResult?.likelyConcern, '未明确')}`,
    engineResult?.chartClues ? `【命盘与近期状态线索】${engineResult.chartClues}` : '',
    '【小六壬主断结果】',
    `- 主宫：${textOf(engineResult?.mainPalace?.palace_name)}（${textOf(engineResult?.mainPalace?.fortune_level)}）`,
    `- 主宫总断：${textOf(engineResult?.mainPalace?.general_judgment)}`,
    `- 场景主判断：${textOf(engineResult?.sceneMapping?.judgment)}`,
    `- 场景短断：${textOf(engineResult?.sceneMapping?.short_output || engineResult?.summary)}`,
    engineResult?.secondaryPalace
      ? `- 辅宫：${textOf(engineResult?.secondaryPalace?.palace_name)}（${textOf(engineResult?.secondaryPalace?.fortune_level)}）`
      : '',
    engineResult?.comboMapping
      ? `- 双宫组合：${textOf(engineResult?.comboMapping?.combo_name)} / ${textOf(engineResult?.comboMapping?.combo_level)}`
      : '',
    engineResult?.comboMapping ? `- 组合判断：${textOf(engineResult?.comboMapping?.judgment)}` : '',
    engineResult?.comboMapping ? `- 趋势说明：${textOf(engineResult?.comboMapping?.trend)}` : '',
    `- 宜：${toList(engineResult?.recommended).join('、') || '未提供'}`,
    `- 忌：${toList(engineResult?.avoid).join('、') || '未提供'}`,
    '【起卦时点】',
    `- 月：${textOf(engineResult?.eventContext?.localMonth)}`,
    `- 日：${textOf(engineResult?.eventContext?.localDay)}`,
    `- 时支：${textOf(engineResult?.eventContext?.timeBranch)}`,
    `- 时支序号：${textOf(engineResult?.eventContext?.timeBranchNumber)}`,
  ].filter(Boolean).join('\n');

  const response = await client.chat.completions.create({
    model,
    temperature: 0.72,
    max_completion_tokens: 760,
    messages: [
      {
        role: 'system',
        content: `${MASTER_PERSONA_BASE}

【本轮专用身份】
你先是“明己一卦·断事引擎”的表达者，然后才是“明己AI先生”。
你不能改动系统已经算出的宫位、吉凶和断事结论。AI 不负责重断，只负责把结构化主断翻译成更像明己的话。

【本轮工作边界】
1. 不要重新起卦。
2. 不要推翻主宫、辅宫、场景断语与组合断语。
3. 不要拿空泛玄话代替断语。
4. 可以结合命盘和近期状态理解“用户更可能真正在问什么”，但不能改掉小六壬主断。
5. 要保持明己的气质，但去掉过度堆砌的玄学腔。

【输出任务】
- 先正面回应用户这句具体在问什么，不能只复述卦名或套模板。
- 第一段里就要把用户问的对象说出来，例如“这笔交易”“这段关系”“这次寻人”“这趟出行”“这一步职业选择”。
- 先点明这卦落在什么势上。
- 再把主宫、场景断、双宫组合串成一条判断链。
- 若用户问题还泛，就先替他点破“他真正卡的是哪一层”。
- 最后给出可以立刻执行的提醒。

【输出结构】
第一段：先接住用户原问，直接告诉他这件事眼前更像会怎么走。
第二段：解释为什么这样看，要把主宫、场景断、双宫组合自然说出来。
第三段：落到现实，告诉用户这件事现在宜怎么做、忌怎么做，要贴着他的这句输入，而不是泛讲一类人。
第四段：留一句短的收势提醒，仍保留明己风格。

【语言要求】
- 允许有一点“老师傅当面点题”的味道，但不要只写意象。
- 不要写成列表或汇报稿。
- 不要出现“根据以上分析”“总结来说”。
- 字数比普通回答略展开，但以断事清楚为先。`,
      },
      {
        role: 'system',
        content: [
            memberMemory ? buildMemberMemoryContext(memberMemory, {
              currentInput: question,
              topicType: engineResult?.sceneType || '',
            }) : '',
          '这些记忆只用来理解用户，不要复读，也不要盖过这一次小六壬主断。',
        ].filter(Boolean).join('\n\n'),
      },
      {
        role: 'user',
        content: payloadText,
      },
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
  runXiaoLiuRenReading,
  runTranscription,
};



