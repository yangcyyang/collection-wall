import assert from "node:assert/strict";
import test from "node:test";

import {
  GEMINI_KEY_STORAGE,
  keywordHits,
  loadClientGeminiKey,
  runAskAi,
  saveClientGeminiKey,
  shouldFocusSearchOnSlash,
} from "../src/lib/ask-ai-page.mjs";

const catalog = [
  { id: "gamma", name: "Gamma", headline: "AI 生成演示文稿", tags: ["PPT"], capabilities: ["幻灯片"] },
  { id: "kling", name: "可灵", headline: "文生视频", tags: ["视频"], capabilities: ["生成视频"] },
];

function slashEvent({ key = "/", tag = "BODY", editable = false, ctrl = false } = {}) {
  return {
    key,
    ctrlKey: ctrl,
    metaKey: false,
    altKey: false,
    target: { tagName: tag, isContentEditable: editable },
  };
}

test("斜杠在非输入框时聚焦搜索，输入中不抢焦点", () => {
  assert.equal(shouldFocusSearchOnSlash(slashEvent()), true);
  assert.equal(shouldFocusSearchOnSlash(slashEvent({ tag: "INPUT" })), false);
  assert.equal(shouldFocusSearchOnSlash(slashEvent({ tag: "TEXTAREA" })), false);
  assert.equal(shouldFocusSearchOnSlash(slashEvent({ editable: true })), false);
  assert.equal(shouldFocusSearchOnSlash(slashEvent({ key: "a" })), false);
});

test("自备 Gemini key 只进 localStorage，不进仓库约定键名", () => {
  const storage = new Map();
  const mem = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
    removeItem: (key) => { storage.delete(key); },
  };
  saveClientGeminiKey("  AIza-user-key  ", mem);
  assert.equal(loadClientGeminiKey(mem), "AIza-user-key");
  assert.equal([...storage.keys()][0], GEMINI_KEY_STORAGE);
  saveClientGeminiKey("  ", mem);
  assert.equal(loadClientGeminiKey(mem), "");
});

test("本地层强匹配时不请求 Gemini", async () => {
  let called = 0;
  const result = await runAskAi({
    query: "PPT",
    catalog,
    clientKey: "",
    fetchAskAi: async () => {
      called += 1;
      return { tier: "gemini", ids: ["gamma"], reasons: {} };
    },
  });
  assert.equal(result.tier, "local");
  assert.equal(result.hits[0].id, "gamma");
  assert.equal(called, 0);
});

test("额度用尽时回退关键词并带可见说明", async () => {
  const result = await runAskAi({
    query: "帮我找适合做演示的工具",
    catalog,
    clientKey: "",
    fetchAskAi: async () => ({ tier: "keyword", notice: "额度用完，已改关键词搜索" }),
  });
  assert.equal(result.tier, "keyword");
  assert.equal(result.notice, "额度用完，已改关键词搜索");
  assert.deepEqual(result.hits.map((hit) => hit.id), keywordHits("帮我找适合做演示的工具", catalog).map((hit) => hit.id));
});

test("自备 key 走代理且不把密钥写进结果", async () => {
  const result = await runAskAi({
    query: "帮我找适合做演示的工具",
    catalog,
    clientKey: "AIza-secret",
    fetchAskAi: async ({ clientKey }) => {
      assert.equal(clientKey, "AIza-secret");
      return { tier: "gemini", ids: ["gamma"], reasons: { gamma: "做演示" } };
    },
  });
  assert.equal(result.tier, "gemini");
  assert.equal(JSON.stringify(result).includes("AIza-secret"), false);
});
