import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMPT_PAGE_SIZE,
  formatPromptEyebrow,
  pagePromptSlice,
  parsePromptGalleryQuery,
  serializePromptGalleryQuery,
} from "../src/lib/prompt-gallery.mjs";

test("eyebrow 只报作者人数，不罗列 @handle", () => {
  assert.equal(
    formatPromptEyebrow([{ author: "alice" }, { author: "bob" }, { author: "@alice" }]),
    "2 位作者 · 生图提示词",
  );
});

test("没有作者时 eyebrow 只写生图提示词", () => {
  assert.equal(formatPromptEyebrow([]), "生图提示词");
  assert.equal(formatPromptEyebrow([{ author: "  " }]), "生图提示词");
});

test("作者很多时 eyebrow 仍是短句，不含 @", () => {
  const sets = Array.from({ length: 500 }, (_, index) => ({ author: `user${index}` }));
  const text = formatPromptEyebrow(sets);
  assert.equal(text, "500 位作者 · 生图提示词");
  assert.equal(text.includes("@"), false);
  assert.ok(text.length < 40);
});

test("分页尺寸落在 24–48，默认可被测试引用", () => {
  assert.ok(PROMPT_PAGE_SIZE >= 24 && PROMPT_PAGE_SIZE <= 48);
});

test("pagePromptSlice 先按过滤总数切页并夹紧页码", () => {
  assert.deepEqual(pagePromptSlice(75, 2, 36), { page: 2, pages: 3, start: 36, end: 72 });
  assert.deepEqual(pagePromptSlice(75, 99, 36), { page: 3, pages: 3, start: 72, end: 75 });
  assert.deepEqual(pagePromptSlice(10, 0, 36), { page: 1, pages: 1, start: 0, end: 10 });
  assert.deepEqual(pagePromptSlice(0, 1, 36), { page: 1, pages: 1, start: 0, end: 0 });
});

test("query 读写 tag 与 page，默认页省略", () => {
  assert.deepEqual(parsePromptGalleryQuery("?tag=海报&page=3"), { tag: "海报", page: 3 });
  assert.deepEqual(parsePromptGalleryQuery(""), { tag: "", page: 1 });
  assert.deepEqual(parsePromptGalleryQuery("?page=0"), { tag: "", page: 1 });
  assert.equal(serializePromptGalleryQuery({ tag: "UI", page: 2 }), "?tag=UI&page=2");
  assert.equal(serializePromptGalleryQuery({ tag: "", page: 1 }), "");
  assert.equal(serializePromptGalleryQuery({ tag: "场景", page: 1 }), "?tag=%E5%9C%BA%E6%99%AF");
});
