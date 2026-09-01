import assert from "node:assert/strict";
import test from "node:test";

import { ASK_AI_NOTICES, chooseAskAiTier } from "../src/lib/ask-ai-route.mjs";

const strongLocal = [{ id: "gamma", score: 12, reason: "PPT" }];
const weakLocal = [{ id: "x", score: 0.2, reason: "" }];

test("短词且本地够强时走本地层，不消耗 Gemini", () => {
  assert.equal(chooseAskAiTier({
    query: "PPT",
    localHits: strongLocal,
    canUseGemini: true,
  }), "local");
});

test("自然语言且能用 Gemini 时走第二层", () => {
  assert.equal(chooseAskAiTier({
    query: "帮我找适合做演示的工具",
    localHits: strongLocal,
    canUseGemini: true,
  }), "gemini");
});

test("本地很弱且能用 Gemini 时走第二层", () => {
  assert.equal(chooseAskAiTier({
    query: "PPT",
    localHits: weakLocal,
    canUseGemini: true,
  }), "gemini");
});

test("没有 Gemini 且本地很弱时回退关键词", () => {
  assert.equal(chooseAskAiTier({
    query: "帮我找做视频的工具",
    localHits: weakLocal,
    canUseGemini: false,
  }), "keyword");
});

test("没有 Gemini 但本地够强时仍用本地", () => {
  assert.equal(chooseAskAiTier({
    query: "PPT",
    localHits: strongLocal,
    canUseGemini: false,
  }), "local");
});

test("回退文案说明额度或缺失密钥", () => {
  assert.equal(ASK_AI_NOTICES.quota, "额度用完，已改关键词搜索");
  assert.match(ASK_AI_NOTICES.missingKey, /关键词搜索/);
  assert.match(ASK_AI_NOTICES.geminiError, /关键词搜索/);
});
