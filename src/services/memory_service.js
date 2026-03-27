const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DB_FILE, buildUserKey } = require('./quotaService');

const DB_DIR = path.dirname(DB_FILE);

function ensureMemoryDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_profile_memory (
      user_key TEXT PRIMARY KEY,
      long_term_focus TEXT NOT NULL DEFAULT '[]',
      recurring_pain_points TEXT NOT NULL DEFAULT '[]',
      relationship_context TEXT NOT NULL DEFAULT '',
      career_context TEXT NOT NULL DEFAULT '',
      money_style TEXT NOT NULL DEFAULT '',
      spiritual_preference TEXT NOT NULL DEFAULT '',
      preferred_tone TEXT NOT NULL DEFAULT '',
      preferred_depth TEXT NOT NULL DEFAULT '',
      decision_style TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS member_session_memory (
      user_key TEXT PRIMARY KEY,
      last_topic_type TEXT NOT NULL DEFAULT '',
      last_intent_type TEXT NOT NULL DEFAULT '',
      last_core_judgment TEXT NOT NULL DEFAULT '',
      last_action_given TEXT NOT NULL DEFAULT '',
      last_open_loop TEXT NOT NULL DEFAULT '',
      last_compared_options TEXT NOT NULL DEFAULT '[]',
      last_terminology_asked TEXT NOT NULL DEFAULT '',
      recent_mood_trend TEXT NOT NULL DEFAULT 'unknown',
      last_conversation_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS member_response_preference (
      user_key TEXT PRIMARY KEY,
      likes_strong_conclusion INTEGER NOT NULL DEFAULT 0,
      likes_mystic_language INTEGER NOT NULL DEFAULT 1,
      likes_modern_explanation INTEGER NOT NULL DEFAULT 1,
      likes_comparison_answer INTEGER NOT NULL DEFAULT 0,
      likes_followup_question INTEGER NOT NULL DEFAULT 0,
      avoid_verbose_template INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

const db = ensureMemoryDatabase();

function textOf(value, fallback = '') {
  return `${value ?? fallback}`.trim();
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniqStrings(list = []) {
  return [...new Set((Array.isArray(list) ? list : []).map((item) => textOf(item)).filter(Boolean))];
}

function isPremiumTier(memberTier = '') {
  const tier = textOf(memberTier).toLowerCase();
  return Boolean(tier && tier !== 'free');
}

function extractComparedOptions(userMessage = '', assistantReply = '') {
  const source = `${userMessage} ${assistantReply}`;
  const match = source.match(/(.{1,24})还是(.{1,24})/);
  if (!match) return [];
  return uniqStrings([
    match[1].replace(/[？?！!。，“”"]/g, '').trim(),
    match[2].replace(/[？?！!。，“”"]/g, '').trim(),
  ]);
}

function extractPainPoints(userMessage = '') {
  const points = [];
  const text = textOf(userMessage);
  if (!text) return points;
  if (/(焦虑|压力|崩溃|难受|睡不着|心里堵)/.test(text)) points.push('情绪压力高');
  if (/(钱留不住|留不住钱|财运差|财路不稳|收入不稳)/.test(text)) points.push('财路不稳');
  if (/(感情|关系|婚姻|对象|复合|桃花)/.test(text)) points.push('关系反复');
  if (/(纠结|犹豫|想太多|拿不定主意)/.test(text)) points.push('决策反复');
  if (/(刺符|开运|护身|经文符|泰国)/.test(text)) points.push('灵性助运诉求');
  return points;
}

function extractLongTermFocus(userMessage = '', topicType = '') {
  const tags = [];
  const text = textOf(userMessage);
  if (topicType) tags.push(topicType);
  if (/(财运|偏财|正财|进财|守财|赚钱)/.test(text)) tags.push('财运');
  if (/(感情|关系|婚姻|对象|桃花)/.test(text)) tags.push('感情');
  if (/(事业|工作|创业|项目|扩张|方向)/.test(text)) tags.push('事业');
  if (/(刺符|开运|护身|经文符|泰国|风水)/.test(text)) tags.push('灵性助运');
  return uniqStrings(tags);
}

function inferPreferencePatch(userMessage = '', assistantReply = '') {
  const source = `${textOf(userMessage)} ${textOf(assistantReply)}`;
  const patch = {};

  if (/(直接给答案|直接说结论|别分析太多|别绕|就说答案|你直接断)/.test(source)) {
    patch.likesStrongConclusion = true;
    patch.avoidVerboseTemplate = true;
  }
  if (/(大师|玄学|命理|子平|术语)/.test(source)) {
    patch.likesMysticLanguage = true;
  }
  if (/(讲人话|现代一点|说明白|现实一点)/.test(source)) {
    patch.likesModernExplanation = true;
  }
  if (/(哪个好|哪个更适合|选哪个|还是)/.test(source)) {
    patch.likesComparisonAnswer = true;
  }
  if (/(可以问我|可以追问|你可以继续问)/.test(source)) {
    patch.likesFollowupQuestion = true;
  }

  return patch;
}

function normalizeProfileRow(row) {
  return {
    longTermFocus: safeJsonParse(row?.long_term_focus || '[]', []),
    recurringPainPoints: safeJsonParse(row?.recurring_pain_points || '[]', []),
    relationshipContext: row?.relationship_context || '',
    careerContext: row?.career_context || '',
    moneyStyle: row?.money_style || '',
    spiritualPreference: row?.spiritual_preference || '',
    preferredTone: row?.preferred_tone || '',
    preferredDepth: row?.preferred_depth || '',
    decisionStyle: row?.decision_style || '',
    updatedAt: row?.updated_at || '',
  };
}

function normalizeSessionRow(row) {
  return {
    lastTopicType: row?.last_topic_type || '',
    lastIntentType: row?.last_intent_type || '',
    lastCoreJudgment: row?.last_core_judgment || '',
    lastActionGiven: row?.last_action_given || '',
    lastOpenLoop: row?.last_open_loop || '',
    lastComparedOptions: safeJsonParse(row?.last_compared_options || '[]', []),
    lastTerminologyAsked: row?.last_terminology_asked || '',
    recentMoodTrend: row?.recent_mood_trend || 'unknown',
    lastConversationAt: row?.last_conversation_at || '',
  };
}

function normalizePreferenceRow(row) {
  return {
    likesStrongConclusion: Boolean(row?.likes_strong_conclusion),
    likesMysticLanguage: row ? Boolean(row?.likes_mystic_language) : true,
    likesModernExplanation: row ? Boolean(row?.likes_modern_explanation) : true,
    likesComparisonAnswer: Boolean(row?.likes_comparison_answer),
    likesFollowupQuestion: Boolean(row?.likes_followup_question),
    avoidVerboseTemplate: row ? Boolean(row?.avoid_verbose_template) : true,
    updatedAt: row?.updated_at || '',
  };
}

function getMemberMemory({ userKey, chart, memberTier }) {
  const resolvedKey = buildUserKey({ userKey, chart });
  const enabled = isPremiumTier(memberTier);

  if (!enabled) {
    return {
      enabled: false,
      userKey: resolvedKey,
      profileMemory: normalizeProfileRow(null),
      sessionMemory: normalizeSessionRow(null),
      responsePreference: normalizePreferenceRow(null),
    };
  }

  const profileRow = db.prepare(`SELECT * FROM member_profile_memory WHERE user_key = ?`).get(resolvedKey);
  const sessionRow = db.prepare(`SELECT * FROM member_session_memory WHERE user_key = ?`).get(resolvedKey);
  const preferenceRow = db.prepare(`SELECT * FROM member_response_preference WHERE user_key = ?`).get(resolvedKey);

  return {
    enabled: true,
    userKey: resolvedKey,
    profileMemory: normalizeProfileRow(profileRow),
    sessionMemory: normalizeSessionRow(sessionRow),
    responsePreference: normalizePreferenceRow(preferenceRow),
  };
}

function updateMemberMemory({
  userKey,
  chart,
  memberTier,
  userMessage = '',
  assistantReply = '',
  route = {},
  followUpAnchor = '',
  terminologyIntent = '',
}) {
  const resolvedKey = buildUserKey({ userKey, chart });
  if (!isPremiumTier(memberTier)) {
    return { enabled: false, userKey: resolvedKey };
  }

  const existing = getMemberMemory({ userKey: resolvedKey, chart, memberTier });
  const nextLongTermFocus = uniqStrings([
    ...existing.profileMemory.longTermFocus,
    ...extractLongTermFocus(userMessage, route.topicType),
  ]).slice(-8);
  const nextPainPoints = uniqStrings([
    ...existing.profileMemory.recurringPainPoints,
    ...extractPainPoints(userMessage),
  ]).slice(-8);
  const comparedOptions = extractComparedOptions(userMessage, assistantReply);
  const nextPreferences = {
    ...existing.responsePreference,
    ...inferPreferencePatch(userMessage, assistantReply),
  };

  db.prepare(`
    INSERT INTO member_profile_memory (
      user_key, long_term_focus, recurring_pain_points, relationship_context, career_context,
      money_style, spiritual_preference, preferred_tone, preferred_depth, decision_style, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key)
    DO UPDATE SET
      long_term_focus = excluded.long_term_focus,
      recurring_pain_points = excluded.recurring_pain_points,
      relationship_context = CASE WHEN excluded.relationship_context <> '' THEN excluded.relationship_context ELSE member_profile_memory.relationship_context END,
      career_context = CASE WHEN excluded.career_context <> '' THEN excluded.career_context ELSE member_profile_memory.career_context END,
      money_style = CASE WHEN excluded.money_style <> '' THEN excluded.money_style ELSE member_profile_memory.money_style END,
      spiritual_preference = CASE WHEN excluded.spiritual_preference <> '' THEN excluded.spiritual_preference ELSE member_profile_memory.spiritual_preference END,
      preferred_tone = CASE WHEN excluded.preferred_tone <> '' THEN excluded.preferred_tone ELSE member_profile_memory.preferred_tone END,
      preferred_depth = CASE WHEN excluded.preferred_depth <> '' THEN excluded.preferred_depth ELSE member_profile_memory.preferred_depth END,
      decision_style = CASE WHEN excluded.decision_style <> '' THEN excluded.decision_style ELSE member_profile_memory.decision_style END,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    resolvedKey,
    JSON.stringify(nextLongTermFocus),
    JSON.stringify(nextPainPoints),
    route.topicType === 'relationship' ? textOf(userMessage).slice(0, 80) : '',
    route.topicType === 'career' ? textOf(userMessage).slice(0, 80) : '',
    route.topicType === 'money' ? textOf(userMessage).slice(0, 80) : '',
    /(刺符|开运|护身|经文符|泰国|风水)/.test(userMessage) ? textOf(userMessage).slice(0, 80) : '',
    nextPreferences.likesStrongConclusion ? 'direct' : '',
    nextPreferences.avoidVerboseTemplate ? 'short' : '',
    /(该不该|选哪个|哪个更适合|怎么选)/.test(userMessage) ? '需要明确判断' : ''
  );

  db.prepare(`
    INSERT INTO member_session_memory (
      user_key, last_topic_type, last_intent_type, last_core_judgment, last_action_given,
      last_open_loop, last_compared_options, last_terminology_asked, recent_mood_trend, last_conversation_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key)
    DO UPDATE SET
      last_topic_type = excluded.last_topic_type,
      last_intent_type = excluded.last_intent_type,
      last_core_judgment = excluded.last_core_judgment,
      last_action_given = excluded.last_action_given,
      last_open_loop = excluded.last_open_loop,
      last_compared_options = excluded.last_compared_options,
      last_terminology_asked = excluded.last_terminology_asked,
      recent_mood_trend = excluded.recent_mood_trend,
      last_conversation_at = CURRENT_TIMESTAMP
  `).run(
    resolvedKey,
    textOf(route.topicType),
    textOf(route.intentType),
    textOf(route.coreJudgment).slice(0, 120),
    textOf(route.actionGiven).slice(0, 120),
    textOf(followUpAnchor || route.lastOpenLoop).slice(0, 160),
    JSON.stringify(comparedOptions),
    textOf(terminologyIntent),
    textOf(route.recentMoodTrend, 'unknown')
  );

  db.prepare(`
    INSERT INTO member_response_preference (
      user_key, likes_strong_conclusion, likes_mystic_language, likes_modern_explanation,
      likes_comparison_answer, likes_followup_question, avoid_verbose_template, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key)
    DO UPDATE SET
      likes_strong_conclusion = excluded.likes_strong_conclusion,
      likes_mystic_language = excluded.likes_mystic_language,
      likes_modern_explanation = excluded.likes_modern_explanation,
      likes_comparison_answer = excluded.likes_comparison_answer,
      likes_followup_question = excluded.likes_followup_question,
      avoid_verbose_template = excluded.avoid_verbose_template,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    resolvedKey,
    nextPreferences.likesStrongConclusion ? 1 : 0,
    nextPreferences.likesMysticLanguage ? 1 : 0,
    nextPreferences.likesModernExplanation ? 1 : 0,
    nextPreferences.likesComparisonAnswer ? 1 : 0,
    nextPreferences.likesFollowupQuestion ? 1 : 0,
    nextPreferences.avoidVerboseTemplate ? 1 : 0
  );

  return getMemberMemory({ userKey: resolvedKey, chart, memberTier });
}

function buildMemberMemoryContext(memory = {}) {
  if (!memory?.enabled) return '';

  const focus = (memory.profileMemory?.longTermFocus || []).join('、') || '未积累';
  const painPoints = (memory.profileMemory?.recurringPainPoints || []).join('、') || '未积累';
  const compared = (memory.sessionMemory?.lastComparedOptions || []).join('、') || '无';
  const preferenceSummary = [
    memory.responsePreference?.likesStrongConclusion ? '更喜欢直接结论' : '',
    memory.responsePreference?.likesMysticLanguage ? '接受玄学术语' : '',
    memory.responsePreference?.likesModernExplanation ? '希望有现代解释' : '',
    memory.responsePreference?.avoidVerboseTemplate ? '不喜欢模板腔' : '',
  ].filter(Boolean).join('；') || '未积累';

  return [
    '【会员专属记忆】',
    `- 长期关注：${focus}`,
    `- 反复卡点：${painPoints}`,
    `- 上次核心判断：${memory.sessionMemory?.lastCoreJudgment || '未积累'}`,
    `- 上次给的动作：${memory.sessionMemory?.lastActionGiven || '未积累'}`,
    `- 上次未完结点：${memory.sessionMemory?.lastOpenLoop || '未积累'}`,
    `- 上次比较题：${compared}`,
    `- 回答偏好：${preferenceSummary}`,
    '- 使用方式：如果当前问题与上次未完结点有关，请直接承接，不要重开背景。',
  ].join('\n');
}

module.exports = {
  getMemberMemory,
  updateMemberMemory,
  buildMemberMemoryContext,
};
