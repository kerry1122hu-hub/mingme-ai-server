import OpenAI from "openai";

const replySchema = require("../schemas/mingkong-ai-reply-v1.schema.json");
const { validateMingKongReplyRequest } = require("./mingkongReplyValidationService");

export interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface ProfileCard {
  user_name?: string | null;
  language: "zh-CN" | "zh-TW" | "en-US" | "en-GB";
  tone_preference:
    | "direct_structured"
    | "warm_reflective"
    | "professional_warm"
    | "gentle_supportive"
    | "concise_clinical";
  time_accuracy: "exact" | "approximate" | "unknown";
  chart_core_summary: {
    sun_sign: string;
    moon_sign: string;
    asc_sign: string | null;
    dominant_planet?: string | null;
    core_tags?: string[];
    core_insights?: string[];
  };
  user_preferences?: {
    answer_length_preference?: "short" | "medium" | "long";
    avoid_fatalism?: boolean;
    prefer_actionable_advice?: boolean;
    prefer_emotional_validation?: boolean;
  };
  guardrails?: {
    avoid_medical_legal_financial_certainty?: boolean;
    mark_time_sensitive_claims?: boolean;
    limit_house_based_claims_when_time_uncertain?: boolean;
  };
}

export interface SemanticTagRef {
  tag_code: string;
  category:
    | "identity"
    | "emotion"
    | "mind"
    | "relationship"
    | "career"
    | "money"
    | "creativity"
    | "family"
    | "social"
    | "growth"
    | "timing"
    | "shadow"
    | "other";
  polarity?: "supportive" | "challenging" | "mixed" | "neutral" | null;
  weight: number;
  confidence: number;
  evidence_refs?: string[];
  qualifiers?: string[];
}

export interface InsightRef {
  insight_code: string;
  category: "strength" | "tension" | "theme" | "opportunity" | "risk" | "growth";
  section:
    | "summary"
    | "personality"
    | "relationships"
    | "career"
    | "money"
    | "family"
    | "growth"
    | "timing"
    | "shadow"
    | "faq";
  confidence: number;
  priority?: number | null;
  tag_refs?: string[];
  evidence_refs: string[];
  summary_hint?: string | null;
}

export interface GuardrailRef {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  affected_scopes?: Array<
    "houses" | "angles" | "timing" | "relationships" | "career" | "money" | "family" | "overall"
  >;
}

export interface SemanticProfile {
  semantic_version: string;
  source_versions?: {
    engine_version?: string;
    rule_version?: string;
    ref_version?: string;
    insight_version?: string;
  };
  top_tags: SemanticTagRef[];
  top_insights: InsightRef[];
  guardrails?: GuardrailRef[];
  confidence_summary?: {
    overall?: number;
    tags?: number;
    insights?: number;
  };
}

export interface IntentPacket {
  user_question: string;
  topic:
    | "personality"
    | "relationships"
    | "career"
    | "money"
    | "family"
    | "growth"
    | "timing"
    | "emotion"
    | "decision"
    | "general";
  goal:
    | "clarify_pattern"
    | "self_understanding"
    | "decision_support"
    | "emotional_support"
    | "action_guidance"
    | "timing_reflection"
    | "relationship_reflection"
    | "career_reflection"
    | "general_consultation";
  desired_output:
    | "short_actionable"
    | "concise_reflective"
    | "structured_analysis"
    | "gentle_support"
    | "decision_framework"
    | "chat_reply";
  emotion_state?: "calm" | "confused" | "tired_confused" | "anxious" | "sad" | "frustrated" | "hopeful" | "urgent" | null;
  priority_tags?: string[];
  priority_insights?: string[];
  constraints?: {
    max_length_chars?: number;
    avoid_repetition?: boolean;
    avoid_followup_question?: boolean;
    must_include_advice?: boolean;
  };
  context_hint?: string | null;
}

export interface SessionState {
  conversation_topic:
    | "personality"
    | "relationships"
    | "career"
    | "money"
    | "family"
    | "growth"
    | "timing"
    | "emotion"
    | "decision"
    | "general";
  turn_index?: number | null;
  already_explained: string[];
  avoid_repetition: boolean;
  max_length_chars: number;
  recent_user_messages?: string[];
  last_answer_summary?: string | null;
  resolved_points?: string[];
  open_questions?: string[];
  should_ask_followup?: boolean | null;
  forbidden_phrases?: string[];
  response_memory?: {
    used_insights?: string[];
    used_tags?: string[];
    last_confidence?: number | null;
  };
}

export interface OutputContract {
  format: string;
  language: "zh-CN" | "zh-TW" | "en-US" | "en-GB";
  length: "short" | "medium" | "long";
  style_profile: string;
  must_use_json_schema_reply?: boolean;
}

export interface MingKongAIRequest {
  user_id: string;
  scene: "chat" | "report_full" | "push_snippet";
  topic?: IntentPacket["topic"];
  profile_card: ProfileCard;
  semantic_profile: SemanticProfile;
  intent_packet: IntentPacket;
  session_state: SessionState;
  output_contract: OutputContract;
  request_meta?: {
    request_id?: string | null;
  };
}

export interface MingKongAIReply {
  answer: {
    conclusion: string;
    explanation: string;
    advice: string;
  };
  used_insights: string[];
  used_tags: string[];
  confidence: number;
  needs_followup: boolean;
  followup_question: string | null;
  safety_flags: Array<
    "none"
    | "time_accuracy_limited"
    | "avoid_fatalism"
    | "avoid_medical_claim"
    | "avoid_financial_claim"
    | "avoid_legal_claim"
  >;
}

export interface GenerateReplyOptions {
  model: string;
  timeoutMs: number;
  maxRetries: number;
  logger: LoggerLike;
}

export class PayloadValidationError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = "PayloadValidationError";
  }
}

export class OpenAIResponseValidationError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = "OpenAIResponseValidationError";
  }
}

const RESPONSE_SCHEMA = {
  name: "mingkong_ai_reply_v1",
  strict: true,
  schema: {
    type: replySchema.type,
    additionalProperties: replySchema.additionalProperties,
    required: replySchema.required,
    properties: replySchema.properties,
  },
};

function textOf(value: unknown, fallback = ""): string {
  return `${value ?? fallback}`.trim();
}

function clip(value: unknown, maxLength: number): string {
  const text = textOf(value);
  if (!text) return "";
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function stripCodeFence(text = ""): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJson(text = ""): unknown {
  const raw = stripCodeFence(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`OpenAI call timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function validateReplyShape(reply: MingKongAIReply): string[] {
  const errors: string[] = [];
  if (!textOf(reply?.answer?.conclusion)) errors.push("answer.conclusion is required");
  if (!textOf(reply?.answer?.explanation)) errors.push("answer.explanation is required");
  if (!textOf(reply?.answer?.advice)) errors.push("answer.advice is required");
  if (!Array.isArray(reply?.used_insights)) errors.push("used_insights must be an array");
  if (!Array.isArray(reply?.used_tags)) errors.push("used_tags must be an array");
  if (typeof reply?.confidence !== "number" || Number.isNaN(reply.confidence)) errors.push("confidence must be a number");
  if (typeof reply?.needs_followup !== "boolean") errors.push("needs_followup must be a boolean");
  if (!(typeof reply?.followup_question === "string" || reply?.followup_question === null)) {
    errors.push("followup_question must be string or null");
  }
  if (!Array.isArray(reply?.safety_flags)) errors.push("safety_flags must be an array");
  return errors;
}

export function buildDeveloperPrompt(): string {
  return `你是“明空”APP 的 AI 星盘解读助手。

你的职责：
1. 你不负责重新计算星盘。
2. 你只基于输入中的 profile_card、semantic_profile、intent_packet、session_state 回答。
3. 你要优先使用 priority_insights 和 priority_tags。
4. 你的回答必须贴合用户当前问题，而不是泛泛分析整张盘。

输出目标：
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
6. 如果信息已足够，则 needs_followup=false，followup_question=null。
7. 你必须只输出符合 schema 的 JSON，不要输出额外文本。`;
}

export function normalizeReply(candidate: any): MingKongAIReply {
  const answer = candidate?.answer || {};
  const normalized: MingKongAIReply = {
    answer: {
      conclusion: clip(answer?.conclusion, 180),
      explanation: clip(answer?.explanation, 500),
      advice: clip(answer?.advice, 220),
    },
    used_insights: Array.isArray(candidate?.used_insights)
      ? candidate.used_insights.map((item: unknown) => textOf(item)).filter(Boolean).slice(0, 3)
      : [],
    used_tags: Array.isArray(candidate?.used_tags)
      ? candidate.used_tags.map((item: unknown) => textOf(item)).filter(Boolean).slice(0, 5)
      : [],
    confidence: Math.max(0, Math.min(1, Number(candidate?.confidence || 0))),
    needs_followup: Boolean(candidate?.needs_followup),
    followup_question: candidate?.followup_question == null ? null : clip(candidate?.followup_question, 120),
    safety_flags: Array.isArray(candidate?.safety_flags)
      ? candidate.safety_flags.map((item: unknown) => textOf(item)).filter(Boolean).slice(0, 6) as MingKongAIReply["safety_flags"]
      : ["none"],
  };

  if (!normalized.safety_flags.length) {
    normalized.safety_flags = ["none"];
  }

  if (!normalized.needs_followup) {
    normalized.followup_question = null;
  }

  return normalized;
}

export function validateMingKongAIRequest(input: MingKongAIRequest): MingKongAIRequest {
  const validation = validateMingKongReplyRequest(input);
  if (!validation?.ok) {
    throw new PayloadValidationError("Invalid MingKong AI request payload", validation?.errors || []);
  }
  return JSON.parse(JSON.stringify(input));
}

export async function generateMingKongReply(
  client: OpenAI,
  input: MingKongAIRequest,
  options: GenerateReplyOptions,
): Promise<MingKongAIReply> {
  const validated = validateMingKongAIRequest(input);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      options.logger.info({ attempt, model: options.model }, "MingKong reply generation started");
      const response = await withTimeout(
        client.chat.completions.create({
          model: options.model,
          messages: [
            { role: "developer", content: buildDeveloperPrompt() },
            { role: "user", content: JSON.stringify(validated) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: RESPONSE_SCHEMA,
          },
        }),
        options.timeoutMs,
      );

      const message = response?.choices?.[0]?.message;
      if (message?.refusal) {
        throw new OpenAIResponseValidationError(message.refusal, { refusal: message.refusal });
      }

      const parsed = parseJson(message?.content || "");
      if (!parsed) {
        throw new OpenAIResponseValidationError("OpenAI returned non-JSON content");
      }

      const normalized = normalizeReply(parsed);
      const shapeErrors = validateReplyShape(normalized);
      if (shapeErrors.length) {
        throw new OpenAIResponseValidationError("OpenAI reply failed validation", shapeErrors);
      }

      return normalized;
    } catch (error) {
      lastError = error;
      options.logger.warn({ attempt, error: error instanceof Error ? error.message : String(error) }, "MingKong reply generation failed");
      if (attempt >= options.maxRetries) {
        break;
      }
    }
  }

  if (lastError instanceof OpenAIResponseValidationError) {
    throw lastError;
  }

  if (lastError instanceof PayloadValidationError) {
    throw lastError;
  }

  throw new Error(lastError instanceof Error ? lastError.message : "Unknown OpenAI call failure");
}
