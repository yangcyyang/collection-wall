import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMPT_PAGE_SIZE,
  encodePromptGalleryIndex,
  filterPromptGalleryIndex,
  formatPromptEyebrow,
  formatPromptGalleryCount,
  nextPromptGalleryState,
  pagePromptGallery,
  pagePromptSlice,
  parsePromptGalleryQuery,
  serializePromptGalleryQuery,
  toPromptGalleryIndex,
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

test("分页尺寸是 100，便于一处改", () => {
  assert.equal(PROMPT_PAGE_SIZE, 100);
});

test("pagePromptSlice 先按过滤总数切页并夹紧页码", () => {
  assert.deepEqual(pagePromptSlice(75, 2, 36), { page: 2, pages: 3, start: 36, end: 72 });
  assert.deepEqual(pagePromptSlice(75, 99, 36), { page: 3, pages: 3, start: 72, end: 75 });
  assert.deepEqual(pagePromptSlice(10, 0, 36), { page: 1, pages: 1, start: 0, end: 10 });
  assert.deepEqual(pagePromptSlice(0, 1, 36), { page: 1, pages: 1, start: 0, end: 0 });
});

function galleryItems(count, map) {
  return Array.from({ length: count }, (_, index) => map(index));
}

test("先按类型/标签/搜索过滤，再按 pageSize 切页", () => {
  const items = galleryItems(250, (index) => ({
    id: String(index),
    type: index < 220 ? "海报" : "插画",
    facets: index % 2 === 0 ? ["小小东"] : ["多图"],
    prompt: index < 220 ? `poster ${index}` : `illustration ${index}`,
    imageCount: 1,
  }));

  const posters = filterPromptGalleryIndex(items, { type: "海报" });
  assert.equal(posters.length, 220);

  const multi = filterPromptGalleryIndex(items, { type: "海报", facets: ["多图"], query: "poster" });
  assert.equal(multi.length, 110);
  assert.ok(multi.every((item) => item.type === "海报" && item.facets.includes("多图")));

  const page2 = pagePromptGallery(multi, 2);
  assert.equal(page2.total, 110);
  assert.equal(page2.pages, 2);
  assert.equal(page2.page, 2);
  assert.equal(page2.items.length, 10);
  assert.ok(page2.items.length <= PROMPT_PAGE_SIZE);
  assert.equal(page2.items[0].id, "201");
});

test("改类型、标签或搜索时页码回到 1，只翻页则保留页码", () => {
  const onPage3 = { type: "", facets: [], query: "", page: 3 };
  assert.equal(nextPromptGalleryState(onPage3, { type: "海报" }).page, 1);
  assert.equal(nextPromptGalleryState(onPage3, { facets: ["多图"] }).page, 1);
  assert.equal(nextPromptGalleryState(onPage3, { query: "poster" }).page, 1);
  assert.deepEqual(nextPromptGalleryState(onPage3, { page: 2 }), {
    type: "",
    facets: [],
    query: "",
    page: 2,
  });
});

test("页头计数写出匹配总数和当前页", () => {
  assert.equal(formatPromptGalleryCount({ matched: 320, page: 1, pages: 4 }), "匹配 320 · 第 1/4 页");
  assert.equal(formatPromptGalleryCount({ matched: 0, page: 1, pages: 1 }), "匹配 0 · 第 1/1 页");
});

test("索引只保留封面、类型、标签和提示词正文", () => {
  const index = toPromptGalleryIndex([{
    id: "x",
    type: "海报",
    prompt: "hello",
    images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    source: "xiaoxiaodong01",
    tweetUrl: "https://x.com/i/status/1",
  }]);
  assert.deepEqual(index, [{
    id: "x",
    cover: "https://example.com/a.jpg",
    type: "海报",
    facets: ["小小东", "多图"],
    prompt: "hello",
    images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    source: "xiaoxiaodong01",
    tweetUrl: "https://x.com/i/status/1",
    sourceLabel: "原推",
    imageCount: 2,
  }]);
});

test("内嵌索引不会把 </script> 写进 HTML", () => {
  const encoded = encodePromptGalleryIndex([{ prompt: "</script><img src=x>" }]);
  assert.equal(encoded.includes("</script>"), false);
  assert.deepEqual(JSON.parse(encoded), [{ prompt: "</script><img src=x>" }]);
});

test("query 读写 tag 与 page，默认页省略", () => {
  assert.deepEqual(parsePromptGalleryQuery("?tag=海报&page=3"), { tag: "海报", page: 3 });
  assert.deepEqual(parsePromptGalleryQuery(""), { tag: "", page: 1 });
  assert.deepEqual(parsePromptGalleryQuery("?page=0"), { tag: "", page: 1 });
  assert.equal(serializePromptGalleryQuery({ tag: "UI", page: 2 }), "?tag=UI&page=2");
  assert.equal(serializePromptGalleryQuery({ tag: "", page: 1 }), "");
  assert.equal(serializePromptGalleryQuery({ tag: "场景", page: 1 }), "?tag=%E5%9C%BA%E6%99%AF");
});
