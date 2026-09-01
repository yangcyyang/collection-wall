import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { COOKIE_NAME, handleWallRequest, isPublicPath } from "../functions/auth.js";

const SECRETS = {
  WALL_USERNAME: "wall-user",
  WALL_PASSWORD: "correct-horse",
  WALL_SESSION_SECRET: "session-secret-for-tests-32b",
};

async function dispatch(path, { method = "GET", env = SECRETS, body, cookie, headers } = {}) {
  const url = new URL(path, "https://wall.yangcyyang.cn");
  const request = new Request(url, {
    method,
    body,
    headers: {
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    redirect: "manual",
  });
  return handleWallRequest({
    request,
    env,
    next: async () => new Response("static-ok", { status: 200 }),
  });
}

function loginBody(username, password, next = "/") {
  return new URLSearchParams({ username, password, next });
}

function sessionCookie(response) {
  const raw = response.headers.get("Set-Cookie") ?? "";
  const match = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? `${COOKIE_NAME}=${match[1]}` : "";
}

test("资讯与推特日报公开，未登录也能拿到静态响应", async () => {
  assert.equal(isPublicPath("/news/"), true);
  assert.equal(isPublicPath("/twitter/"), true);
  assert.equal((await dispatch("/news/")).status, 200);
  assert.equal(await (await dispatch("/news/")).text(), "static-ok");
  assert.equal((await dispatch("/twitter/")).status, 200);
  assert.equal((await dispatch("/twitter/2026-09-01.json")).status, 200);
});

test("收藏墙与技能未带 cookie 时重定向到登录并带上返回地址", async () => {
  assert.equal(isPublicPath("/"), false);
  assert.equal(isPublicPath("/skills/"), false);

  const home = await dispatch("/");
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("Location"), "https://wall.yangcyyang.cn/login/?next=%2F");
  assert.notEqual(await home.text(), "static-ok");

  const skills = await dispatch("/skills/");
  assert.equal(skills.status, 302);
  assert.equal(skills.headers.get("Location"), "https://wall.yangcyyang.cn/login/?next=%2Fskills%2F");
});

test("正确登录写入 httpOnly Secure 签名 cookie，而不是明文密码", async () => {
  const response = await dispatch("/login/", {
    method: "POST",
    body: loginBody("wall-user", "correct-horse", "/skills/"),
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://wall.yangcyyang.cn/skills/");
  const setCookie = response.headers.get("Set-Cookie") ?? "";
  assert.match(setCookie, new RegExp(`${COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.doesNotMatch(setCookie, /correct-horse/);

  const gated = await dispatch("/skills/", { cookie: sessionCookie(response) });
  assert.equal(gated.status, 200);
  assert.equal(await gated.text(), "static-ok");
});

test("退出登录只接受 POST 并清除会话 cookie", async () => {
  const loggedIn = await dispatch("/login/", {
    method: "POST",
    body: loginBody("wall-user", "correct-horse", "/"),
  });
  const cookie = sessionCookie(loggedIn);
  assert.equal((await dispatch("/", { cookie })).status, 200);

  const logout = await dispatch("/logout/", { method: "POST", cookie });
  assert.equal(logout.status, 302);
  assert.match(logout.headers.get("Location") ?? "", /\/login\//);
  assert.match(logout.headers.get("Set-Cookie") ?? "", /Max-Age=0/);

  const getLogout = await dispatch("/logout/", { method: "GET", cookie });
  assert.equal(getLogout.headers.get("Set-Cookie"), null);
  assert.equal((await dispatch("/", { cookie })).status, 200);
});

test("错误密码拒绝登录且不发会话 cookie", async () => {
  const response = await dispatch("/login/", {
    method: "POST",
    body: loginBody("wall-user", "wrong-password", "/"),
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://wall.yangcyyang.cn/login/?error=1&next=%2F");
  assert.equal(response.headers.get("Set-Cookie"), null);

  const stillGated = await dispatch("/");
  assert.equal(stillGated.status, 302);
});

test("生产缺密钥时锁定页失败关闭，资讯仍可访问", async () => {
  const empty = {};
  const news = await dispatch("/news/", { env: empty });
  assert.equal(news.status, 200);

  const home = await dispatch("/", { env: empty });
  assert.equal(home.status, 302);
  assert.match(home.headers.get("Location") ?? "", /\/login\//);
  assert.notEqual(await home.text(), "static-ok");

  const login = await dispatch("/login/", {
    method: "POST",
    env: empty,
    body: loginBody("anyone", "anything", "/"),
  });
  assert.equal(login.status, 302);
  assert.match(login.headers.get("Location") ?? "", /error=1/);
  assert.equal(login.headers.get("Set-Cookie"), null);
});

test("_routes.json 不得把锁定静态资源排除出 Functions", async () => {
  const routes = JSON.parse(await readFile(resolve("site/public/_routes.json"), "utf8"));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ["/*"]);
  const allowed = new Set(["/_astro/*", "/news", "/news/*", "/twitter", "/twitter/*"]);
  for (const rule of routes.exclude) {
    assert.ok(allowed.has(rule), `意外的 exclude: ${rule}`);
  }
  assert.ok(!routes.exclude.some((rule) => rule.includes("login") || rule.includes("covers") || rule.includes("skills")));
});

test("私有静态资源不能未登录直链绕过", async () => {
  for (const path of [
    "/covers/seed-01.jpg",
    "/skills/covers/mattpocock-skills.webp",
    "/knowledge/",
    "/prompts/",
    "/radar/",
  ]) {
    const response = await dispatch(path);
    assert.equal(response.status, 302, path);
    assert.match(response.headers.get("Location") ?? "", /\/login\//, path);
  }
});
