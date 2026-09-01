import assert from "node:assert/strict";
import test from "node:test";

import { categoryCounts, matchesTool } from "../src/lib/tool-filter.mjs";

const tools = [
  { id: "a", name: "Agent Forge", headline: "编排 AI Agent", category: "🤖 AI 大模型", tags: ["agent", "自动化"] },
  { id: "b", name: "Pixel Lab", headline: "图像处理工具", category: "🎨 视觉创作", tags: ["图片"] },
  { id: "c", name: "Note Flow", headline: "知识整理", category: "📚 知识与学习", tags: ["笔记", "自动化"] },
];

test("搜索匹配名称、定位、标签、能力和简介", () => {
  assert.equal(matchesTool(tools[0], "agent", ""), true);
  assert.equal(matchesTool(tools[1], "图像", ""), true);
  assert.equal(matchesTool(tools[2], "自动化", ""), true);
  assert.equal(matchesTool(tools[1], "agent", ""), false);
  assert.equal(matchesTool({ ...tools[1], capabilities: ["批量导出 PPT"] }, "ppt", ""), true);
  assert.equal(matchesTool({ ...tools[2], intro: "适合整理 prompt" }, "prompt", ""), true);
});

test("多词搜索按任一关键词匹配", () => {
  assert.equal(matchesTool(tools[0], "ppt agent", ""), true);
  assert.equal(matchesTool(tools[1], "ppt agent", ""), false);
});

test("分类与搜索取交集", () => {
  assert.equal(matchesTool(tools[0], "自动化", "🤖 AI 大模型"), true);
  assert.equal(matchesTool(tools[2], "自动化", "🤖 AI 大模型"), false);
});

test("分类计数覆盖全部记录并按数量与名称稳定排序", () => {
  const counts = categoryCounts([...tools, { ...tools[0], id: "d" }]);
  assert.deepEqual(counts, [
    { category: "🤖 AI 大模型", count: 2 },
    { category: "🎨 视觉创作", count: 1 },
    { category: "📚 知识与学习", count: 1 },
  ]);
});
