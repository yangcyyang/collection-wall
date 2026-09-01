import assert from "node:assert/strict";
import test from "node:test";

import { cardMatchesWallFilters } from "../src/lib/ask-ai-filter.mjs";

const gamma = {
  searchBlob: "gamma ai 生成演示文稿 ppt 演示 一键生成幻灯片",
  cardCategory: "办公与效率",
  cardId: "gamma",
};

test("Ask AI 命中后仍与分类、意图取交集", () => {
  assert.equal(cardMatchesWallFilters({
    ...gamma,
    category: "办公与效率",
    intent: "ppt 演示",
    askIds: new Set(["gamma"]),
    query: "",
  }), true);
  assert.equal(cardMatchesWallFilters({
    ...gamma,
    category: "视觉创作",
    intent: "",
    askIds: new Set(["gamma"]),
    query: "",
  }), false);
});

test("没有 Ask AI 结果时沿用关键词任一匹配", () => {
  assert.equal(cardMatchesWallFilters({
    ...gamma,
    category: "",
    intent: "",
    askIds: null,
    query: "ppt agent",
  }), true);
  assert.equal(cardMatchesWallFilters({
    ...gamma,
    category: "",
    intent: "",
    askIds: null,
    query: "agent only",
  }), false);
});

test("清除 Ask AI 后关键词重新生效", () => {
  assert.equal(cardMatchesWallFilters({
    ...gamma,
    category: "",
    intent: "",
    askIds: new Set(["kling"]),
    query: "ppt",
  }), false);
  assert.equal(cardMatchesWallFilters({
    ...gamma,
    category: "",
    intent: "",
    askIds: null,
    query: "ppt",
  }), true);
});
