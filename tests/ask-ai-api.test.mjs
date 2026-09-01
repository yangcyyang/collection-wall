import assert from "node:assert/strict";
import test from "node:test";

import { handleAskAi } from "../functions/api/ask-ai.js";

const catalog = [
  { id: "gamma", name: "Gamma", headline: "演示", tags: ["PPT"], capabilities: ["幻灯片"] },
];

function request(body, { cookie = "" } = {}) {
  return new Request("https://wall.yangcyyang.cn/api/ask-ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("未配置共享密钥且无自备 key 时回退关键词", async () => {
  const response = await handleAskAi({
    request: request({ query: "帮我做一份 PPT", catalog }),
    env: {},
    fetchImpl: async () => {
      throw new Error("should not call Gemini");
    },
  });
  const payload = await response.json();
  assert.equal(payload.tier, "keyword");
  assert.match(payload.notice, /关键词搜索/);
});

test("共享额度用尽时回退并说明", async () => {
  const response = await handleAskAi({
    request: request({ query: "帮我做一份 PPT", catalog }),
    env: { GEMINI_API_KEY: "shared-key", ASK_AI_QUOTA_USED: 20, ASK_AI_QUOTA_DAY: "2026-09-01" },
    now: new Date("2026-09-01T04:00:00Z"),
    fetchImpl: async () => {
      throw new Error("should not call Gemini");
    },
  });
  const payload = await response.json();
  assert.equal(payload.tier, "keyword");
  assert.equal(payload.notice, "额度用完，已改关键词搜索");
});

test("共享密钥可用时请求 Gemini 并计入额度", async () => {
  let usedKey = "";
  const response = await handleAskAi({
    request: request({ query: "帮我做一份 PPT", catalog }),
    env: { GEMINI_API_KEY: "shared-key", GEMINI_MODEL: "gemini-2.0-flash" },
    now: new Date("2026-09-01T04:00:00Z"),
    fetchImpl: async (url) => {
      usedKey = String(url).includes("shared-key") ? "shared-key" : "other";
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ids":["gamma"],"reasons":{"gamma":"做演示"}}' }] } }],
      }));
    },
  });
  const payload = await response.json();
  assert.equal(payload.tier, "gemini");
  assert.deepEqual(payload.ids, ["gamma"]);
  assert.equal(payload.reasons.gamma, "做演示");
  assert.equal(usedKey, "shared-key");
  assert.match(response.headers.get("Set-Cookie") ?? "", /ask_ai_quota=/);
});

test("自备 key 不走共享额度，且响应里没有密钥", async () => {
  let called = 0;
  const response = await handleAskAi({
    request: request({ query: "帮我做一份 PPT", catalog, clientKey: "AIza-user" }),
    env: { GEMINI_API_KEY: "shared-key", ASK_AI_QUOTA_USED: 20, ASK_AI_QUOTA_DAY: "2026-09-01" },
    now: new Date("2026-09-01T04:00:00Z"),
    fetchImpl: async (url) => {
      called += 1;
      assert.ok(String(url).includes("AIza-user"));
      assert.ok(!String(url).includes("shared-key"));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ids":["gamma"],"reasons":{"gamma":"自备"}}' }] } }],
      }));
    },
  });
  const payload = await response.json();
  assert.equal(called, 1);
  assert.equal(payload.tier, "gemini");
  assert.equal(JSON.stringify(payload).includes("AIza-user"), false);
  assert.doesNotMatch(response.headers.get("Set-Cookie") ?? "", /ask_ai_quota=/);
});

test("Gemini 出错时回退关键词", async () => {
  const response = await handleAskAi({
    request: request({ query: "帮我做一份 PPT", catalog }),
    env: { GEMINI_API_KEY: "shared-key" },
    fetchImpl: async () => new Response("nope", { status: 503 }),
  });
  const payload = await response.json();
  assert.equal(payload.tier, "keyword");
  assert.match(payload.notice, /关键词搜索/);
});
