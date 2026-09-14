import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("演示期间副业页用开关隐藏机会列表，保留导航与登录", async () => {
  const page = await readFile(new URL("../src/pages/sidehustle.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");

  assert.match(page, /HIDE_SIDEHUSTLE_LIST_FOR_DEMO\s*=\s*true/);
  assert.match(page, /HIDE_SIDEHUSTLE_LIST_FOR_DEMO\s*\?/);
  assert.match(page, /!HIDE_SIDEHUSTLE_LIST_FOR_DEMO\s*&&\s*<SidehustleViewer/);
  assert.match(page, /内容暂未开放/);
  assert.match(page, /该列表演示期间暂不展示/);
  assert.match(page, /SiteNav/);
  assert.match(page, /LogoutControl/);
  assert.match(page, /机会列表/);
  assert.match(page, /机会摘要/);
  assert.match(nav, /副业/);
  assert.match(nav, /\/sidehustle\//);
  assert.match(login, /副业/);
});

test("构建产物 /sidehustle/ 不渲染机会列表或抓取条目标题", async (t) => {
  const distFile = new URL("../dist/sidehustle/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }

  assert.match(html, /副业/);
  assert.match(html, /内容暂未开放/);
  assert.match(html, /该列表演示期间暂不展示/);
  assert.match(html, /退出登录/);
  assert.doesNotMatch(html, /机会列表/);
  assert.doesNotMatch(html, /机会摘要/);
  assert.doesNotMatch(html, /条机会/);
  assert.doesNotMatch(html, /data-sidehustle-open/);
  assert.doesNotMatch(html, /data-sidehustle-template/);
  assert.doesNotMatch(html, /AI 漫剧创作兼职招人/);
});
