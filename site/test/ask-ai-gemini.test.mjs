import assert from "node:assert/strict";
import test from "node:test";

import { buildGeminiPrompt, parseGeminiHits } from "../src/lib/ask-ai-gemini.mjs";

const allowed = new Set(["gamma", "kling"]);

test("解析 Gemini JSON 并丢掉目录外的 id", () => {
  const text = '好的\n```json\n{"ids":["gamma","nope"],"reasons":{"gamma":"适合做演示"}}\n```';
  const hits = parseGeminiHits(text, allowed);
  assert.deepEqual(hits.ids, ["gamma"]);
  assert.equal(hits.reasons.gamma, "适合做演示");
});

test("畸形或空结果返回 null，供上层回退", () => {
  assert.equal(parseGeminiHits("not json", allowed), null);
  assert.equal(parseGeminiHits('{"ids":[]}', allowed), null);
});

test("prompt 只带压缩目录字段，不含密钥", () => {
  const prompt = buildGeminiPrompt("做 PPT", [
    { id: "gamma", name: "Gamma", headline: "演示", tags: ["PPT"], capabilities: ["幻灯片"] },
  ]);
  assert.match(prompt, /Gamma/);
  assert.doesNotMatch(prompt, /GEMINI|AIza/);
  assert.match(prompt, /只返回 JSON/);
});
