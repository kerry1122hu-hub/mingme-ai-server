import assert from "node:assert/strict";
import { createReplyService } from "./reply-service";
import type { MingKongAIRequest } from "./openai-payload-builder";

type ChatCreateParams = {
  messages: Array<{ role: string; content: string }>;
};

function buildBaseRequest(): MingKongAIRequest {
  return {
    user_id: "spec_user",
    scene: "chat",
    topic: "relationships",
    profile_card: {
      language: "zh-CN",
      tone_preference: "direct_structured",
      time_accuracy: "exact",
      chart_core_summary: {
        sun_sign: "libra",
        moon_sign: "pisces",
        asc_sign: "cancer",
        dominant_planet: "VENUS"
      }
    },
    semantic_profile: {
      semantic_version: "semantic-v1.0.0",
      top_tags: [
        {
          tag_code: "relational_harmony_drive",
          category: "relationship",
          weight: 0.8,
          confidence: 0.86,
          evidence_refs: ["VENUS_IN_HOUSE_7"]
        },
        {
          tag_code: "boundary_learning",
          category: "growth",
          weight: 0.76,
          confidence: 0.81,
          evidence_refs: ["VENUS_SQUARE_SATURN"]
        }
      ],
      top_insights: [
        {
          insight_code: "relationships_seek_harmony_but_need_boundaries",
          category: "theme",
          section: "relationships",
          confidence: 0.79,
          evidence_refs: ["VENUS_SQUARE_SATURN"]
        }
      ]
    },
    intent_packet: {
      user_question: "What should I notice in relationships now?",
      topic: "relationships",
      goal: "clarify_pattern",
      desired_output: "short_actionable"
    },
    session_state: {
      conversation_topic: "relationships",
      already_explained: [],
      avoid_repetition: true,
      max_length_chars: 240
    },
    output_contract: {
      format: "conclusion_explanation_advice",
      language: "zh-CN",
      length: "short",
      style_profile: "mingkong_cn_v1"
    }
  };
}

async function testUnknownTimeDropsTimingInsights() {
  let outboundPayload: any = null;
  const client = {
    chat: {
      completions: {
        create: async (params: ChatCreateParams) => {
          outboundPayload = JSON.parse(params.messages[1].content);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: {
                      conclusion: "You are processing a long-running pattern.",
                      explanation: "The deeper theme is emotional pacing and boundaries.",
                      advice: "Name one clear boundary before you interpret the whole relationship."
                    },
                    used_insights: [
                      outboundPayload.semantic_profile.top_insights[0]?.insight_code || "self_expansion_through_learning"
                    ],
                    used_tags: outboundPayload.semantic_profile.top_tags.map((tag: any) => tag.tag_code).slice(0, 2),
                    confidence: 0.77,
                    needs_followup: false,
                    followup_question: null,
                    safety_flags: ["avoid_fatalism"]
                  })
                }
              }
            ]
          };
        }
      }
    }
  } as any;

  const service = createReplyService(client, { fallbackEnabled: false });
  const request = buildBaseRequest();
  request.profile_card.time_accuracy = "unknown";
  request.topic = "general";
  request.intent_packet.topic = "general";
  request.semantic_profile.top_tags = [
    {
      tag_code: "mental_depth",
      category: "mind",
      weight: 0.8,
      confidence: 0.85,
      evidence_refs: ["MERCURY_IN_SCORPIO"]
    }
  ];
  request.semantic_profile.top_insights = [
    {
      insight_code: "this_period_supports_acceleration",
      category: "opportunity",
      section: "timing",
      confidence: 0.8,
      evidence_refs: ["TRANSIT_JUPITER_TO_ASC"]
    },
    {
      insight_code: "self_expansion_through_learning",
      category: "theme",
      section: "personality",
      confidence: 0.7,
      evidence_refs: ["MERCURY_IN_SCORPIO"]
    }
  ];

  const result = await service.reply(request);

  assert.equal(result.source, "openai");
  assert.ok(outboundPayload, "expected outbound payload capture");
  const outboundInsights = outboundPayload.semantic_profile.top_insights.map((item: any) => item.insight_code);
  assert.ok(!outboundInsights.includes("this_period_supports_acceleration"));
  assert.ok(outboundInsights.includes("self_expansion_through_learning"));
  assert.ok(result.reply.safety_flags.includes("time_accuracy_limited"));
}

async function testPushSnippetConstrainsPayload() {
  let outboundPayload: any = null;
  const client = {
    chat: {
      completions: {
        create: async (params: ChatCreateParams) => {
          outboundPayload = JSON.parse(params.messages[1].content);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: {
                      conclusion: "Stay with one disciplined action today.",
                      explanation: "Your best progress comes from repeating what already works.",
                      advice: "Pick one task and finish it before adding another."
                    },
                    used_insights: ["structure_turns_potential_into_results"],
                    used_tags: ["discipline_as_growth_path"],
                    confidence: 0.8,
                    needs_followup: false,
                    followup_question: null,
                    safety_flags: ["avoid_fatalism"]
                  })
                }
              }
            ]
          };
        }
      }
    }
  } as any;

  const service = createReplyService(client, { fallbackEnabled: false });
  const request = buildBaseRequest();
  request.scene = "push_snippet";
  request.topic = "growth";
  request.intent_packet.topic = "growth";
  request.output_contract.length = "long";
  request.session_state.max_length_chars = 480;
  request.semantic_profile.top_tags = [
    {
      tag_code: "discipline_as_growth_path",
      category: "growth",
      weight: 0.82,
      confidence: 0.88,
      evidence_refs: ["SUN_TRINE_SATURN"]
    }
  ];
  request.semantic_profile.top_insights = [
    {
      insight_code: "structure_turns_potential_into_results",
      category: "strength",
      section: "growth",
      confidence: 0.84,
      evidence_refs: ["SUN_TRINE_SATURN"]
    }
  ];

  const result = await service.reply(request);

  assert.equal(result.source, "openai");
  assert.equal(outboundPayload.output_contract.length, "short");
  assert.equal(outboundPayload.session_state.max_length_chars, 160);
}

async function testFallbackPath() {
  const client = {
    chat: {
      completions: {
        create: async () => {
          throw new Error("synthetic upstream failure");
        }
      }
    }
  } as any;

  const service = createReplyService(client, { fallbackEnabled: true });
  const request = buildBaseRequest();
  request.profile_card.time_accuracy = "approximate";

  const result = await service.reply(request);

  assert.equal(result.source, "fallback");
  assert.equal(result.meta.used_fallback, true);
  assert.ok(result.reply.safety_flags.includes("time_accuracy_limited"));
  assert.ok(result.reply.safety_flags.includes("avoid_fatalism"));
  assert.equal(result.reply.needs_followup, false);
}

async function main() {
  await testUnknownTimeDropsTimingInsights();
  await testPushSnippetConstrainsPayload();
  await testFallbackPath();
  console.log("Reply service spec passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
