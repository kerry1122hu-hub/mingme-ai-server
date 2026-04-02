const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DB_FILE, buildUserKey } = require('./quotaService');

const DB_DIR = path.dirname(DB_FILE);
const MAX_RECENT_SESSIONS = 10;
const MAX_ACTION_HISTORY = 30;
const MAX_QUESTION_HISTORY = 300;

function ensureMemoryDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      nickname TEXT NULL,
      gender TEXT NULL,
      birth_solar TEXT NULL,
      birth_lunar TEXT NULL,
      timezone TEXT NULL,
      bazi_summary TEXT NULL,
      zodiac_summary TEXT NULL,
      decision_style TEXT NULL,
      emotion_pattern TEXT NULL,
      relationship_pattern TEXT NULL,
      money_pattern TEXT NULL,
      response_preference TEXT NULL,
      long_term_goals TEXT NOT NULL DEFAULT '[]',
      risk_notes TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memory_recent_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      turn_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      topic_type TEXT NOT NULL DEFAULT 'general',
      intent_type TEXT NOT NULL DEFAULT 'clarify',
      user_issue TEXT NOT NULL DEFAULT '',
      emotion_state TEXT NOT NULL DEFAULT '',
      ai_judgment TEXT NOT NULL DEFAULT '',
      ai_action TEXT NOT NULL DEFAULT '',
      user_feedback TEXT NOT NULL DEFAULT '',
      open_loop TEXT NOT NULL DEFAULT '',
      importance_score INTEGER NOT NULL DEFAULT 5,
      embedding_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_memory_recent_sessions_user_time
      ON memory_recent_sessions(user_id, turn_time DESC, id DESC);

    CREATE TABLE IF NOT EXISTS memory_long_term_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      pattern_title TEXT NOT NULL,
      pattern_summary TEXT NOT NULL,
      evidence_count INTEGER NOT NULL DEFAULT 1,
      confidence_score INTEGER NOT NULL DEFAULT 5,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_memory_long_term_patterns_user
      ON memory_long_term_patterns(user_id, pattern_type, status, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS memory_action_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      topic_type TEXT NOT NULL DEFAULT 'general',
      action_text TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL DEFAULT '',
      due_hint TEXT NOT NULL DEFAULT '',
      execution_status TEXT NOT NULL DEFAULT 'pending',
      user_result_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_memory_action_tracker_user
      ON memory_action_tracker(user_id, execution_status, updated_at DESC);

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

    CREATE TABLE IF NOT EXISTS member_question_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      user_message TEXT NOT NULL DEFAULT '',
      assistant_reply TEXT NOT NULL DEFAULT '',
      topic_type TEXT NOT NULL DEFAULT '',
      intent_type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_member_question_memory_user_time
      ON member_question_memory(user_key, created_at DESC, id DESC);
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

function clampNumber(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function isPremiumTier(memberTier = '') {
  const tier = textOf(memberTier).toLowerCase();
  return Boolean(tier && tier !== 'free');
}

function resolveUserId({ userKey, chart }) {
  return buildUserKey({ userKey, chart });
}

function buildSessionId() {
  return `mem-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizePillarText(pillar = '') {
  return textOf(pillar).replace(/\s+/g, '');
}

function getPillarsFromChart(chart = {}) {
  const pillars = chart?.pillars;
  if (Array.isArray(pillars) && pillars.length >= 4) {
    return pillars.map((item) => normalizePillarText(
      item?.name
      || item?.ganZhi
      || `${item?.gan || item?.stem || ''}${item?.zhi || item?.branch || ''}`
    ));
  }
  if (pillars && typeof pillars === 'object') {
    return ['year', 'month', 'day', 'hour'].map((key) => normalizePillarText(
      pillars?.[key]?.name
      || pillars?.[key]?.ganZhi
      || `${pillars?.[key]?.gan || pillars?.[key]?.stem || ''}${pillars?.[key]?.zhi || pillars?.[key]?.branch || ''}`
    ));
  }
  if (chart?.formatted?.ganzhi) {
    return `${chart.formatted.ganzhi}`.split(/[\s/|]+/).map(normalizePillarText).filter(Boolean).slice(0, 4);
  }
  if (Array.isArray(chart?.bazi)) {
    return chart.bazi.map(normalizePillarText).slice(0, 4);
  }
  return [];
}

function buildBirthSolar(profile = {}) {
  if (!profile?.year || !profile?.month || !profile?.day) return '';
  const hour = `${profile?.hour ?? 0}`.padStart(2, '0');
  const minute = `${profile?.minute ?? 0}`.padStart(2, '0');
  return `${profile.year}-${`${profile.month}`.padStart(2, '0')}-${`${profile.day}`.padStart(2, '0')} ${hour}:${minute}`;
}

function buildBaziSummary(chart = {}) {
  const pillars = getPillarsFromChart(chart).filter(Boolean);
  const strength = textOf(chart?.dayStrength || chart?.strengthLevel || chart?.formatted?.dayStrength);
  const useGod = textOf(chart?.primaryUseGod || chart?.formatted?.useGod || chart?.useGod);
  const tenGodSummary = textOf(chart?.tenGodSummary || chart?.formatted?.tenGodSummary);
  const parts = [];
  if (pillars.length === 4) parts.push(`四柱为${pillars.join('、')}`);
  if (strength) parts.push(`日元状态偏${strength}`);
  if (useGod) parts.push(`当前主用神落在${useGod}`);
  if (tenGodSummary) parts.push(`十神重点在${tenGodSummary}`);
  return parts.join('；');
}

function buildZodiacSummary(profile = {}, chart = {}) {
  return textOf(chart?.westernSummary || chart?.zodiacSummary || profile?.zodiacSummary || chart?.narrative?.personality_hint);
}

function detectEmotionState(userMessage = '') {
  const text = textOf(userMessage);
  if (!text) return '平稳';
  if (/(焦虑|压力|崩溃|烦|慌|累|撑不住|失眠)/.test(text)) return '焦虑紧绷';
  if (/(委屈|难受|伤心|失落|低落)/.test(text)) return '情绪低落';
  if (/(生气|愤怒|火大|不爽)/.test(text)) return '情绪顶着';
  if (/(纠结|犹豫|拿不定|反复想)/.test(text)) return '反复纠结';
  return '平稳';
}

function extractPainPoints(userMessage = '') {
  const points = [];
  const text = textOf(userMessage);
  if (!text) return points;
  if (/(焦虑|压力|崩溃|难受|失眠|心里堵|很累|撑不住)/.test(text)) points.push('情绪压力高');
  if (/(钱留不住|留不住钱|财运差|财路不稳|收入不稳|回款慢|现金流)/.test(text)) points.push('财路不稳');
  if (/(感情|关系|婚姻|对象|复合|桃花|夫妻宫)/.test(text)) points.push('关系反复');
  if (/(纠结|犹豫|想太多|拿不定主意|该不该|值不值得)/.test(text)) points.push('决策反复');
  if (/(项目太多|主线失焦|方向太多|多线并行|忙乱)/.test(text)) points.push('主线失焦');
  if (/(刺符|开运|护身|经文符|泰国|风水|招财符)/.test(text)) points.push('灵性助运诉求');
  return points;
}

function extractLongTermFocus(userMessage = '', topicType = '') {
  const tags = [];
  const text = textOf(userMessage);
  if (topicType) tags.push(topicType);
  if (/(财运|偏财|正财|进财|守财|赚钱|收入)/.test(text)) tags.push('财富');
  if (/(感情|关系|婚姻|对象|桃花|夫妻宫)/.test(text)) tags.push('关系');
  if (/(事业|工作|创业|项目|扩张|方向|大运)/.test(text)) tags.push('事业');
  if (/(情绪|焦虑|低落|压力|失眠)/.test(text)) tags.push('情绪');
  if (/(刺符|开运|护身|经文符|泰国|风水|贵人符)/.test(text)) tags.push('灵性助运');
  return uniqStrings(tags);
}

function inferPreferencePatch(userMessage = '', assistantReply = '') {
  const source = `${textOf(userMessage)} ${textOf(assistantReply)}`;
  const patch = {};
  if (/(直接给答案|直接说结论|别分析太多|别绕|就说答案|你直接断)/.test(source)) {
    patch.likesStrongConclusion = true;
    patch.avoidVerboseTemplate = true;
  }
  if (/(大师|玄学|命理|子平|术语|格局|时运)/.test(source)) patch.likesMysticLanguage = true;
  if (/(讲人话|现代一点|说明白点|现实一点)/.test(source)) patch.likesModernExplanation = true;
  if (/(哪个更好|哪个更适合|选哪个|还是)/.test(source)) patch.likesComparisonAnswer = true;
  if (/(可以问我|可以追问|你可以继续问)/.test(source)) patch.likesFollowupQuestion = true;
  return patch;
}

function inferDecisionStyle(userMessage = '', existing = '') {
  const text = textOf(userMessage);
  if (/(先做再说|先试|先推|先行动)/.test(text)) return '倾向先行动再校正';
  if (/(反复想|想清楚再动|容易纠结|拿不定主意)/.test(text)) return '倾向先想清楚再行动';
  return textOf(existing);
}

function inferEmotionPattern(userMessage = '', existing = '') {
  const text = textOf(userMessage);
  if (/(焦虑|压力|失眠|累)/.test(text)) return '压力上来时容易先绷住自己';
  if (/(委屈|低落|伤心)/.test(text)) return '情绪低落时更需要被接住和澄清';
  return textOf(existing);
}

function inferRelationshipPattern(userMessage = '', existing = '') {
  const text = textOf(userMessage);
  if (/(先忍后爆|一直忍|突然爆发)/.test(text)) return '关系里容易先忍后爆';
  if (/(反复拉扯|舍不得|断不干净)/.test(text)) return '关系里容易拉扯反复';
  return textOf(existing);
}

function inferMoneyPattern(userMessage = '', existing = '') {
  const text = textOf(userMessage);
  if (/(高估|短期回报|快钱|冲动投资)/.test(text)) return '金钱判断上容易高估短期回报';
  if (/(现金流|回款|收入不稳)/.test(text)) return '更在意现金流稳定和落袋感';
  return textOf(existing);
}

function buildResponsePreferenceText(pref = {}) {
  const parts = [];
  if (pref.likesStrongConclusion) parts.push('偏好先给结论');
  if (pref.likesMysticLanguage) parts.push('接受命理术语');
  if (pref.likesModernExplanation) parts.push('希望带现实解释');
  if (pref.likesComparisonAnswer) parts.push('常问比较题');
  if (pref.likesFollowupQuestion) parts.push('接受适度追问');
  if (pref.avoidVerboseTemplate) parts.push('不喜欢模板长答');
  return parts.join('、');
}

function inferActionType(actionText = '', topicType = '') {
  const text = textOf(actionText);
  if (!text) return '';
  if (/(说清|表达|沟通|聊一聊|发消息|见面)/.test(text)) return '沟通';
  if (/(先停|先缓|先收|先放下|先暂停)/.test(text)) return '收缩';
  if (/(记下来|写下来|记录|复盘)/.test(text)) return '记录';
  if (/(决定|判断|选|取舍)/.test(text)) return '决策';
  if (topicType === 'emotion') return '暂停';
  return '行动';
}

function inferDueHint(actionText = '', userMessage = '') {
  const source = `${textOf(actionText)} ${textOf(userMessage)}`;
  if (/(今天|今晚)/.test(source)) return '今晚';
  if (/(明天)/.test(source)) return '明天';
  if (/(这周|本周)/.test(source)) return '本周';
  if (/(下次见面前|下次聊前)/.test(source)) return '下次聊前';
  return '';
}

function inferExecutionStatus(userMessage = '') {
  const text = textOf(userMessage);
  if (/(做了|试了|已经开始|落实了|按你说的做了)/.test(text)) return 'done';
  if (/(没做|还没做|没有做|没开始)/.test(text)) return 'unknown';
  if (/(不想做|不打算做|跳过|算了)/.test(text)) return 'skipped';
  return '';
}

function buildRecentSessionSummary({
  userMessage = '',
  assistantReply = '',
  route = {},
  followUpAnchor = '',
}) {
  const issue = textOf(userMessage).slice(0, 180);
  const reply = textOf(assistantReply);
  const firstSentence = reply
    .split(/[\n。！？]/)
    .map((item) => item.trim())
    .filter(Boolean)[0] || reply.slice(0, 80);
  const actionMatch = reply.match(/(先把[^。！？\n]{0,40}|更实际一点的做法是[^。！？\n]{0,50}|你现在先[^。！？\n]{0,40}|这一步更重要的是[^。！？\n]{0,50})/);
  return {
    sessionId: buildSessionId(),
    topicType: textOf(route.topicType, 'general'),
    intentType: textOf(route.intentType, 'clarify'),
    userIssue: issue,
    emotionState: detectEmotionState(userMessage),
    aiJudgment: textOf(route.coreJudgment || firstSentence).slice(0, 180),
    aiAction: textOf(route.actionGiven || actionMatch?.[0]).slice(0, 180),
    userFeedback: inferExecutionStatus(userMessage) ? issue : '',
    openLoop: textOf(followUpAnchor || route.lastOpenLoop).slice(0, 180),
    importanceScore: clampNumber(route.importanceScore || (issue.length > 40 ? 7 : 5), 1, 10, 5),
    embeddingText: [issue, textOf(route.coreJudgment), textOf(route.actionGiven), textOf(followUpAnchor)].filter(Boolean).join(' | ').slice(0, 400),
  };
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

function normalizeQuestionRow(row) {
  return {
    id: Number(row?.id || 0),
    userMessage: row?.user_message || '',
    assistantReply: row?.assistant_reply || '',
    topicType: row?.topic_type || '',
    intentType: row?.intent_type || '',
    createdAt: row?.created_at || '',
  };
}

function normalizeUserProfileRow(row) {
  return {
    userId: row?.user_id || '',
    nickname: row?.nickname || '',
    gender: row?.gender || '',
    birthSolar: row?.birth_solar || '',
    birthLunar: row?.birth_lunar || '',
    timezone: row?.timezone || '',
    baziSummary: row?.bazi_summary || '',
    zodiacSummary: row?.zodiac_summary || '',
    decisionStyle: row?.decision_style || '',
    emotionPattern: row?.emotion_pattern || '',
    relationshipPattern: row?.relationship_pattern || '',
    moneyPattern: row?.money_pattern || '',
    responsePreference: row?.response_preference || '',
    longTermGoals: safeJsonParse(row?.long_term_goals || '[]', []),
    riskNotes: row?.risk_notes || '',
    createdAt: row?.created_at || '',
    updatedAt: row?.updated_at || '',
  };
}

function normalizeRecentSessionRow(row) {
  return {
    id: Number(row?.id || 0),
    sessionId: row?.session_id || '',
    turnTime: row?.turn_time || '',
    topicType: row?.topic_type || '',
    intentType: row?.intent_type || '',
    userIssue: row?.user_issue || '',
    emotionState: row?.emotion_state || '',
    aiJudgment: row?.ai_judgment || '',
    aiAction: row?.ai_action || '',
    userFeedback: row?.user_feedback || '',
    openLoop: row?.open_loop || '',
    importanceScore: Number(row?.importance_score || 0),
    embeddingText: row?.embedding_text || '',
    createdAt: row?.created_at || '',
  };
}

function normalizeLongTermPatternRow(row) {
  return {
    id: Number(row?.id || 0),
    patternType: row?.pattern_type || '',
    patternTitle: row?.pattern_title || '',
    patternSummary: row?.pattern_summary || '',
    evidenceCount: Number(row?.evidence_count || 0),
    confidenceScore: Number(row?.confidence_score || 0),
    lastSeenAt: row?.last_seen_at || '',
    status: row?.status || 'active',
    createdAt: row?.created_at || '',
    updatedAt: row?.updated_at || '',
  };
}

function normalizeActionTrackerRow(row) {
  return {
    id: Number(row?.id || 0),
    sessionId: row?.session_id || '',
    topicType: row?.topic_type || '',
    actionText: row?.action_text || '',
    actionType: row?.action_type || '',
    dueHint: row?.due_hint || '',
    executionStatus: row?.execution_status || 'pending',
    userResultNote: row?.user_result_note || '',
    createdAt: row?.created_at || '',
    updatedAt: row?.updated_at || '',
  };
}

function listQuestionHistory(userId, limit = 20) {
  const normalizedLimit = clampNumber(limit, 1, 500, 20);
  const rows = db.prepare(`
    SELECT id, user_message, assistant_reply, topic_type, intent_type, created_at
    FROM member_question_memory
    WHERE user_key = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(userId, normalizedLimit);
  return rows.map(normalizeQuestionRow);
}

function listRecentSessions(userId, limit = MAX_RECENT_SESSIONS) {
  const rows = db.prepare(`
    SELECT *
    FROM memory_recent_sessions
    WHERE user_id = ?
    ORDER BY turn_time DESC, id DESC
    LIMIT ?
  `).all(userId, clampNumber(limit, 1, 50, MAX_RECENT_SESSIONS));
  return rows.map(normalizeRecentSessionRow);
}

function listLongTermPatterns(userId, limit = 6) {
  const rows = db.prepare(`
    SELECT *
    FROM memory_long_term_patterns
    WHERE user_id = ?
      AND status = 'active'
    ORDER BY confidence_score DESC, evidence_count DESC, last_seen_at DESC
    LIMIT ?
  `).all(userId, clampNumber(limit, 1, 20, 6));
  return rows.map(normalizeLongTermPatternRow);
}

function listActionTracker(userId, limit = 10) {
  const rows = db.prepare(`
    SELECT *
    FROM memory_action_tracker
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).all(userId, clampNumber(limit, 1, 50, 10));
  return rows.map(normalizeActionTrackerRow);
}

function getUserProfile(userId) {
  const row = db.prepare(`SELECT * FROM user_profiles WHERE user_id = ?`).get(userId);
  return normalizeUserProfileRow(row);
}

function getLegacyProfile(userId) {
  const row = db.prepare(`SELECT * FROM member_profile_memory WHERE user_key = ?`).get(userId);
  return normalizeProfileRow(row);
}

function getLegacySession(userId) {
  const row = db.prepare(`SELECT * FROM member_session_memory WHERE user_key = ?`).get(userId);
  return normalizeSessionRow(row);
}

function getLegacyPreference(userId) {
  const row = db.prepare(`SELECT * FROM member_response_preference WHERE user_key = ?`).get(userId);
  return normalizePreferenceRow(row);
}

function buildCompatibilityProfileMemory(userProfile, longTermPatterns, legacyProfile) {
  const focusFromPatterns = longTermPatterns.map((item) => (
    item.patternType === 'emotion' ? '情绪'
      : item.patternType === 'career' ? '事业'
        : item.patternType === 'relationship' ? '关系'
          : item.patternType === 'money' ? '财富'
            : item.patternTitle
  ));
  const recurringFromPatterns = longTermPatterns.map((item) => item.patternTitle);
  return {
    longTermFocus: uniqStrings([
      ...(Array.isArray(userProfile.longTermGoals) ? userProfile.longTermGoals : []),
      ...focusFromPatterns,
      ...legacyProfile.longTermFocus,
    ]).slice(0, 8),
    recurringPainPoints: uniqStrings([
      userProfile.emotionPattern,
      userProfile.relationshipPattern,
      userProfile.moneyPattern,
      ...recurringFromPatterns,
      ...legacyProfile.recurringPainPoints,
    ]).slice(0, 8),
    relationshipContext: textOf(userProfile.relationshipPattern || legacyProfile.relationshipContext),
    careerContext: textOf(legacyProfile.careerContext),
    moneyStyle: textOf(userProfile.moneyPattern || legacyProfile.moneyStyle),
    spiritualPreference: textOf(legacyProfile.spiritualPreference),
    preferredTone: textOf(legacyProfile.preferredTone),
    preferredDepth: textOf(legacyProfile.preferredDepth),
    decisionStyle: textOf(userProfile.decisionStyle || legacyProfile.decisionStyle),
    updatedAt: textOf(userProfile.updatedAt || legacyProfile.updatedAt),
  };
}

function buildCompatibilitySessionMemory(recentSessions, legacySession) {
  const latest = recentSessions[0];
  return {
    lastTopicType: textOf(latest?.topicType || legacySession.lastTopicType),
    lastIntentType: textOf(latest?.intentType || legacySession.lastIntentType),
    lastCoreJudgment: textOf(latest?.aiJudgment || legacySession.lastCoreJudgment),
    lastActionGiven: textOf(latest?.aiAction || legacySession.lastActionGiven),
    lastOpenLoop: textOf(latest?.openLoop || legacySession.lastOpenLoop),
    lastComparedOptions: legacySession.lastComparedOptions || [],
    lastTerminologyAsked: textOf(legacySession.lastTerminologyAsked),
    recentMoodTrend: textOf(latest?.emotionState || legacySession.recentMoodTrend || 'unknown'),
    lastConversationAt: textOf(latest?.turnTime || legacySession.lastConversationAt),
  };
}

function buildCompatibilityPreference(userProfile, legacyPreference) {
  const prefText = textOf(userProfile.responsePreference);
  return {
    likesStrongConclusion: legacyPreference.likesStrongConclusion || /先给结论/.test(prefText),
    likesMysticLanguage: legacyPreference.likesMysticLanguage || /命理术语|玄学术语/.test(prefText),
    likesModernExplanation: legacyPreference.likesModernExplanation || /现实解释|人话/.test(prefText),
    likesComparisonAnswer: legacyPreference.likesComparisonAnswer || /比较/.test(prefText),
    likesFollowupQuestion: legacyPreference.likesFollowupQuestion || /追问/.test(prefText),
    avoidVerboseTemplate: legacyPreference.avoidVerboseTemplate || /不喜欢模板长答/.test(prefText),
    updatedAt: textOf(userProfile.updatedAt || legacyPreference.updatedAt),
  };
}

function upsertUserProfile(userId, { profile = {}, chart = {}, preferencePatch = {}, recentSession = {}, existingProfile = {} }) {
  const mergedPreferenceText = buildResponsePreferenceText({
    likesStrongConclusion: preferencePatch.likesStrongConclusion || /先给结论/.test(existingProfile.responsePreference || ''),
    likesMysticLanguage: preferencePatch.likesMysticLanguage || /命理术语/.test(existingProfile.responsePreference || ''),
    likesModernExplanation: preferencePatch.likesModernExplanation || /现实解释/.test(existingProfile.responsePreference || ''),
    likesComparisonAnswer: preferencePatch.likesComparisonAnswer || /比较/.test(existingProfile.responsePreference || ''),
    likesFollowupQuestion: preferencePatch.likesFollowupQuestion || /追问/.test(existingProfile.responsePreference || ''),
    avoidVerboseTemplate: preferencePatch.avoidVerboseTemplate || /不喜欢模板长答/.test(existingProfile.responsePreference || ''),
  });

  const longTermGoals = uniqStrings([
    ...(Array.isArray(existingProfile.longTermGoals) ? existingProfile.longTermGoals : []),
    ...extractLongTermFocus(recentSession.userIssue, recentSession.topicType),
  ]).slice(0, 8);

  db.prepare(`
    INSERT INTO user_profiles (
      user_id, nickname, gender, birth_solar, birth_lunar, timezone,
      bazi_summary, zodiac_summary, decision_style, emotion_pattern,
      relationship_pattern, money_pattern, response_preference,
      long_term_goals, risk_notes, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id)
    DO UPDATE SET
      nickname = COALESCE(NULLIF(excluded.nickname, ''), user_profiles.nickname),
      gender = COALESCE(NULLIF(excluded.gender, ''), user_profiles.gender),
      birth_solar = COALESCE(NULLIF(excluded.birth_solar, ''), user_profiles.birth_solar),
      birth_lunar = COALESCE(NULLIF(excluded.birth_lunar, ''), user_profiles.birth_lunar),
      timezone = COALESCE(NULLIF(excluded.timezone, ''), user_profiles.timezone),
      bazi_summary = COALESCE(NULLIF(excluded.bazi_summary, ''), user_profiles.bazi_summary),
      zodiac_summary = COALESCE(NULLIF(excluded.zodiac_summary, ''), user_profiles.zodiac_summary),
      decision_style = COALESCE(NULLIF(excluded.decision_style, ''), user_profiles.decision_style),
      emotion_pattern = COALESCE(NULLIF(excluded.emotion_pattern, ''), user_profiles.emotion_pattern),
      relationship_pattern = COALESCE(NULLIF(excluded.relationship_pattern, ''), user_profiles.relationship_pattern),
      money_pattern = COALESCE(NULLIF(excluded.money_pattern, ''), user_profiles.money_pattern),
      response_preference = COALESCE(NULLIF(excluded.response_preference, ''), user_profiles.response_preference),
      long_term_goals = excluded.long_term_goals,
      risk_notes = COALESCE(NULLIF(excluded.risk_notes, ''), user_profiles.risk_notes),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    userId,
    textOf(profile.nickname),
    textOf(profile.gender),
    buildBirthSolar(profile),
    textOf(profile.birthLunar),
    textOf(profile.timezone || 'Australia/Perth'),
    buildBaziSummary(chart) || existingProfile.baziSummary,
    buildZodiacSummary(profile, chart) || existingProfile.zodiacSummary,
    inferDecisionStyle(recentSession.userIssue, existingProfile.decisionStyle),
    inferEmotionPattern(recentSession.userIssue, existingProfile.emotionPattern),
    inferRelationshipPattern(recentSession.userIssue, existingProfile.relationshipPattern),
    inferMoneyPattern(recentSession.userIssue, existingProfile.moneyPattern),
    mergedPreferenceText || existingProfile.responsePreference,
    JSON.stringify(longTermGoals),
    textOf(existingProfile.riskNotes),
  );
}

function insertRecentSession(userId, session) {
  db.prepare(`
    INSERT INTO memory_recent_sessions (
      user_id, session_id, turn_time, topic_type, intent_type, user_issue, emotion_state,
      ai_judgment, ai_action, user_feedback, open_loop, importance_score, embedding_text, created_at
    )
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    userId,
    session.sessionId,
    session.topicType,
    session.intentType,
    session.userIssue,
    session.emotionState,
    session.aiJudgment,
    session.aiAction,
    session.userFeedback,
    session.openLoop,
    clampNumber(session.importanceScore, 1, 10, 5),
    session.embeddingText,
  );

  db.prepare(`
    DELETE FROM memory_recent_sessions
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id
        FROM memory_recent_sessions
        WHERE user_id = ?
        ORDER BY turn_time DESC, id DESC
        LIMIT ${MAX_RECENT_SESSIONS}
      )
  `).run(userId, userId);
}

function appendQuestionHistory(userId, session) {
  if (!session.userIssue) return;
  db.prepare(`
    INSERT INTO member_question_memory (
      user_key, user_message, assistant_reply, topic_type, intent_type, created_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    userId,
    textOf(session.userIssue).slice(0, 1200),
    textOf(session.aiJudgment ? `${session.aiJudgment}${session.aiAction ? `；${session.aiAction}` : ''}` : '').slice(0, 1500),
    session.topicType,
    session.intentType,
  );

  db.prepare(`
    DELETE FROM member_question_memory
    WHERE user_key = ?
      AND id NOT IN (
        SELECT id
        FROM member_question_memory
        WHERE user_key = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ${MAX_QUESTION_HISTORY}
      )
  `).run(userId, userId);
}

function updateActionTracker(userId, session) {
  const feedbackStatus = inferExecutionStatus(session.userIssue);
  const latestPending = db.prepare(`
    SELECT *
    FROM memory_action_tracker
    WHERE user_id = ?
      AND execution_status = 'pending'
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(userId);

  if (latestPending && feedbackStatus) {
    db.prepare(`
      UPDATE memory_action_tracker
      SET execution_status = ?, user_result_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(feedbackStatus, textOf(session.userIssue).slice(0, 200), latestPending.id);
  }

  if (!session.aiAction) return;

  db.prepare(`
    INSERT INTO memory_action_tracker (
      user_id, session_id, topic_type, action_text, action_type, due_hint,
      execution_status, user_result_note, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    userId,
    session.sessionId,
    session.topicType,
    session.aiAction,
    inferActionType(session.aiAction, session.topicType),
    inferDueHint(session.aiAction, session.userIssue),
  );

  db.prepare(`
    DELETE FROM memory_action_tracker
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id
        FROM memory_action_tracker
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT ${MAX_ACTION_HISTORY}
      )
  `).run(userId, userId);
}

function buildPatternCandidateMap(recentSessions) {
  const map = new Map();
  recentSessions.forEach((item) => {
    const painPoints = extractPainPoints(item.userIssue);
    const topicKey = item.topicType || 'general';
    if (!map.has(topicKey)) {
      map.set(topicKey, {
        patternType: topicKey,
        patternTitle: `${topicKey}主题反复出现`,
        patternSummary: `在${topicKey}主题上，最近多次回到相似问题。`,
        evidenceCount: 0,
        lastSeenAt: item.turnTime || item.createdAt,
      });
    }
    const topicEntry = map.get(topicKey);
    topicEntry.evidenceCount += 1;
    topicEntry.lastSeenAt = topicEntry.lastSeenAt > (item.turnTime || item.createdAt) ? topicEntry.lastSeenAt : (item.turnTime || item.createdAt);

    painPoints.forEach((pain) => {
      const key = `${topicKey}:${pain}`;
      if (!map.has(key)) {
        map.set(key, {
          patternType: topicKey,
          patternTitle: pain,
          patternSummary: `这位用户在${topicKey === 'career' ? '事业' : topicKey === 'relationship' ? '关系' : topicKey === 'money' ? '财富' : topicKey === 'emotion' ? '情绪' : topicKey}议题上，反复卡在“${pain}”这一层。`,
          evidenceCount: 0,
          lastSeenAt: item.turnTime || item.createdAt,
        });
      }
      const entry = map.get(key);
      entry.evidenceCount += 1;
      entry.lastSeenAt = entry.lastSeenAt > (item.turnTime || item.createdAt) ? entry.lastSeenAt : (item.turnTime || item.createdAt);
    });
  });
  return [...map.values()].filter((item) => item.evidenceCount >= 2);
}

function rebuildLongTermPatterns(userId) {
  const recentSessions = listRecentSessions(userId, 30);
  const candidates = buildPatternCandidateMap(recentSessions)
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .slice(0, 8);

  db.prepare(`DELETE FROM memory_long_term_patterns WHERE user_id = ?`).run(userId);

  const insert = db.prepare(`
    INSERT INTO memory_long_term_patterns (
      user_id, pattern_type, pattern_title, pattern_summary, evidence_count,
      confidence_score, last_seen_at, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  candidates.forEach((item) => {
    insert.run(
      userId,
      textOf(item.patternType, 'general'),
      textOf(item.patternTitle, '长期模式'),
      textOf(item.patternSummary),
      clampNumber(item.evidenceCount, 1, 99, 2),
      clampNumber(item.evidenceCount + 3, 4, 9, 5),
      textOf(item.lastSeenAt),
    );
  });
}

function syncLegacyCompatibility(userId, memory) {
  const profileMemory = memory.profileMemory || {};
  const sessionMemory = memory.sessionMemory || {};
  const responsePreference = memory.responsePreference || {};

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
      relationship_context = excluded.relationship_context,
      career_context = excluded.career_context,
      money_style = excluded.money_style,
      spiritual_preference = excluded.spiritual_preference,
      preferred_tone = excluded.preferred_tone,
      preferred_depth = excluded.preferred_depth,
      decision_style = excluded.decision_style,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    userId,
    JSON.stringify(profileMemory.longTermFocus || []),
    JSON.stringify(profileMemory.recurringPainPoints || []),
    textOf(profileMemory.relationshipContext),
    textOf(profileMemory.careerContext),
    textOf(profileMemory.moneyStyle),
    textOf(profileMemory.spiritualPreference),
    textOf(profileMemory.preferredTone),
    textOf(profileMemory.preferredDepth),
    textOf(profileMemory.decisionStyle),
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
    userId,
    textOf(sessionMemory.lastTopicType),
    textOf(sessionMemory.lastIntentType),
    textOf(sessionMemory.lastCoreJudgment).slice(0, 120),
    textOf(sessionMemory.lastActionGiven).slice(0, 120),
    textOf(sessionMemory.lastOpenLoop).slice(0, 160),
    JSON.stringify(sessionMemory.lastComparedOptions || []),
    textOf(sessionMemory.lastTerminologyAsked),
    textOf(sessionMemory.recentMoodTrend, 'unknown'),
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
    userId,
    responsePreference.likesStrongConclusion ? 1 : 0,
    responsePreference.likesMysticLanguage ? 1 : 0,
    responsePreference.likesModernExplanation ? 1 : 0,
    responsePreference.likesComparisonAnswer ? 1 : 0,
    responsePreference.likesFollowupQuestion ? 1 : 0,
    responsePreference.avoidVerboseTemplate ? 1 : 0,
  );
}

function getMemberMemory({ userKey, chart, memberTier }) {
  const userId = resolveUserId({ userKey, chart });
  const enabled = isPremiumTier(memberTier);

  if (!enabled) {
    return {
      enabled: false,
      userKey: userId,
      userProfile: normalizeUserProfileRow(null),
      recentSessions: [],
      longTermPatterns: [],
      actionTracker: { pendingActions: [], recentActions: [] },
      profileMemory: normalizeProfileRow(null),
      sessionMemory: normalizeSessionRow(null),
      responsePreference: normalizePreferenceRow(null),
      questionHistory: [],
    };
  }

  const userProfile = getUserProfile(userId);
  const recentSessions = listRecentSessions(userId, MAX_RECENT_SESSIONS);
  const longTermPatterns = listLongTermPatterns(userId, 8);
  const actions = listActionTracker(userId, 8);
  const legacyProfile = getLegacyProfile(userId);
  const legacySession = getLegacySession(userId);
  const legacyPreference = getLegacyPreference(userId);

  return {
    enabled: true,
    userKey: userId,
    userProfile,
    recentSessions,
    longTermPatterns,
    actionTracker: {
      pendingActions: actions.filter((item) => item.executionStatus === 'pending').slice(0, 3),
      recentActions: actions.slice(0, 5),
    },
    profileMemory: buildCompatibilityProfileMemory(userProfile, longTermPatterns, legacyProfile),
    sessionMemory: buildCompatibilitySessionMemory(recentSessions, legacySession),
    responsePreference: buildCompatibilityPreference(userProfile, legacyPreference),
    questionHistory: listQuestionHistory(userId, 30),
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
  profile = {},
}) {
  const userId = resolveUserId({ userKey, chart });
  if (!isPremiumTier(memberTier)) {
    return { enabled: false, userKey: userId };
  }

  const existing = getMemberMemory({ userKey: userId, chart, memberTier });
  const recentSession = buildRecentSessionSummary({
    userMessage,
    assistantReply,
    route,
    followUpAnchor,
  });
  const preferencePatch = inferPreferencePatch(userMessage, assistantReply);

  upsertUserProfile(userId, {
    profile,
    chart,
    preferencePatch,
    recentSession,
    existingProfile: existing.userProfile || {},
  });
  insertRecentSession(userId, recentSession);
  appendQuestionHistory(userId, recentSession);
  updateActionTracker(userId, recentSession);
  rebuildLongTermPatterns(userId);

  const latest = getMemberMemory({ userKey: userId, chart, memberTier });
  latest.sessionMemory.lastComparedOptions = uniqStrings([
    ...(latest.sessionMemory.lastComparedOptions || []),
    ...(() => {
      const match = `${userMessage} ${assistantReply}`.match(/(.{1,24})还是(.{1,24})/);
      if (!match) return [];
      return [
        match[1].replace(/[，。、“”"'`]/g, '').trim(),
        match[2].replace(/[，。、“”"'`]/g, '').trim(),
      ];
    })(),
  ]).slice(0, 4);
  latest.sessionMemory.lastTerminologyAsked = textOf(terminologyIntent || latest.sessionMemory.lastTerminologyAsked);

  syncLegacyCompatibility(userId, latest);
  return latest;
}

function buildMemberMemoryContext(memory = {}) {
  if (!memory?.enabled) return '';

  const profile = memory.userProfile || {};
  const recentSessions = Array.isArray(memory.recentSessions) ? memory.recentSessions.slice(0, 3) : [];
  const longTermPatterns = Array.isArray(memory.longTermPatterns) ? memory.longTermPatterns.slice(0, 2) : [];
  const pendingActions = Array.isArray(memory.actionTracker?.pendingActions) ? memory.actionTracker.pendingActions.slice(0, 2) : [];
  const preferenceSummary = buildResponsePreferenceText(memory.responsePreference || {}) || textOf(profile.responsePreference, '未形成');

  const recentBlock = recentSessions.length
    ? recentSessions.map((item, index) => `${index + 1}. 问题：${item.userIssue || '暂无'}；判断：${item.aiJudgment || '暂无'}；动作：${item.aiAction || '暂无'}；未完结：${item.openLoop || '暂无'}`).join('\n')
    : '暂无近期摘要卡。';

  const patternBlock = longTermPatterns.length
    ? longTermPatterns.map((item, index) => `${index + 1}. ${item.patternTitle}：${item.patternSummary}`).join('\n')
    : '暂无稳定长期模式。';

  const actionBlock = pendingActions.length
    ? pendingActions.map((item, index) => `${index + 1}. ${item.actionText}${item.dueHint ? `（建议时机：${item.dueHint}）` : ''}`).join('\n')
    : '暂无待跟进动作。';

  return [
    '【会员专属记忆】',
    `- 用户画像：${textOf(profile.baziSummary || profile.zodiacSummary || profile.decisionStyle, '尚在形成')}`,
    `- 决策风格：${textOf(profile.decisionStyle, '尚在形成')}`,
    `- 情绪模式：${textOf(profile.emotionPattern, '尚在形成')}`,
    `- 关系模式：${textOf(profile.relationshipPattern, '尚在形成')}`,
    `- 金钱模式：${textOf(profile.moneyPattern, '尚在形成')}`,
    `- 回答偏好：${preferenceSummary}`,
    '',
    '【近期相关记忆】',
    recentBlock,
    '',
    '【长期模式】',
    patternBlock,
    '',
    '【动作追踪】',
    actionBlock,
    '',
    '使用原则：先回应用户当下这一次的真实问题，再按需要承接近期记忆、长期模式与未完成动作。命盘倾向只能辅助理解，不要压过用户眼前的现实处境。',
  ].join('\n');
}

function getMemberMemoryAdmin({ userKey, chart, memberTier = 'premium' }) {
  return getMemberMemory({ userKey, chart, memberTier });
}

function listKnownMemoryUsers(limit = 100) {
  return db.prepare(`
    SELECT user_id AS user_key, MAX(updated_at) AS updated_at FROM user_profiles GROUP BY user_id
    UNION
    SELECT user_id AS user_key, MAX(turn_time) AS updated_at FROM memory_recent_sessions GROUP BY user_id
    UNION
    SELECT user_id AS user_key, MAX(updated_at) AS updated_at FROM memory_action_tracker GROUP BY user_id
    UNION
    SELECT user_key AS user_key, MAX(last_conversation_at) AS updated_at FROM member_session_memory GROUP BY user_key
    UNION
    SELECT user_key AS user_key, MAX(created_at) AS updated_at FROM member_question_memory GROUP BY user_key
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(clampNumber(limit, 1, 300, 100));
}

function listMemberMemories({ limit = 100 } = {}) {
  const userRows = listKnownMemoryUsers(limit);
  return userRows.map((row) => {
    const memory = getMemberMemoryAdmin({ userKey: row.user_key });
    return {
      userKey: row.user_key,
      userProfile: memory.userProfile,
      recentSessions: memory.recentSessions,
      longTermPatterns: memory.longTermPatterns,
      actionTracker: memory.actionTracker,
      sessionMemory: memory.sessionMemory,
      profileMemory: memory.profileMemory,
      responsePreference: memory.responsePreference,
      questionCount: memory.questionHistory.length,
      lastUserMessage: memory.recentSessions?.[0]?.userIssue || memory.questionHistory?.[0]?.userMessage || '',
    };
  });
}

module.exports = {
  getMemberMemory,
  updateMemberMemory,
  buildMemberMemoryContext,
  getMemberMemoryAdmin,
  listMemberMemories,
};
