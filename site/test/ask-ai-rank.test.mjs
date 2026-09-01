import assert from "node:assert/strict";
import test from "node:test";

import { isLocalStrong, isNaturalLanguage, rankTools } from "../src/lib/ask-ai-rank.mjs";

const catalog = [
  { id: "gamma", name: "Gamma", headline: "AI 生成演示文稿", tags: ["PPT", "演示"], capabilities: ["一键生成幻灯片"], intro: "把大纲变成可分享的 PPT" },
  { id: "midjourney", name: "Midjourney", headline: "文本生成高质量图像", tags: ["AI绘画"], capabilities: ["根据文字提示词生成图像"], intro: "出氛围图" },
  { id: "openrouter", name: "OpenRouter", headline: "统一 LLM API", tags: ["API", "中转"], capabilities: ["API 代理"], intro: "一个接口调用多家模型" },
  { id: "kling", name: "可灵", headline: "文生视频", tags: ["视频", "AI视频"], capabilities: ["生成视频"], intro: "用文字生成短片" },
  { id: "notion", name: "Notion", headline: "笔记与协作", tags: ["笔记"], capabilities: ["知识库"], intro: "写文档" },
];

test("自然语言做 PPT 时本地语义把演示工具排在前面", () => {
  const hits = rankTools("做一份给客户看的 PPT", catalog);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].id, "gamma");
  assert.ok(!hits.slice(0, 2).some((hit) => hit.id === "midjourney"));
  assert.ok(hits[0].reason);
});

test("API 代理类问法命中中转工具", () => {
  const hits = rankTools("需要一个 API 代理", catalog);
  assert.equal(hits[0].id, "openrouter");
});

test("能力字段参与检索：提示词能命中文生图工具", () => {
  const hits = rankTools("提示词", catalog);
  assert.equal(hits.some((hit) => hit.id === "midjourney"), true);
});

test("短关键词不算自然语言，完整问句算", () => {
  assert.equal(isNaturalLanguage("PPT"), false);
  assert.equal(isNaturalLanguage("提示词"), false);
  assert.equal(isNaturalLanguage("帮我找适合做演示的工具"), true);
  assert.equal(isNaturalLanguage("做一份给客户看的 PPT"), true);
});

test("无意义查询本地结果很弱", () => {
  const hits = rankTools("zzqwxnvb12345", catalog);
  assert.equal(isLocalStrong(hits), false);
});

test("强匹配时本地层可用", () => {
  assert.equal(isLocalStrong(rankTools("PPT", catalog)), true);
});

test("八百条目录本地排序能在合理时间内完成", () => {
  const tools = Array.from({ length: 820 }, (_, index) => ({
    id: `t-${index}`,
    name: index === 77 ? "Banana Slides" : `Tool ${index}`,
    headline: index === 77 ? "AI 生成 PPT" : "杂项工具",
    tags: index === 77 ? ["PPT"] : ["其他"],
    capabilities: index === 77 ? ["生成幻灯片"] : [],
  }));
  const started = Date.now();
  const hits = rankTools("做一份演示 PPT", tools);
  assert.ok(Date.now() - started < 500);
  assert.equal(hits[0].id, "t-77");
});
