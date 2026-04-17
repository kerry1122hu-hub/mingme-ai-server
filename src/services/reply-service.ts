import OpenAI from "openai";
import {
  generateMingKongReply,
  LoggerLike,
  MingKongAIRequest,
  MingKongAIReply,
  PayloadValidationError,
  OpenAIResponseValidationError
} from "./openai-payload-builder";

export interface ReplyServiceOptions {
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: LoggerLike;
  fallbackEnabled?: boolean;
}

export interface ReplyServiceResult {
  ok: boolean;
  source: "openai" | "fallback";
  reply: MingKongAIReply;
  meta: {
    request_id: string | null;
    user_id: string;
    scene: MingKongAIRequest["scene"];
    topic: string;
    used_fallback: boolean;
    model?: string;
  };
}

export class ReplyServiceError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_REQUEST"
      | "OPENAI_RESPONSE_INVALID"
      | "OPENAI_CALL_FAILED"
      | "UNKNOWN_ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "ReplyServiceError";
  }
}

const defaultLogger: LoggerLike = {
  info(obj, msg) {
    console.log(msg || "info", obj);
  },
  warn(obj, msg) {
    console.warn(msg || "warn", obj);
  },
  error(obj, msg) {
    console.error(msg || "error", obj);
  }
};

export class ReplyService {
  private client: OpenAI;
  private logger: LoggerLike;
  private options: Required<ReplyServiceOptions>;

  constructor(client: OpenAI, options: ReplyServiceOptions = {}) {
    this.client = client;
    this.logger = options.logger || defaultLogger;
    this.options = {
      model: options.model || process.env.OPENAI_MODEL || "gpt-5",
      timeoutMs: options.timeoutMs ?? 20_000,
      maxRetries: Math.max(0, Math.min(options.maxRetries ?? 1, 1)),
      logger: this.logger,
      fallbackEnabled: options.fallbackEnabled ?? true
    };
  }

  async reply(input: MingKongAIRequest): Promise<ReplyServiceResult> {
    const prepared = this.prepareRequest(input);

    try {
      const reply = await generateMingKongReply(this.client, prepared, {
        model: this.options.model,
        timeoutMs: this.options.timeoutMs,
        maxRetries: this.options.maxRetries,
        logger: this.logger
      });

      const normalized = this.postProcessReply(reply, prepared);

      return {
        ok: true,
        source: "openai",
        reply: normalized,
        meta: {
          request_id: prepared.request_meta?.request_id ?? null,
          user_id: prepared.user_id,
          scene: prepared.scene,
          topic: prepared.topic ?? prepared.intent_packet.topic,
          used_fallback: false,
          model: this.options.model
        }
      };
    } catch (error) {
      this.logger.warn(
        {
          request_id: prepared.request_meta?.request_id ?? null,
          user_id: prepared.user_id,
          error: error instanceof Error ? error.message : String(error)
        },
        "ReplyService primary generation failed"
      );

      if (this.options.fallbackEnabled) {
        const fallback = this.buildFallbackReply(prepared, error);
        return {
          ok: true,
          source: "fallback",
          reply: fallback,
          meta: {
            request_id: prepared.request_meta?.request_id ?? null,
            user_id: prepared.user_id,
            scene: prepared.scene,
            topic: prepared.topic ?? prepared.intent_packet.topic,
            used_fallback: true,
            model: this.options.model
          }
        };
      }

      throw this.mapError(error);
    }
  }

  private prepareRequest(input: MingKongAIRequest): MingKongAIRequest {
    const cloned: MingKongAIRequest = JSON.parse(JSON.stringify(input));
    const topic = cloned.topic ?? cloned.intent_packet.topic;

    cloned.topic = topic;

    if (cloned.scene === "push_snippet") {
      cloned.output_contract.length = "short";
      cloned.session_state.max_length_chars = Math.min(
        cloned.session_state.max_length_chars,
        160
      );
    }

    if (cloned.scene === "report_full" && cloned.output_contract.length === "short") {
      cloned.output_contract.length = "medium";
    }

    cloned.semantic_profile.top_tags = this.filterTagsByTopic(
      cloned.semantic_profile.top_tags,
      topic,
      cloned.intent_packet.priority_tags
    );

    cloned.semantic_profile.top_insights = this.filterInsightsByTopic(
      cloned.semantic_profile.top_insights,
      topic,
      cloned.intent_packet.priority_insights
    );

    if (cloned.profile_card.time_accuracy !== "exact") {
      cloned.semantic_profile.top_insights = this.dropTimeSensitiveInsights(
        cloned.semantic_profile.top_insights
      );
    }

    if (cloned.intent_packet.constraints?.max_length_chars) {
      cloned.session_state.max_length_chars = Math.min(
        cloned.session_state.max_length_chars,
        cloned.intent_packet.constraints.max_length_chars
      );
    }

    cloned.session_state.recent_user_messages =
      cloned.session_state.recent_user_messages?.slice(-3) || [];

    cloned.session_state.already_explained =
      cloned.session_state.already_explained?.slice(-5) || [];

    return cloned;
  }

  private filterTagsByTopic(
    tags: MingKongAIRequest["semantic_profile"]["top_tags"],
    topic: string,
    priorityTags?: string[]
  ) {
    const allowedCategories = this.topicToCategories(topic);
    const priority = new Set(priorityTags || []);

    const sorted = [...tags].sort((a, b) => {
      const aPriority = priority.has(a.tag_code) ? 1 : 0;
      const bPriority = priority.has(b.tag_code) ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return b.weight * b.confidence - a.weight * a.confidence;
    });

    const filtered = sorted.filter(
      (tag) =>
        priority.has(tag.tag_code) ||
        allowedCategories.has(tag.category) ||
        tag.category === "other"
    );

    return filtered.slice(0, 8);
  }

  private filterInsightsByTopic(
    insights: MingKongAIRequest["semantic_profile"]["top_insights"],
    topic: string,
    priorityInsights?: string[]
  ) {
    const priority = new Set(priorityInsights || []);
    const allowedSections = this.topicToSections(topic);

    const sorted = [...insights].sort((a, b) => {
      const aPriority = priority.has(a.insight_code) ? 1 : 0;
      const bPriority = priority.has(b.insight_code) ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return b.confidence - a.confidence;
    });

    const filtered = sorted.filter(
      (insight) =>
        priority.has(insight.insight_code) ||
        allowedSections.has(insight.section)
    );

    return filtered.slice(0, 5);
  }

  private dropTimeSensitiveInsights(
    insights: MingKongAIRequest["semantic_profile"]["top_insights"]
  ) {
    const blockedSections = new Set(["timing"]);
    const blockedPatterns = [
      "career_benefits_from_visibility",
      "roots_shape_long_term_choices",
      "this_period_supports_acceleration",
      "this_period_requires_consolidation"
    ];

    return insights.filter((insight) => {
      if (blockedSections.has(insight.section)) return false;
      if (blockedPatterns.includes(insight.insight_code)) return false;
      return true;
    });
  }

  private topicToCategories(topic: string): Set<string> {
    switch (topic) {
      case "relationships":
        return new Set(["relationship", "emotion", "family", "shadow", "growth"]);
      case "career":
        return new Set(["career", "social", "money", "growth", "shadow"]);
      case "money":
        return new Set(["money", "career", "growth", "shadow"]);
      case "family":
        return new Set(["family", "emotion", "relationship", "growth"]);
      case "timing":
        return new Set(["timing", "growth", "career", "relationship"]);
      case "emotion":
        return new Set(["emotion", "identity", "shadow", "growth"]);
      case "decision":
        return new Set(["growth", "mind", "career", "relationship", "money"]);
      case "personality":
        return new Set(["identity", "emotion", "mind", "growth", "shadow"]);
      case "growth":
        return new Set(["growth", "shadow", "identity", "emotion"]);
      case "general":
      default:
        return new Set([
          "identity",
          "emotion",
          "mind",
          "relationship",
          "career",
          "money",
          "family",
          "growth",
          "shadow"
        ]);
    }
  }

  private topicToSections(topic: string): Set<string> {
    switch (topic) {
      case "relationships":
        return new Set(["relationships", "family", "shadow", "summary"]);
      case "career":
        return new Set(["career", "money", "growth", "summary"]);
      case "money":
        return new Set(["money", "career", "growth", "summary"]);
      case "family":
        return new Set(["family", "relationships", "personality", "summary"]);
      case "timing":
        return new Set(["timing", "growth", "summary"]);
      case "emotion":
        return new Set(["personality", "shadow", "growth", "summary"]);
      case "decision":
        return new Set(["growth", "career", "relationships", "money", "summary"]);
      case "personality":
        return new Set(["personality", "shadow", "growth", "summary"]);
      case "growth":
        return new Set(["growth", "shadow", "personality", "summary"]);
      case "general":
      default:
        return new Set([
          "summary",
          "personality",
          "relationships",
          "career",
          "money",
          "family",
          "growth",
          "shadow"
        ]);
    }
  }

  private postProcessReply(
    reply: MingKongAIReply,
    request: MingKongAIRequest
  ): MingKongAIReply {
    const normalized: MingKongAIReply = JSON.parse(JSON.stringify(reply));

    if (!normalized.safety_flags || normalized.safety_flags.length === 0) {
      normalized.safety_flags = ["none"];
    }

    if (request.profile_card.time_accuracy !== "exact") {
      if (!normalized.safety_flags.includes("time_accuracy_limited")) {
        normalized.safety_flags.push("time_accuracy_limited");
      }
    }

    if (!normalized.safety_flags.includes("avoid_fatalism")) {
      normalized.safety_flags.push("avoid_fatalism");
    }

    normalized.used_insights = Array.from(new Set(normalized.used_insights)).slice(0, 3);
    normalized.used_tags = Array.from(new Set(normalized.used_tags)).slice(0, 5);

    if (request.intent_packet.constraints?.avoid_followup_question) {
      normalized.needs_followup = false;
      normalized.followup_question = null;
    }

    normalized.answer.conclusion = this.trimText(
      normalized.answer.conclusion,
      180
    );
    normalized.answer.explanation = this.trimText(
      normalized.answer.explanation,
      Math.min(500, request.session_state.max_length_chars)
    );
    normalized.answer.advice = this.trimText(
      normalized.answer.advice,
      220
    );

    normalized.confidence = Math.max(0, Math.min(1, normalized.confidence));

    return normalized;
  }

  private trimText(text: string, max: number): string {
    if (!text) return "";
    return text.length <= max ? text : text.slice(0, max).trim();
  }

  private buildFallbackReply(
    request: MingKongAIRequest,
    error: unknown
  ): MingKongAIReply {
    const topic = request.topic ?? request.intent_packet.topic;
    const topInsight = request.semantic_profile.top_insights[0]?.insight_code ?? null;
    const topTags = (request.semantic_profile.top_tags || [])
      .slice(0, 3)
      .map((t) => t.tag_code);

    const safetyFlags: MingKongAIReply["safety_flags"] = ["avoid_fatalism"];
    if (request.profile_card.time_accuracy !== "exact") {
      safetyFlags.push("time_accuracy_limited");
    }

    const genericByTopic = this.fallbackTextByTopic(topic);

    return {
      answer: {
        conclusion: genericByTopic.conclusion,
        explanation: genericByTopic.explanation,
        advice: genericByTopic.advice
      },
      used_insights: topInsight ? [topInsight] : [],
      used_tags: topTags,
      confidence: 0.45,
      needs_followup: false,
      followup_question: null,
      safety_flags: safetyFlags
    };
  }

  private fallbackTextByTopic(topic: string) {
    switch (topic) {
      case "relationships":
        return {
          conclusion:
            "你现在的压力更像是关系模式在消耗你，而不只是单一事件带来的情绪波动。",
          explanation:
            "从当前可用的语义结果看，这阶段更可能与边界、回应方式和安全感需求有关，所以你会一边想维持关系，一边又觉得越来越累。",
          advice:
            "先别急着下最终结论，先把最近最让你消耗的一种互动方式单独拎出来，明确你不想再重复承受的那条线。"
        };
      case "career":
        return {
          conclusion:
            "你当前更需要把职业方向重新收束到真正重要的一两个重点上。",
          explanation:
            "从现有语义结果看，这不是简单的动力不足，更像是方向、结构和外部期待之间暂时没有对齐。",
          advice:
            "先确定一个最重要的结果指标，再看你现在的投入是否真正服务于它，而不是继续分散推进。"
        };
      case "money":
        return {
          conclusion:
            "你现在最需要的不是更激进，而是更清晰的资源边界。",
          explanation:
            "当前语义结果更提示你关注稳定性、可控性和节奏，而不是只看短期波动本身。",
          advice:
            "先把最近一段时间最容易失控的一类支出或决策单独列出来，再设一条简单但必须执行的限制规则。"
        };
      default:
        return {
          conclusion:
            "你当前的问题更像是在一个已有模式上被放大，而不是突然发生的偶然状态。",
          explanation:
            "从可用信息看，这阶段更适合先看清自己一再重复的反应方式，再去判断外部事件本身。",
          advice:
            "先把你最近最反复出现的一种困扰写成一句话，再看它背后到底是情绪、关系、还是目标上的问题。"
        };
    }
  }

  private mapError(error: unknown): ReplyServiceError {
    if (error instanceof PayloadValidationError) {
      return new ReplyServiceError(
        error.message,
        "INVALID_REQUEST",
        error.details
      );
    }

    if (error instanceof OpenAIResponseValidationError) {
      return new ReplyServiceError(
        error.message,
        "OPENAI_RESPONSE_INVALID",
        error.details
      );
    }

    if (error instanceof Error) {
      return new ReplyServiceError(
        error.message,
        "OPENAI_CALL_FAILED"
      );
    }

    return new ReplyServiceError(
      "Unknown reply service error",
      "UNKNOWN_ERROR",
      error
    );
  }
}

export function createReplyService(
  client: OpenAI,
  options: ReplyServiceOptions = {}
) {
  return new ReplyService(client, options);
}
