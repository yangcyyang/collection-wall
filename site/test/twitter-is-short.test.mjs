import assert from "node:assert/strict";
import test from "node:test";

import { isShortTweet } from "../src/lib/twitter.ts";

test("有标题但缺少 text 时不抛错，并保留标题布局", () => {
  const item = {
    title: "iPhone 镜像 + Codex Computer Use：把手机操作也交给 AI",
    summary: "作者用 Mac 上的 iPhone 镜像配合 Codex Computer Use。",
    author: "gkxspace",
  };

  let short;
  assert.doesNotThrow(() => {
    short = isShortTweet(item);
  });
  assert.equal(short, false);
});

test("没有标题也没有 text 时视为短推，且不抛错", () => {
  let short;
  assert.doesNotThrow(() => {
    short = isShortTweet({ summary: "只有摘要" });
  });
  assert.equal(short, true);
});

test("text 不是字符串时不读取 length", () => {
  assert.equal(isShortTweet({ title: "有标题", text: null }), false);
  assert.equal(isShortTweet({ title: "", text: undefined }), true);
});

test("有标题时仍按 200 字阈值区分短推", () => {
  assert.equal(isShortTweet({ title: "标题", text: "x".repeat(200) }), true);
  assert.equal(isShortTweet({ title: "标题", text: "x".repeat(201) }), false);
});

test("没有标题时，长正文仍视为短推", () => {
  assert.equal(isShortTweet({ text: "x".repeat(500) }), true);
});
