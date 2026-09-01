import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("登录页是中文账号密码表单，沿用站点样式而不是独立后台主题", async () => {
  const page = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/global.css", import.meta.url), "utf8");
  const routes = await readFile(new URL("../public/_routes.json", import.meta.url), "utf8");

  assert.match(page, /import "\.\.\/styles\/global\.css"/);
  assert.match(page, /请先登录/);
  assert.match(page, /name="username"/);
  assert.match(page, /name="password"/);
  assert.match(page, /账号或密码不正确/);
  assert.match(page, /method="post"/);
  assert.match(page, /action="\/login\/"/);
  assert.match(nav, /method="post"/);
  assert.match(nav, /action="\/logout\/"/);
  assert.match(nav, /退出/);
  assert.match(css, /\.login-card/);
  assert.match(routes, /"include":\s*\[\s*"\/\*"\s*\]/);
  assert.match(routes, /"exclude":\s*\[\s*\]/);
});
