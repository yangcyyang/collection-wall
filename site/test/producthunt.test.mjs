import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const producthuntDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/producthunt");
const digestFile = resolve(producthuntDir, "digest.json");
const missingFile = "/tmp/collection-wall-producthunt-missing.json";

import {
  getDigestFeed,
  getProductById,
  getProducts,
  getRecentReportDates,
  hasDigestContent,
  producthuntVotesLabel,
} from "../src/lib/producthunt.mjs";

const emptyFeed = {
  source: "",
  title: "",
  date: "",
  updated_at: "",
  count: 0,
  takeaways: [],
  recommend: "",
  products: [],
};

test("缺失 Product Hunt JSON 时返回空 feed / 空数组 / null，不抛错", async () => {
  const feed = await getDigestFeed(missingFile);
  assert.deepEqual(feed, emptyFeed);
  assert.deepEqual(await getProducts(missingFile), []);
  assert.equal(await getProductById("any-id", missingFile), null);
  assert.equal(hasDigestContent(feed), false);
});

test("读取 data/producthunt/digest.json 契约，不硬编码条目", async () => {
  const raw = JSON.parse(await readFile(digestFile, "utf8"));
  assert.equal(raw.source, "producthunt-digest");
  assert.equal(raw.title, "Product Hunt 点子日报");
  assert.ok(typeof raw.date === "string");
  assert.ok(typeof raw.updated_at === "string");
  assert.ok(Array.isArray(raw.takeaways));
  assert.equal(typeof raw.recommend, "string");
  assert.ok(Array.isArray(raw.products));
  assert.equal(raw.count, raw.products.length);

  const feed = await getDigestFeed(digestFile);
  assert.equal(feed.source, raw.source);
  assert.equal(feed.title, raw.title);
  assert.equal(feed.date, raw.date);
  assert.equal(feed.updated_at, raw.updated_at);
  assert.equal(feed.count, raw.products.length);
  assert.deepEqual(feed.takeaways, raw.takeaways);
  assert.equal(feed.recommend, raw.recommend);
  assert.equal(hasDigestContent(feed), raw.products.length > 0);
});

test("getProductById 按 id 取产品，未知 id 为 null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ph-"));
  const file = join(dir, "digest.json");
  await writeFile(
    file,
    JSON.stringify({
      source: "producthunt-digest",
      title: "Product Hunt 点子日报",
      date: "2026-09-12",
      updated_at: "2026-09-12T13:55:00+08:00",
      count: 1,
      takeaways: ["先看投票"],
      recommend: "值得跟进",
      products: [
        {
          id: "stable-slug",
          rank: 1,
          name: "Name",
          tagline: "一行卖点",
          intro: "中文介绍",
          votes: 128,
          producthunt_url: "https://www.producthunt.com/posts/name",
          website: "https://example.com",
        },
      ],
    }),
    "utf8",
  );
  const item = await getProductById("stable-slug", file);
  assert.equal(item?.id, "stable-slug");
  assert.equal(item?.name, "Name");
  assert.equal(item?.rank, 1);
  assert.equal(item?.votes, 128);
  assert.equal(await getProductById("does-not-exist", file), null);
  const feed = await getDigestFeed(file);
  assert.equal(hasDigestContent(feed), true);
});

test("可选字段缺失时仍能规范化条目，不抛错", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ph-"));
  const file = join(dir, "digest.json");
  await writeFile(
    file,
    JSON.stringify({
      title: "x",
      products: [{ id: "bare", name: "只有名字" }],
    }),
    "utf8",
  );
  const item = await getProductById("bare", file);
  assert.equal(item?.id, "bare");
  assert.equal(item?.name, "只有名字");
  assert.equal(item?.tagline, "");
  assert.equal(item?.intro, "");
  assert.equal(item?.rank, "");
  assert.equal(item?.votes, null);
  assert.equal(item?.producthunt_url, "");
  assert.equal(item?.website, "");
  const feed = await getDigestFeed(file);
  assert.deepEqual(feed.takeaways, []);
  assert.equal(feed.recommend, "");
});

test("Product Hunt 列表页用按钮打开弹层，不生成按日或按 id 子路由", async () => {
  const page = await readFile(new URL("../src/pages/producthunt.astro", import.meta.url), "utf8");
  const viewer = await readFile(new URL("../src/components/ProducthuntViewer.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  assert.match(nav, /Product Hunt/);
  assert.match(nav, /\/producthunt\//);
  assert.match(nav, /current: .*producthunt/);
  assert.match(login, /Product Hunt/);
  assert.match(page, /data-ph-open/);
  assert.match(page, /暂时没有 Product Hunt 点子/);
  assert.match(page, /data\/producthunt/);
  assert.match(page, /digest\.json/);
  assert.match(page, /takeaways/);
  assert.match(page, /recommend/);
  assert.match(page, /getRecentReportDates/);
  assert.doesNotMatch(page, /href=\{`\/producthunt\/\$\{item\.id\}\/`\}/);
  assert.doesNotMatch(page, /getStaticPaths/);
  assert.match(viewer, /data-ph-viewer/);
  assert.match(viewer, /data-ph-template/);
  assert.match(viewer, /producthunt_url/);
  assert.match(viewer, /website/);
});

test("票数缺失显示空文案，数字显示中文票数", () => {
  assert.equal(producthuntVotesLabel(null), "");
  assert.equal(producthuntVotesLabel(""), "");
  assert.equal(producthuntVotesLabel(0), "0 票");
  assert.equal(producthuntVotesLabel(128), "128 票");
});

test("损坏的 JSON 与空 products 不让站点崩，空 products 视为整页空状态", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ph-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(
    empty,
    JSON.stringify({
      title: "x",
      takeaways: ["有摘要也不算有产品"],
      recommend: "仍应空状态",
      products: [],
    }),
    "utf8",
  );
  assert.deepEqual(await getProducts(broken), []);
  const emptyFeed = await getDigestFeed(empty);
  assert.deepEqual(emptyFeed.products, []);
  assert.deepEqual(emptyFeed.takeaways, ["有摘要也不算有产品"]);
  assert.equal(hasDigestContent(emptyFeed), false);
});

test("可选按日归档文件按日期倒序列出，不影响主报告，也不生成子路由", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ph-dates-"));
  await writeFile(join(dir, "digest.json"), JSON.stringify({ title: "latest" }), "utf8");
  await writeFile(join(dir, "2026-09-01.json"), JSON.stringify({ date: "2026-09-01" }), "utf8");
  await writeFile(join(dir, "2026-09-03.json"), JSON.stringify({ date: "2026-09-03" }), "utf8");
  await writeFile(join(dir, "notes.txt"), "ignore", "utf8");
  await mkdir(join(dir, "nested"), { recursive: true });
  assert.deepEqual(await getRecentReportDates(dir), ["2026-09-03", "2026-09-01"]);
  const missing = await getRecentReportDates(join(dir, "no-such-dir"));
  assert.deepEqual(missing, []);
});

test("构建产物 /producthunt/ 空状态可用，详情走弹层，无按日子页", async (t) => {
  const distFile = new URL("../dist/producthunt/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /Product Hunt/);
  assert.match(html, /暂时没有 Product Hunt 点子/);
  assert.match(html, /data-ph-viewer/);
  assert.doesNotMatch(html, /href="\/producthunt\/[^"/]+\/"/);
});
