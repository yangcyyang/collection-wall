import assert from "node:assert/strict";
import test from "node:test";

import {
  COOKIE_NAME,
  credentialsConfigured,
  handleRequest,
  isPublicPath,
} from "../functions/lib/auth.js";

const ENV = {
  WALL_USERNAME: "cy",
  WALL_PASSWORD: "correct-horse",
  WALL_SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
};

function request(path, init = {}) {
  return new Request(`https://wall.example${path}`, init);
}

async function nextProtected() {
  return new Response("<html>私密内容</html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handle(path, init = {}, env = ENV, next = nextProtected) {
  return handleRequest(request(path, init), { env, next });
}

function cookieFrom(response) {
  return response.headers.get("set-cookie") ?? "";
}

test("isPublicPath 只放行登录页、退出、样式和 favicon", () => {
  assert.equal(isPublicPath("/login/"), true);
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/logout/"), true);
  assert.equal(isPublicPath("/_astro/login.B1.css"), true);
  assert.equal(isPublicPath("/favicon.ico"), true);
  assert.equal(isPublicPath("/"), false);
  assert.equal(isPublicPath("/news/"), false);
  assert.equal(isPublicPath("/twitter/"), false);
  assert.equal(isPublicPath("/_astro/page.D2.js"), false);
  assert.equal(isPublicPath("/prompts/data.json"), false);
});

test("缺少任一环境变量时视为未配置，必须失败关闭", () => {
  assert.equal(credentialsConfigured(ENV), true);
  assert.equal(credentialsConfigured({ ...ENV, WALL_PASSWORD: "" }), false);
  assert.equal(credentialsConfigured({ WALL_USERNAME: "cy" }), false);
  assert.equal(credentialsConfigured({}), false);
});

test("未带 cookie 访问首页重定向到登录页，不返回正文", async () => {
  const response = await handle("/");
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("location"), "https://wall.example").pathname, "/login/");
  assert.doesNotMatch(await response.text(), /私密内容/);
});

test("未带 cookie 访问栏目页与 JS 资源一律重定向", async () => {
  for (const path of ["/news/", "/twitter/", "/knowledge/", "/prompts/", "/skills/", "/radar/", "/_astro/wall.js"]) {
    const response = await handle(path);
    assert.equal(response.status, 302, path);
    assert.match(response.headers.get("location") ?? "", /\/login\//, path);
  }
});

test("GET 登录页放行，不要求 cookie", async () => {
  const response = await handle("/login/", {}, ENV, async () => new Response("<form>登录</form>", { status: 200 }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /登录/);
});

test("错误密码不设会话 cookie，也不放行正文", async () => {
  const body = new URLSearchParams({ username: "cy", password: "wrong-password" });
  const response = await handle("/login/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") ?? "", /\/login\//);
  assert.match(response.headers.get("location") ?? "", /error=1/);
  assert.doesNotMatch(cookieFrom(response), new RegExp(`${COOKIE_NAME}=[^;]+`));
  assert.doesNotMatch(cookieFrom(response), /correct-horse/);
});

test("正确账号密码写入 httpOnly Secure 签名 cookie，且不是明文密码", async () => {
  const body = new URLSearchParams({ username: "cy", password: "correct-horse" });
  const response = await handle("/login/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location"), "https://wall.example").pathname, "/");
  const cookie = cookieFrom(response);
  assert.match(cookie, new RegExp(`${COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.doesNotMatch(cookie, /correct-horse/);
  assert.doesNotMatch(cookie, /WALL_PASSWORD/);
});

test("有效会话 cookie 放行受保护页面", async () => {
  const login = await handle("/login/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "cy", password: "correct-horse" }),
  });
  const token = cookieFrom(login).match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1];
  assert.ok(token);
  const response = await handle("/", {
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /私密内容/);
});

test("缺少环境变量时即使有 cookie 也失败关闭，只给登录页", async () => {
  const login = await handle("/login/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "cy", password: "correct-horse" }),
  });
  const token = cookieFrom(login).match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1];
  const response = await handle("/", {
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  }, { WALL_USERNAME: "cy" });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /\/login\//);
  assert.doesNotMatch(await response.text(), /私密内容/);
});

test("环境变量缺失时登录请求失败，不颁发 cookie", async () => {
  const response = await handle("/login/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "cy", password: "correct-horse" }),
  }, {});
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") ?? "", /error=1/);
  assert.doesNotMatch(cookieFrom(response), new RegExp(`${COOKIE_NAME}=[^;]+`));
});

test("篡改过的 cookie 视为未登录", async () => {
  const response = await handle("/", {
    headers: { cookie: `${COOKIE_NAME}=tampered.token` },
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /\/login\//);
});

test("POST 退出登录清除 cookie 并回到登录页", async () => {
  const response = await handle("/logout/", { method: "POST" });
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location"), "https://wall.example").pathname, "/login/");
  assert.match(cookieFrom(response), new RegExp(`${COOKIE_NAME}=;`));
  assert.match(cookieFrom(response), /Max-Age=0/i);
});

test("GET /logout/ 不清除会话，避免预取把人踢出去", async () => {
  const response = await handle("/logout/");
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("location"), "https://wall.example").pathname, "/login/");
  assert.equal(cookieFrom(response), "");
});

test("错误用户名即使密码正确也不登录", async () => {
  const response = await handle("/login/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "not-cy", password: "correct-horse" }),
  });
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") ?? "", /error=1/);
  assert.doesNotMatch(cookieFrom(response), new RegExp(`${COOKIE_NAME}=[^;]+`));
});

test("过期或指向外站的 next 都回首页，外链不会被跟走", async () => {
  const { createSessionToken, handleRequest } = await import("../functions/lib/auth.js");
  const expired = await createSessionToken("cy", ENV.WALL_SESSION_SECRET, Date.now() - 8 * 24 * 60 * 60 * 1000);
  const expiredResponse = await handle("/", { headers: { cookie: `${COOKIE_NAME}=${expired}` } });
  assert.equal(expiredResponse.status, 302);

  const login = await handle("/login/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "cy", password: "correct-horse", next: "//evil.example/" }),
  });
  assert.equal(login.status, 303);
  assert.equal(new URL(login.headers.get("location"), "https://wall.example").pathname, "/");
  assert.equal(handleRequest.length, 2);
});

test("畸形 cookie 不当成 500，按未登录处理", async () => {
  const response = await handle("/", {
    headers: { cookie: `${COOKIE_NAME}=%E0%A4%A` },
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /\/login\//);
});
