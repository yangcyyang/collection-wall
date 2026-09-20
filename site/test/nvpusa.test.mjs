import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  coverSrc,
  defaultSortForFilter,
  filterArchive,
  formatFollowers,
  getArchive,
  isLocalMedia,
  matchesFilter,
  matchesSearch,
  profileUrl,
  shuffleItems,
  snippet,
  sortItems,
} from "../src/lib/nvpusa.mjs";

const fixtures = [
  {
    id: "1",
    screen_name: "AliveHot",
    name: "热门博主",
    description: "日常分享",
    followers_count: 800000,
    verified: 1,
    is_suspended: 0,
    total_clicks: 90,
    backed_up_at: "2026-08-01T00:00:00.000Z",
    cover_url: "/nvpusa/covers/alive.jpg",
  },
  {
    id: "2",
    screen_name: "MidAccount",
    name: "中等账号",
    description: "摄影笔记",
    followers_count: 150000,
    verified: 0,
    is_suspended: 0,
    total_clicks: 10,
    backed_up_at: "2026-09-01T00:00:00.000Z",
    cover_url: "",
  },
  {
    id: "3",
    screen_name: "LostStar",
    name: "已流失",
    description: "旧档案",
    followers_count: 600000,
    verified: 1,
    is_suspended: 2,
    total_clicks: 999,
    backed_up_at: "2026-07-01T00:00:00.000Z",
    cover_url: "https://pbs.twimg.com/banner.jpg",
  },
  {
    id: "4",
    screen_name: "SmallOne",
    name: "小账号",
    description: "Hello World",
    followers_count: 1200,
    verified: 0,
    is_suspended: 1,
    total_clicks: 1,
    backed_up_at: "2026-06-01T00:00:00.000Z",
    cover_url: "/nvpusa/covers/small.jpg",
  },
];

test("缺失或损坏的 archive 返回空数组，不抛错", async () => {
  assert.deepEqual(await getArchive("/tmp/collection-wall-nvpusa-missing.json"), []);
  const dir = await mkdtemp(join(tmpdir(), "nvpusa-"));
  const broken = join(dir, "broken.json");
  const objectFile = join(dir, "object.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(objectFile, JSON.stringify({ items: fixtures }), "utf8");
  assert.deepEqual(await getArchive(broken), []);
  assert.deepEqual(await getArchive(objectFile), []);
});

test("getArchive 只认顶层数组", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nvpusa-"));
  const file = join(dir, "archive.local.json");
  await writeFile(file, JSON.stringify(fixtures), "utf8");
  const items = await getArchive(file);
  assert.equal(items.length, 4);
  assert.equal(items[0].screen_name, "AliveHot");
});

test("筛选语义：all/hot 排除流失，lost 只留 1|2，其余按字段", () => {
  assert.equal(matchesFilter(fixtures[0], "all"), true);
  assert.equal(matchesFilter(fixtures[2], "all"), false);
  assert.equal(matchesFilter(fixtures[3], "hot"), false);
  assert.equal(matchesFilter(fixtures[0], "verified"), true);
  assert.equal(matchesFilter(fixtures[1], "verified"), false);
  assert.equal(matchesFilter(fixtures[0], "top"), true);
  assert.equal(matchesFilter(fixtures[1], "top"), false);
  assert.equal(matchesFilter(fixtures[1], "100k"), true);
  assert.equal(matchesFilter(fixtures[3], "100k"), false);
  assert.equal(matchesFilter(fixtures[2], "lost"), true);
  assert.equal(matchesFilter(fixtures[0], "lost"), false);
  assert.equal(matchesFilter(fixtures[2], "recent"), true);
});

test("搜索只看 screen_name / name / description，忽略大小写", () => {
  assert.equal(matchesSearch(fixtures[0], "alivehot"), true);
  assert.equal(matchesSearch(fixtures[0], "热门"), true);
  assert.equal(matchesSearch(fixtures[1], "摄影"), true);
  assert.equal(matchesSearch(fixtures[0], "HELLO"), false);
  assert.equal(matchesSearch(fixtures[3], "hello"), true);
  assert.equal(matchesSearch(fixtures[0], ""), true);
});

test("hot 默认按 total_clicks，recent 默认按 backed_up_at；显式排序仍生效", () => {
  assert.equal(defaultSortForFilter("hot"), "clicks");
  assert.equal(defaultSortForFilter("recent"), "recent");
  const hot = filterArchive(fixtures, { filter: "hot" });
  assert.deepEqual(hot.map((item) => item.screen_name), ["AliveHot", "MidAccount"]);
  const recent = filterArchive(fixtures, { filter: "recent" });
  assert.equal(recent[0].screen_name, "MidAccount");
  const named = sortItems(fixtures, "name").map((item) => item.screen_name);
  assert.deepEqual(named, [...named].sort((left, right) => {
    const names = Object.fromEntries(fixtures.map((item) => [item.screen_name, item.name]));
    return names[left].localeCompare(names[right], "zh");
  }));
});

function rngFrom(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    return value;
  };
}

test("shuffleItems 是 Fisher–Yates：可注入 RNG、不改原数组、结果是排列", () => {
  const source = ["AliveHot", "MidAccount", "LostStar", "SmallOne"];
  const copy = [...source];
  // i=3,j=floor(0.5*4)=2 → [A,M,S,L]; i=2,j=0 → [S,M,A,L]; i=1,j=1 → [S,M,A,L]
  const shuffled = shuffleItems(source, rngFrom([0.5, 0, 0.9]));
  assert.deepEqual(source, copy);
  assert.deepEqual(shuffled, ["SmallOne", "MidAccount", "AliveHot", "LostStar"]);
  assert.deepEqual([...shuffled].sort(), [...source].sort());
});

test("sort=random 用注入 RNG 打乱过滤结果；传入 order 则按访问序稳定排列", () => {
  const random = filterArchive(fixtures, { filter: "all", sort: "random", random: rngFrom([0]) });
  assert.deepEqual(random.map((item) => item.screen_name), ["MidAccount", "AliveHot"]);
  const order = ["SmallOne", "MidAccount", "AliveHot", "LostStar"];
  const stable = filterArchive(fixtures, { filter: "all", sort: "random", order });
  assert.deepEqual(stable.map((item) => item.screen_name), ["MidAccount", "AliveHot"]);
  const lost = filterArchive(fixtures, { filter: "lost", sort: "random", order });
  assert.deepEqual(lost.map((item) => item.screen_name), ["SmallOne", "LostStar"]);
  assert.deepEqual(
    sortItems(fixtures, "followers").map((item) => item.screen_name),
    ["AliveHot", "LostStar", "MidAccount", "SmallOne"],
  );
});

test("封面：本地路径可用，HTTPS 与空值走 fallback", () => {
  assert.equal(isLocalMedia("/nvpusa/covers/a.jpg"), true);
  assert.equal(isLocalMedia("https://pbs.twimg.com/banner.jpg"), false);
  assert.equal(coverSrc(fixtures[0]), "/nvpusa/covers/alive.jpg");
  assert.equal(coverSrc(fixtures[1]), "");
  assert.equal(coverSrc(fixtures[2]), "");
});

test("粉丝数中文格式与 X 外链", () => {
  assert.equal(formatFollowers(4293429), "429万");
  assert.equal(formatFollowers(150000), "15万");
  assert.equal(formatFollowers(1200), "1200");
  assert.equal(profileUrl(fixtures[0]), "https://x.com/AliveHot");
  assert.equal(snippet("一段很长的简介需要被裁成更短的展示文案，避免撑破卡片"), "一段很长的简介需要被裁成更短的展示文案，避免撑破卡片");
});

test("真实 archive.local.json 是 493 条顶层数组", async () => {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/nvpusa/archive.local.json");
  const items = await getArchive(file);
  assert.equal(items.length, 493);
  assert.ok(items.every((item) => item.screen_name && item.name));
  assert.equal(filterArchive(items, { filter: "lost" }).length, 19);
  assert.equal(filterArchive(items, { filter: "all" }).length, 474);
});

test("getArchive 默认按 site cwd 读 archive.local.json，对齐 Astro build", async () => {
  const lib = await readFile(new URL("../src/lib/nvpusa.mjs", import.meta.url), "utf8");
  assert.match(lib, /resolve\(process\.cwd\(\), "\.\.\/data\/nvpusa\/archive\.local\.json"\)/);
});

test("构建产物 /nvpusa/ 读入 493 条且不用远程封面", async (t) => {
  let html;
  try {
    html = await readFile(new URL("../dist/nvpusa/index.html", import.meta.url), "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.equal((html.match(/data-nvpusa /g) ?? []).length, 493);
  assert.match(html, /data-total="493"/);
  const archive = await getArchive(resolve(dirname(fileURLToPath(import.meta.url)), "../../data/nvpusa/archive.local.json"));
  const firstCard = html.match(/data-screen-name="([^"]+)"/);
  assert.equal(firstCard?.[1], archive[0].screen_name);
  assert.match(html, /data-nvpusa-search/);
  assert.match(html, /data-nvpusa-random/);
  assert.doesNotMatch(html, /pbs\.twimg\.com/);
  assert.match(html, /https:\/\/x\.com\//);
});

test("导航、登录文案与页面约定", async () => {
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/nvpusa.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  const auth = await readFile(new URL("../../functions/auth.js", import.meta.url), "utf8");
  const sync = await readFile(new URL("../../scripts/sync-site-covers.mjs", import.meta.url), "utf8");
  const gitignore = await readFile(new URL("../../.gitignore", import.meta.url), "utf8");
  assert.match(nav, /id: "nvpusa"/);
  assert.match(nav, /href: "\/nvpusa\/"/);
  assert.match(nav, /label: "nvpusa"/);
  assert.match(nav, /current: .*nvpusa/);
  assert.match(login, /nvpusa/);
  assert.match(page, /archive\.local\.json/);
  assert.doesNotMatch(page, /data\/nvpusa\/archive\.json"/);
  assert.match(page, /data-nvpusa-search/);
  assert.match(page, /data-nvpusa-filter/);
  assert.match(page, /data-nvpusa-sort/);
  assert.match(page, /data-nvpusa-random/);
  assert.match(page, /profileUrl/);
  assert.match(page, /<option value="random"[^>]*>随机/);
  assert.match(page, /shuffleItems/);
  assert.match(page, /userChoseSort/);
  assert.match(page, /rebuildRandomOrder|randomOrder/);
  assert.doesNotMatch(page, /sortSelect\.value = defaultSortForFilter/);
  assert.doesNotMatch(page, /sessionStorage|localStorage/);
  assert.match(page, /rebuildRandomOrder\(\);\s*refresh\(\)/);
  const randomClick = page.match(/querySelector\("\[data-nvpusa-random\]"\)[\s\S]*?addEventListener\("click", \(\) => \{[\s\S]*?\}\);/);
  assert.ok(randomClick, "随机探索按钮应绑定 click");
  assert.match(randomClick[0], /rebuildRandomOrder/);
  assert.match(randomClick[0], /userChoseSort = false/);
  assert.match(page, /currentSort\(\) === "random"[\s\S]*appendChild/);
  const filterLib = await readFile(new URL("../src/lib/nvpusa-filter.mjs", import.meta.url), "utf8");
  assert.match(filterLib, /https:\/\/x\.com\//);
  assert.doesNotMatch(auth, /PUBLIC_EXACT[\s\S]*nvpusa/);
  assert.match(sync, /data\/nvpusa\/avatars/);
  assert.match(sync, /data\/nvpusa\/covers/);
  assert.match(sync, /site\/public\/nvpusa\/avatars/);
  assert.match(sync, /site\/public\/nvpusa\/covers/);
  assert.match(gitignore, /site\/public\/nvpusa\//);
});
