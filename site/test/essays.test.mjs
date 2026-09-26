import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  essayKindFilters,
  getEssay,
  getEssaysFeed,
  normalizeEssay,
  renderEssayMarkdown,
} from "../src/lib/essays.mjs";

const missingFile = "/tmp/collection-wall-essays-missing.json";
const catalogFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/essays/index.json");

function sampleItem(overrides = {}) {
  return {
    id: "sample-note",
    kind: "original",
    title: "一篇自己的文章",
    summary: "先写给自己看",
    author: "我",
    ...overrides,
  };
}

test("缺失文章清单时返回空 feed，不抛错", async () => {
  const feed = await getEssaysFeed(missingFile);
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.items, []);
});

test("损坏的 JSON 与空 items 不让站点崩", async () => {
  const dir = await mkdtemp(join(tmpdir(), "essays-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "文章" }), "utf8");
  assert.equal((await getEssaysFeed(broken)).count, 0);
  assert.equal((await getEssaysFeed(empty)).count, 0);
});

test("只认合法 id 与两类 kind，count 跟条目对齐", async () => {
  const dir = await mkdtemp(join(tmpdir(), "essays-"));
  const file = join(dir, "index.json");
  await writeFile(file, JSON.stringify({
    source: "essays",
    title: "文章",
    description: "译文和原创",
    updated_at: "2026-09-26",
    items: [
      sampleItem(),
      sampleItem({ id: "../secret", title: "路径不该进来" }),
      sampleItem({ id: "partial-note", kind: "translation", capture_status: "partial", source_url: "javascript:alert(1)" }),
      { title: "没有 id" },
    ],
  }), "utf8");
  const feed = await getEssaysFeed(file);
  assert.equal(feed.count, 2);
  assert.equal(feed.items[0].kind, "original");
  assert.equal(feed.items[0].kind_label, "我的文章");
  assert.equal(feed.items[0].body_file, "sample-note.md");
  assert.equal(feed.items[1].capture_status, "partial");
  assert.equal(feed.items[1].kind_label, "译文");
  assert.equal(feed.items[1].source_url, "");
});

test("正文按 markdown 读出，路径逃不出目录", async () => {
  const dir = await mkdtemp(join(tmpdir(), "essays-body-"));
  await writeFile(join(dir, "index.json"), JSON.stringify({
    items: [sampleItem({ body_file: "../index.json" })],
  }), "utf8");
  await writeFile(join(dir, "sample-note.md"), "这是正文\n\n- 第一点", "utf8");
  const essay = await getEssay("sample-note", dir);
  assert.equal(essay.kind, "original");
  assert.match(essay.html, /这是正文/);
  assert.match(essay.html, /<li>第一点<\/li>/);
  assert.doesNotMatch(essay.markdown, /"items"/);
});

test("markdown 转义 HTML，只保留 http 链接、粗体和斜体", () => {
  const html = renderEssayMarkdown([
    "# 标题",
    "",
    "看 [原文](https://x.com/trq212/status/2103576349499855160) 和 [坏链接](javascript:alert(1))",
    "",
    "<script>alert(1)</script>",
    "",
    "**高档**适合*边界*情况",
  ].join("\n"));
  assert.match(html, /<h2>标题<\/h2>/);
  assert.match(html, /href="https:\/\/x.com\/trq212\/status\/2103576349499855160"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>高档<\/strong>/);
  assert.match(html, /<em>边界<\/em>/);
});

test("两类筛选始终都在，空类计数为 0", () => {
  assert.deepEqual(essayKindFilters([
    normalizeEssay(sampleItem()),
    normalizeEssay(sampleItem({ id: "another", kind: "original" })),
  ]), [
    { id: "translation", label: "译文", count: 0 },
    { id: "original", label: "我的文章", count: 2 },
  ]);
});

test("种子译文在清单里，原文链接和中文正文可读", async () => {
  const feed = await getEssaysFeed(catalogFile);
  const item = feed.items.find((entry) => entry.id === "spending-your-effort");
  assert.ok(item);
  assert.equal(item.kind, "translation");
  assert.equal(item.capture_status, "full");
  assert.equal(item.author, "Thariq");
  assert.equal(item.author_handle, "trq212");
  assert.equal(item.article_url, "https://x.com/i/article/2103535187426709504");
  assert.equal(item.source_url, "https://x.com/trq212/status/2103576349499855160");
  assert.match(item.title, /推理努力/);

  const essay = await getEssay("spending-your-effort", dirname(catalogFile));
  assert.match(essay.html, /effort 到底是什么/);
  assert.match(essay.html, /不必事事都需要这一档|但不是每件事都需要这一档/);
  assert.match(essay.html, /href="https:\/\/github.com\/harbor-framework\/terminal-bench\/releases\/tag\/v3.0.0"/);
  assert.match(essay.html, /低档/);
  assert.match(essay.html, /最大档/);
  assert.doesNotMatch(essay.html, /<script>/);
});

test("导航有文章 Tab，列表能按译文和我的文章筛选，详情链到原文", async () => {
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/essays/index.astro", import.meta.url), "utf8");
  const detail = await readFile(new URL("../src/pages/essays/[id].astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  const lib = await readFile(new URL("../src/lib/essays.mjs", import.meta.url), "utf8");
  assert.match(nav, /文章/);
  assert.match(nav, /\/essays\//);
  assert.match(nav, /current: .*essays/);
  assert.match(page, /data-kind-filter/);
  assert.match(page, /essayKindFilters/);
  assert.match(lib, /译文/);
  assert.match(lib, /我的文章/);
  assert.match(detail, /article_url/);
  assert.match(detail, /essay-prose/);
  assert.match(login, /文章/);
});

test("构建产物能打开种子译文，原文链接还在", async (t) => {
  const listFile = new URL("../dist/essays/index.html", import.meta.url);
  const detailFile = new URL("../dist/essays/spending-your-effort/index.html", import.meta.url);
  let list;
  let detail;
  try {
    list = await readFile(listFile, "utf8");
    detail = await readFile(detailFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(list, /推理努力到底是什么/);
  assert.match(list, /href="\/essays\/spending-your-effort\/"/);
  assert.match(list, /https:\/\/x.com\/i\/article\/2103535187426709504/);
  assert.match(list, /data-kind="translation"/);
  assert.match(list, /data-kind-filter="original"/);
  assert.match(detail, /推理努力到底是什么/);
  assert.match(detail, /https:\/\/x.com\/trq212\/status\/2103576349499855160/);
  assert.match(detail, /https:\/\/x.com\/i\/article\/2103535187426709504/);
  assert.match(detail, /但不是每件事都需要这一档/);
});
