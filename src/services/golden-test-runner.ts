import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createReplyService } from "./reply-service";
import type { MingKongAIRequest, MingKongAIReply } from "./openai-payload-builder";

type GoldenCase = {
  case_id: string;
  description: string;
  request: MingKongAIRequest;
  assertions: Record<string, any>;
};

type GoldenFixture = {
  version: string;
  description: string;
  cases: GoldenCase[];
};

type ChatCreateParams = {
  messages: Array<{ role: string; content: string }>;
};

function loadFixture(): GoldenFixture {
  const filePath = path.join(__dirname, "__fixtures__", "golden-test-cases.v1.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function buildCandidate(prepared: MingKongAIRequest, assertions: Record<string, any>): MingKongAIReply {
  const availableInsights = prepared.semantic_profile.top_insights.map((item) => item.insight_code);
  const availableTags = prepared.semantic_profile.top_tags.map((item) => item.tag_code);

  const usedInsights = uniq([
    ...(assertions.must_include_all_insights || []).filter((item: string) => availableInsights.includes(item)),
    ...((assertions.must_include_any_insights || []).filter((item: string) => availableInsights.includes(item)).slice(0, 1))
  ]).filter((item: string) => !(assertions.forbidden_used_insights || []).includes(item)).slice(0, 3);

  if (!usedInsights.length && availableInsights.length) {
    usedInsights.push(availableInsights[0]);
  }

  const usedTags = uniq([
    ...((assertions.must_include_any_tags || []).filter((item: string) => availableTags.includes(item)).slice(0, 3)),
    ...availableTags.slice(0, 2)
  ]).slice(0, 5);

  const safetyFlags = uniq([
    ...((assertions.required_safety_flags || []) as string[]),
    "avoid_fatalism"
  ]).filter((flag) => !((assertions.forbidden_safety_flags || []) as string[]).includes(flag)) as MingKongAIReply["safety_flags"];

  const needsFollowup = Boolean(assertions.expected_needs_followup);
  const followupQuestion = assertions.followup_question_required
    ? "Can you point to the exact part that feels most off right now?"
    : null;

  return {
    answer: {
      conclusion: `Topic focus: ${prepared.topic ?? prepared.intent_packet.topic}.`,
      explanation: `Insights used: ${usedInsights.join(", ") || "none"}. Tags used: ${usedTags.join(", ") || "none"}.`,
      advice: assertions.must_have_advice
        ? "Take one small concrete step instead of solving the whole pattern at once."
        : "Stay observant."
    },
    used_insights: usedInsights,
    used_tags: usedTags,
    confidence: 0.74,
    needs_followup: needsFollowup,
    followup_question: needsFollowup ? followupQuestion : null,
    safety_flags: safetyFlags.length ? safetyFlags : ["none"]
  };
}

async function runCase(testCase: GoldenCase) {
  let outboundPayload: MingKongAIRequest | null = null;
  const fakeClient = {
    chat: {
      completions: {
        create: async (params: ChatCreateParams) => {
          outboundPayload = JSON.parse(params.messages[1].content);
          const candidate = buildCandidate(outboundPayload, testCase.assertions);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(candidate)
                }
              }
            ]
          };
        }
      }
    }
  } as any;

  const service = createReplyService(fakeClient, { fallbackEnabled: false });
  const result = await service.reply(testCase.request);

  assert.equal(result.ok, true, `${testCase.case_id}: expected ok=true`);
  assert.equal(result.reply.needs_followup, Boolean(testCase.assertions.expected_needs_followup), `${testCase.case_id}: unexpected needs_followup`);

  for (const insight of testCase.assertions.must_include_all_insights || []) {
    assert.ok(result.reply.used_insights.includes(insight), `${testCase.case_id}: missing insight ${insight}`);
  }

  if (testCase.assertions.must_include_any_insights?.length) {
    assert.ok(
      testCase.assertions.must_include_any_insights.some((item: string) => result.reply.used_insights.includes(item)),
      `${testCase.case_id}: expected one of must_include_any_insights`
    );
  }

  if (testCase.assertions.must_include_any_tags?.length) {
    assert.ok(
      testCase.assertions.must_include_any_tags.some((item: string) => result.reply.used_tags.includes(item)),
      `${testCase.case_id}: expected one of must_include_any_tags`
    );
  }

  for (const insight of testCase.assertions.forbidden_used_insights || []) {
    assert.ok(!result.reply.used_insights.includes(insight), `${testCase.case_id}: forbidden insight leaked: ${insight}`);
    if (outboundPayload) {
      const outboundInsights = outboundPayload.semantic_profile.top_insights.map((item) => item.insight_code);
      assert.ok(!outboundInsights.includes(insight), `${testCase.case_id}: forbidden insight remained in outbound payload: ${insight}`);
    }
  }

  for (const flag of testCase.assertions.required_safety_flags || []) {
    assert.ok(result.reply.safety_flags.includes(flag), `${testCase.case_id}: missing safety flag ${flag}`);
  }

  for (const flag of testCase.assertions.forbidden_safety_flags || []) {
    assert.ok(!result.reply.safety_flags.includes(flag), `${testCase.case_id}: forbidden safety flag present ${flag}`);
  }

  if (testCase.assertions.followup_question_required) {
    assert.ok(result.reply.followup_question, `${testCase.case_id}: expected followup question`);
  }

  if (typeof testCase.assertions.max_conclusion_chars === "number") {
    assert.ok(result.reply.answer.conclusion.length <= testCase.assertions.max_conclusion_chars, `${testCase.case_id}: conclusion too long`);
  }
  if (typeof testCase.assertions.max_explanation_chars === "number") {
    assert.ok(result.reply.answer.explanation.length <= testCase.assertions.max_explanation_chars, `${testCase.case_id}: explanation too long`);
  }
  if (typeof testCase.assertions.max_advice_chars === "number") {
    assert.ok(result.reply.answer.advice.length <= testCase.assertions.max_advice_chars, `${testCase.case_id}: advice too long`);
  }

  if (testCase.assertions.must_have_advice) {
    assert.ok(result.reply.answer.advice.length > 0, `${testCase.case_id}: advice should not be empty`);
  }

  const fullText = `${result.reply.answer.conclusion}\n${result.reply.answer.explanation}\n${result.reply.answer.advice}\n${result.reply.followup_question || ""}`;
  for (const sentence of testCase.assertions.forbidden_exact_sentences || []) {
    assert.ok(!fullText.includes(sentence), `${testCase.case_id}: forbidden exact sentence repeated`);
  }
  for (const phrase of testCase.assertions.forbidden_phrases || []) {
    assert.ok(!fullText.toLowerCase().includes(String(phrase).toLowerCase()), `${testCase.case_id}: forbidden phrase repeated`);
  }

  console.log(`Golden case passed: ${testCase.case_id}`);
}

async function main() {
  const fixture = loadFixture();
  assert.ok(fixture.cases.length > 0, "Expected at least one golden case");
  for (const testCase of fixture.cases) {
    await runCase(testCase);
  }
  console.log(`MingKong reply golden runner passed for ${fixture.cases.length} case(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
