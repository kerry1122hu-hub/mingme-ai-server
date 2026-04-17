const SIGN_CODES = new Set([
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
]);

const POINT_CODES = new Set([
  'SUN',
  'MOON',
  'MERCURY',
  'VENUS',
  'MARS',
  'JUPITER',
  'SATURN',
  'URANUS',
  'NEPTUNE',
  'PLUTO',
  'CHIRON',
  'TRUE_NODE',
  'MEAN_NODE',
  'SOUTH_NODE',
  'ASC',
  'DSC',
  'MC',
  'IC',
  'PART_OF_FORTUNE',
]);

const LANGUAGES = new Set(['zh-CN', 'zh-TW', 'en-US', 'en-GB']);
const TONE_PREFERENCES = new Set([
  'direct_structured',
  'warm_reflective',
  'professional_warm',
  'gentle_supportive',
  'concise_clinical',
]);
const TIME_ACCURACY = new Set(['exact', 'approximate', 'unknown']);
const ANSWER_LENGTH_PREFERENCES = new Set(['short', 'medium', 'long']);
const TOPICS = new Set([
  'personality',
  'relationships',
  'career',
  'money',
  'family',
  'growth',
  'timing',
  'emotion',
  'decision',
  'general',
]);
const GOALS = new Set([
  'clarify_pattern',
  'self_understanding',
  'decision_support',
  'emotional_support',
  'action_guidance',
  'timing_reflection',
  'relationship_reflection',
  'career_reflection',
  'general_consultation',
]);
const DESIRED_OUTPUTS = new Set([
  'short_actionable',
  'concise_reflective',
  'structured_analysis',
  'gentle_support',
  'decision_framework',
  'chat_reply',
]);
const EMOTION_STATES = new Set([
  'calm',
  'confused',
  'tired_confused',
  'anxious',
  'sad',
  'frustrated',
  'hopeful',
  'urgent',
  null,
]);
const SEMANTIC_CATEGORIES = new Set([
  'identity',
  'emotion',
  'mind',
  'relationship',
  'career',
  'money',
  'creativity',
  'family',
  'social',
  'growth',
  'timing',
  'shadow',
  'other',
]);
const POLARITIES = new Set(['supportive', 'challenging', 'mixed', 'neutral', null]);
const INSIGHT_CATEGORIES = new Set(['strength', 'tension', 'theme', 'opportunity', 'risk', 'growth']);
const INSIGHT_SECTIONS = new Set([
  'summary',
  'personality',
  'relationships',
  'career',
  'money',
  'family',
  'growth',
  'timing',
  'shadow',
  'faq',
]);
const GUARDRail_SEVERITIES = new Set(['info', 'warning', 'critical']);
const GUARDRail_SCOPES = new Set(['houses', 'angles', 'timing', 'relationships', 'career', 'money', 'family', 'overall']);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function addError(errors, path, message) {
  errors.push(`${path} ${message}`);
}

function validateString(value, path, errors, options = {}) {
  const {
    minLength = 0,
    maxLength = null,
    nullable = false,
    required = true,
    pattern = null,
  } = options;

  if (value == null) {
    if (required && !nullable) {
      addError(errors, path, 'is required');
    }
    return;
  }

  if (typeof value !== 'string') {
    addError(errors, path, 'must be a string');
    return;
  }

  if (value.length < minLength) {
    addError(errors, path, `must be at least ${minLength} characters`);
  }

  if (typeof maxLength === 'number' && value.length > maxLength) {
    addError(errors, path, `must be at most ${maxLength} characters`);
  }

  if (pattern && !pattern.test(value)) {
    addError(errors, path, 'has invalid format');
  }
}

function validateEnum(value, path, errors, allowed, options = {}) {
  const { nullable = false, required = true } = options;

  if (value == null) {
    if (required && !nullable) {
      addError(errors, path, 'is required');
    }
    return;
  }

  if (!allowed.has(value)) {
    addError(errors, path, `must be one of: ${Array.from(allowed).filter((item) => item !== null).join(', ')}`);
  }
}

function validateNumber(value, path, errors, options = {}) {
  const {
    min = null,
    max = null,
    nullable = false,
    required = true,
    integer = false,
  } = options;

  if (value == null) {
    if (required && !nullable) {
      addError(errors, path, 'is required');
    }
    return;
  }

  if (!isFiniteNumber(value)) {
    addError(errors, path, 'must be a number');
    return;
  }

  if (integer && !Number.isInteger(value)) {
    addError(errors, path, 'must be an integer');
  }

  if (min != null && value < min) {
    addError(errors, path, `must be >= ${min}`);
  }

  if (max != null && value > max) {
    addError(errors, path, `must be <= ${max}`);
  }
}

function validateBoolean(value, path, errors, options = {}) {
  const { required = true, nullable = false } = options;

  if (value == null) {
    if (required && !nullable) {
      addError(errors, path, 'is required');
    }
    return;
  }

  if (typeof value !== 'boolean') {
    addError(errors, path, 'must be a boolean');
  }
}

function validateStringArray(value, path, errors, options = {}) {
  const {
    required = false,
    minItems = 0,
    maxItems = null,
    minLength = 0,
    maxLength = null,
    pattern = null,
  } = options;

  if (value == null) {
    if (required) {
      addError(errors, path, 'is required');
    }
    return;
  }

  if (!Array.isArray(value)) {
    addError(errors, path, 'must be an array');
    return;
  }

  if (value.length < minItems) {
    addError(errors, path, `must contain at least ${minItems} items`);
  }

  if (typeof maxItems === 'number' && value.length > maxItems) {
    addError(errors, path, `must contain at most ${maxItems} items`);
  }

  value.forEach((item, index) => {
    validateString(item, `${path}[${index}]`, errors, {
      minLength,
      maxLength,
      pattern,
    });
  });
}

function validateStrictObject(value, path, errors, allowedKeys, options = {}) {
  const { required = true } = options;

  if (value == null) {
    if (required) {
      addError(errors, path, 'is required');
    }
    return false;
  }

  if (!isObject(value)) {
    addError(errors, path, 'must be an object');
    return false;
  }

  Object.keys(value).forEach((key) => {
    if (!allowedKeys.includes(key)) {
      addError(errors, `${path}.${key}`, 'is not allowed');
    }
  });

  return true;
}

function validateBalanceObject(value, path, errors, keys) {
  if (!validateStrictObject(value, path, errors, keys, { required: false })) {
    return;
  }

  keys.forEach((key) => {
    validateNumber(value[key], `${path}.${key}`, errors, { min: 0, max: 1 });
  });
}

function validateProfileCard(value) {
  const errors = [];
  const allowedKeys = ['user_name', 'language', 'tone_preference', 'time_accuracy', 'chart_core_summary', 'user_preferences', 'guardrails'];

  if (!validateStrictObject(value, 'profile_card', errors, allowedKeys)) {
    return { ok: false, errors };
  }

  validateString(value.user_name, 'profile_card.user_name', errors, { minLength: 1, maxLength: 40, nullable: true, required: false });
  validateEnum(value.language, 'profile_card.language', errors, LANGUAGES);
  validateEnum(value.tone_preference, 'profile_card.tone_preference', errors, TONE_PREFERENCES);
  validateEnum(value.time_accuracy, 'profile_card.time_accuracy', errors, TIME_ACCURACY);

  const summaryKeys = ['sun_sign', 'moon_sign', 'asc_sign', 'dominant_planet', 'element_balance', 'modality_balance', 'core_tags', 'core_insights'];
  if (validateStrictObject(value.chart_core_summary, 'profile_card.chart_core_summary', errors, summaryKeys)) {
    validateEnum(value.chart_core_summary.sun_sign, 'profile_card.chart_core_summary.sun_sign', errors, SIGN_CODES);
    validateEnum(value.chart_core_summary.moon_sign, 'profile_card.chart_core_summary.moon_sign', errors, SIGN_CODES);
    validateEnum(value.chart_core_summary.asc_sign, 'profile_card.chart_core_summary.asc_sign', errors, SIGN_CODES, { nullable: true });
    validateEnum(value.chart_core_summary.dominant_planet, 'profile_card.chart_core_summary.dominant_planet', errors, POINT_CODES, {
      nullable: true,
      required: false,
    });
    validateBalanceObject(value.chart_core_summary.element_balance, 'profile_card.chart_core_summary.element_balance', errors, ['fire', 'earth', 'air', 'water']);
    validateBalanceObject(value.chart_core_summary.modality_balance, 'profile_card.chart_core_summary.modality_balance', errors, ['cardinal', 'fixed', 'mutable']);
    validateStringArray(value.chart_core_summary.core_tags, 'profile_card.chart_core_summary.core_tags', errors, {
      required: false,
      maxItems: 8,
      pattern: /^[a-z0-9_]+$/,
    });
    validateStringArray(value.chart_core_summary.core_insights, 'profile_card.chart_core_summary.core_insights', errors, {
      required: false,
      maxItems: 6,
      pattern: /^[a-z0-9_]+$/,
    });
  }

  if (value.user_preferences != null) {
    const preferenceKeys = [
      'answer_length_preference',
      'avoid_fatalism',
      'prefer_actionable_advice',
      'prefer_emotional_validation',
    ];
    if (validateStrictObject(value.user_preferences, 'profile_card.user_preferences', errors, preferenceKeys, { required: false })) {
      validateEnum(value.user_preferences.answer_length_preference, 'profile_card.user_preferences.answer_length_preference', errors, ANSWER_LENGTH_PREFERENCES, { required: false });
      validateBoolean(value.user_preferences.avoid_fatalism, 'profile_card.user_preferences.avoid_fatalism', errors, { required: false });
      validateBoolean(value.user_preferences.prefer_actionable_advice, 'profile_card.user_preferences.prefer_actionable_advice', errors, { required: false });
      validateBoolean(value.user_preferences.prefer_emotional_validation, 'profile_card.user_preferences.prefer_emotional_validation', errors, { required: false });
    }
  }

  if (value.guardrails != null) {
    const guardrailKeys = [
      'avoid_medical_legal_financial_certainty',
      'mark_time_sensitive_claims',
      'limit_house_based_claims_when_time_uncertain',
    ];
    if (validateStrictObject(value.guardrails, 'profile_card.guardrails', errors, guardrailKeys, { required: false })) {
      validateBoolean(value.guardrails.avoid_medical_legal_financial_certainty, 'profile_card.guardrails.avoid_medical_legal_financial_certainty', errors, { required: false });
      validateBoolean(value.guardrails.mark_time_sensitive_claims, 'profile_card.guardrails.mark_time_sensitive_claims', errors, { required: false });
      validateBoolean(value.guardrails.limit_house_based_claims_when_time_uncertain, 'profile_card.guardrails.limit_house_based_claims_when_time_uncertain', errors, { required: false });
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateSemanticProfile(value) {
  const errors = [];
  const allowedKeys = ['semantic_version', 'source_versions', 'top_tags', 'top_insights', 'guardrails', 'confidence_summary'];

  if (!validateStrictObject(value, 'semantic_profile', errors, allowedKeys)) {
    return { ok: false, errors };
  }

  validateString(value.semantic_version, 'semantic_profile.semantic_version', errors, { minLength: 1, maxLength: 50 });

  if (value.source_versions != null) {
    const sourceKeys = ['engine_version', 'rule_version', 'ref_version', 'insight_version'];
    if (validateStrictObject(value.source_versions, 'semantic_profile.source_versions', errors, sourceKeys, { required: false })) {
      sourceKeys.forEach((key) => {
        validateString(value.source_versions[key], `semantic_profile.source_versions.${key}`, errors, {
          required: false,
          minLength: 1,
          maxLength: 50,
        });
      });
    }
  }

  if (!Array.isArray(value.top_tags)) {
    addError(errors, 'semantic_profile.top_tags', 'must be an array');
  } else {
    if (value.top_tags.length < 1) {
      addError(errors, 'semantic_profile.top_tags', 'must contain at least 1 items');
    }
    if (value.top_tags.length > 20) {
      addError(errors, 'semantic_profile.top_tags', 'must contain at most 20 items');
    }
    value.top_tags.forEach((tag, index) => {
      const path = `semantic_profile.top_tags[${index}]`;
      const tagKeys = ['tag_code', 'category', 'polarity', 'weight', 'confidence', 'evidence_refs', 'qualifiers'];
      if (!validateStrictObject(tag, path, errors, tagKeys)) {
        return;
      }
      validateString(tag.tag_code, `${path}.tag_code`, errors, { minLength: 1, maxLength: 80, pattern: /^[a-z0-9_]+$/ });
      validateEnum(tag.category, `${path}.category`, errors, SEMANTIC_CATEGORIES);
      validateEnum(tag.polarity, `${path}.polarity`, errors, POLARITIES, { nullable: true, required: false });
      validateNumber(tag.weight, `${path}.weight`, errors, { min: 0, max: 1 });
      validateNumber(tag.confidence, `${path}.confidence`, errors, { min: 0, max: 1 });
      validateStringArray(tag.evidence_refs, `${path}.evidence_refs`, errors, { required: false, maxItems: 8, minLength: 1, maxLength: 120 });
      validateStringArray(tag.qualifiers, `${path}.qualifiers`, errors, { required: false, maxItems: 6, maxLength: 80 });
    });
  }

  if (!Array.isArray(value.top_insights)) {
    addError(errors, 'semantic_profile.top_insights', 'must be an array');
  } else {
    if (value.top_insights.length < 1) {
      addError(errors, 'semantic_profile.top_insights', 'must contain at least 1 items');
    }
    if (value.top_insights.length > 12) {
      addError(errors, 'semantic_profile.top_insights', 'must contain at most 12 items');
    }
    value.top_insights.forEach((insight, index) => {
      const path = `semantic_profile.top_insights[${index}]`;
      const insightKeys = ['insight_code', 'category', 'section', 'confidence', 'priority', 'tag_refs', 'evidence_refs', 'summary_hint'];
      if (!validateStrictObject(insight, path, errors, insightKeys)) {
        return;
      }
      validateString(insight.insight_code, `${path}.insight_code`, errors, { minLength: 1, maxLength: 100, pattern: /^[a-z0-9_]+$/ });
      validateEnum(insight.category, `${path}.category`, errors, INSIGHT_CATEGORIES);
      validateEnum(insight.section, `${path}.section`, errors, INSIGHT_SECTIONS);
      validateNumber(insight.confidence, `${path}.confidence`, errors, { min: 0, max: 1 });
      validateNumber(insight.priority, `${path}.priority`, errors, { min: 1, max: 10, integer: true, nullable: true, required: false });
      validateStringArray(insight.tag_refs, `${path}.tag_refs`, errors, { required: false, maxItems: 8, pattern: /^[a-z0-9_]+$/ });
      validateStringArray(insight.evidence_refs, `${path}.evidence_refs`, errors, { required: true, minItems: 1, maxItems: 12, minLength: 1, maxLength: 120 });
      validateString(insight.summary_hint, `${path}.summary_hint`, errors, { required: false, nullable: true, maxLength: 180 });
    });
  }

  if (value.guardrails != null) {
    if (!Array.isArray(value.guardrails)) {
      addError(errors, 'semantic_profile.guardrails', 'must be an array');
    } else {
      if (value.guardrails.length > 10) {
        addError(errors, 'semantic_profile.guardrails', 'must contain at most 10 items');
      }
      value.guardrails.forEach((guardrail, index) => {
        const path = `semantic_profile.guardrails[${index}]`;
        const guardrailKeys = ['code', 'severity', 'message', 'affected_scopes'];
        if (!validateStrictObject(guardrail, path, errors, guardrailKeys)) {
          return;
        }
        validateString(guardrail.code, `${path}.code`, errors, { minLength: 1, maxLength: 80, pattern: /^[A-Z0-9_]+$/ });
        validateEnum(guardrail.severity, `${path}.severity`, errors, GUARDRail_SEVERITIES);
        validateString(guardrail.message, `${path}.message`, errors, { minLength: 1, maxLength: 220 });
        if (guardrail.affected_scopes != null) {
          if (!Array.isArray(guardrail.affected_scopes)) {
            addError(errors, `${path}.affected_scopes`, 'must be an array');
          } else {
            if (guardrail.affected_scopes.length > 8) {
              addError(errors, `${path}.affected_scopes`, 'must contain at most 8 items');
            }
            guardrail.affected_scopes.forEach((scope, scopeIndex) => {
              validateEnum(scope, `${path}.affected_scopes[${scopeIndex}]`, errors, GUARDRail_SCOPES);
            });
          }
        }
      });
    }
  }

  if (value.confidence_summary != null) {
    const confidenceKeys = ['overall', 'tags', 'insights'];
    if (validateStrictObject(value.confidence_summary, 'semantic_profile.confidence_summary', errors, confidenceKeys, { required: false })) {
      validateNumber(value.confidence_summary.overall, 'semantic_profile.confidence_summary.overall', errors, { min: 0, max: 1, required: false });
      validateNumber(value.confidence_summary.tags, 'semantic_profile.confidence_summary.tags', errors, { min: 0, max: 1, required: false });
      validateNumber(value.confidence_summary.insights, 'semantic_profile.confidence_summary.insights', errors, { min: 0, max: 1, required: false });
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateIntentPacket(value) {
  const errors = [];
  const allowedKeys = [
    'user_question',
    'topic',
    'goal',
    'desired_output',
    'emotion_state',
    'priority_tags',
    'priority_insights',
    'constraints',
    'context_hint',
  ];

  if (!validateStrictObject(value, 'intent_packet', errors, allowedKeys)) {
    return { ok: false, errors };
  }

  validateString(value.user_question, 'intent_packet.user_question', errors, { minLength: 1, maxLength: 1000 });
  validateEnum(value.topic, 'intent_packet.topic', errors, TOPICS);
  validateEnum(value.goal, 'intent_packet.goal', errors, GOALS);
  validateEnum(value.desired_output, 'intent_packet.desired_output', errors, DESIRED_OUTPUTS);
  validateEnum(value.emotion_state, 'intent_packet.emotion_state', errors, EMOTION_STATES, { nullable: true, required: false });
  validateStringArray(value.priority_tags, 'intent_packet.priority_tags', errors, { required: false, maxItems: 8, pattern: /^[a-z0-9_]+$/ });
  validateStringArray(value.priority_insights, 'intent_packet.priority_insights', errors, { required: false, maxItems: 5, pattern: /^[a-z0-9_]+$/ });
  validateString(value.context_hint, 'intent_packet.context_hint', errors, { maxLength: 500, nullable: true, required: false });

  if (value.constraints != null) {
    const constraintKeys = ['max_length_chars', 'avoid_repetition', 'avoid_followup_question', 'must_include_advice'];
    if (validateStrictObject(value.constraints, 'intent_packet.constraints', errors, constraintKeys, { required: false })) {
      validateNumber(value.constraints.max_length_chars, 'intent_packet.constraints.max_length_chars', errors, { min: 60, max: 2000, integer: true, required: false });
      validateBoolean(value.constraints.avoid_repetition, 'intent_packet.constraints.avoid_repetition', errors, { required: false });
      validateBoolean(value.constraints.avoid_followup_question, 'intent_packet.constraints.avoid_followup_question', errors, { required: false });
      validateBoolean(value.constraints.must_include_advice, 'intent_packet.constraints.must_include_advice', errors, { required: false });
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateSessionState(value) {
  const errors = [];
  const allowedKeys = [
    'conversation_topic',
    'turn_index',
    'already_explained',
    'avoid_repetition',
    'max_length_chars',
    'recent_user_messages',
    'last_answer_summary',
    'resolved_points',
    'open_questions',
    'should_ask_followup',
    'forbidden_phrases',
    'response_memory',
  ];

  if (!validateStrictObject(value, 'session_state', errors, allowedKeys)) {
    return { ok: false, errors };
  }

  validateEnum(value.conversation_topic, 'session_state.conversation_topic', errors, TOPICS);
  validateNumber(value.turn_index, 'session_state.turn_index', errors, { min: 1, max: 9999, integer: true, nullable: true, required: false });
  validateStringArray(value.already_explained, 'session_state.already_explained', errors, { required: true, maxItems: 10, minLength: 1, maxLength: 220 });
  validateBoolean(value.avoid_repetition, 'session_state.avoid_repetition', errors);
  validateNumber(value.max_length_chars, 'session_state.max_length_chars', errors, { min: 60, max: 2000, integer: true });
  validateStringArray(value.recent_user_messages, 'session_state.recent_user_messages', errors, { required: false, maxItems: 5, minLength: 1, maxLength: 500 });
  validateString(value.last_answer_summary, 'session_state.last_answer_summary', errors, { required: false, nullable: true, maxLength: 300 });
  validateStringArray(value.resolved_points, 'session_state.resolved_points', errors, { required: false, maxItems: 8, maxLength: 120 });
  validateStringArray(value.open_questions, 'session_state.open_questions', errors, { required: false, maxItems: 5, maxLength: 120 });
  validateBoolean(value.should_ask_followup, 'session_state.should_ask_followup', errors, { required: false, nullable: true });
  validateStringArray(value.forbidden_phrases, 'session_state.forbidden_phrases', errors, { required: false, maxItems: 10, maxLength: 60 });

  if (value.response_memory != null) {
    const memoryKeys = ['used_insights', 'used_tags', 'last_confidence'];
    if (validateStrictObject(value.response_memory, 'session_state.response_memory', errors, memoryKeys, { required: false })) {
      validateStringArray(value.response_memory.used_insights, 'session_state.response_memory.used_insights', errors, {
        required: false,
        maxItems: 6,
        pattern: /^[a-z0-9_]+$/,
      });
      validateStringArray(value.response_memory.used_tags, 'session_state.response_memory.used_tags', errors, {
        required: false,
        maxItems: 10,
        pattern: /^[a-z0-9_]+$/,
      });
      validateNumber(value.response_memory.last_confidence, 'session_state.response_memory.last_confidence', errors, {
        required: false,
        nullable: true,
        min: 0,
        max: 1,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateOutputContract(value) {
  const errors = [];

  if (!isObject(value)) {
    addError(errors, 'output_contract', 'is required');
    return { ok: false, errors };
  }

  return { ok: true, errors };
}

function validateMingKongReplyRequest(payload) {
  const errors = [];

  if (!isObject(payload)) {
    return { ok: false, errors: ['request body must be an object'] };
  }

  const profileValidation = validateProfileCard(payload.profile_card);
  const semanticValidation = validateSemanticProfile(payload.semantic_profile);
  const intentValidation = validateIntentPacket(payload.intent_packet);
  const sessionValidation = validateSessionState(payload.session_state);
  const outputValidation = validateOutputContract(payload.output_contract);

  errors.push(...profileValidation.errors);
  errors.push(...semanticValidation.errors);
  errors.push(...intentValidation.errors);
  errors.push(...sessionValidation.errors);
  errors.push(...outputValidation.errors);

  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateProfileCard,
  validateSemanticProfile,
  validateIntentPacket,
  validateSessionState,
  validateMingKongReplyRequest,
};
