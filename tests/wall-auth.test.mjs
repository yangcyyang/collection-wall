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

const RECOVERY = {
  ...SECRETS,
  WALL_RECOVERY_EMAIL: "owner@example.com",
  RESEND_API_KEY: "re_test_key",
  RESEND_FROM: "wall@example.com",
};

function forgotBody(email, next = "/") {
  return new URLSearchParams({ email, next });
}

async function withMockedFetch(impl, run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return impl(input, init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

async function signPayload(secret, payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const payloadB64 = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigBytes = new Uint8Array(signature);
  let sigBinary = "";
  for (const byte of sigBytes) sigBinary += String.fromCharCode(byte);
  const sigB64 = btoa(sigBinary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  return `${payloadB64}.${sigB64}`;
}

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
  assert.equal(isPublicPath("/radar/"), false);
  assert.equal(isPublicPath("/xianyu/"), false);
  assert.equal(isPublicPath("/xiaohongshu/"), false);
  assert.equal(isPublicPath("/sidehustle/"), false);
  assert.equal(isPublicPath("/api/ask-ai"), false);

  const home = await dispatch("/");
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("Location"), "https://wall.yangcyyang.cn/login/?next=%2F");
  assert.notEqual(await home.text(), "static-ok");

  const skills = await dispatch("/skills/");
  assert.equal(skills.status, 302);
  assert.equal(skills.headers.get("Location"), "https://wall.yangcyyang.cn/login/?next=%2Fskills%2F");

  const sidehustle = await dispatch("/sidehustle/");
  assert.equal(sidehustle.status, 302);
  assert.equal(sidehustle.headers.get("Location"), "https://wall.yangcyyang.cn/login/?next=%2Fsidehustle%2F");
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

test("错误恢复邮箱也返回通用成功且不发信", async () => {
  await withMockedFetch(
    async () => new Response("{}", { status: 200 }),
    async (calls) => {
      const response = await dispatch("/login/forgot/", {
        method: "POST",
        env: RECOVERY,
        body: forgotBody("stranger@example.com"),
      });
      assert.equal(response.status, 302);
      assert.match(response.headers.get("Location") ?? "", /\/login\/\?.*sent=1/);
      assert.equal(response.headers.get("Set-Cookie"), null);
      assert.equal(calls.length, 0);
    },
  );
});

test("匹配恢复邮箱时用 mock fetch 发一封含地址和 token 链接的 Resend 邮件", async () => {
  await withMockedFetch(
    async () => new Response("{}", { status: 200 }),
    async (calls) => {
      const response = await dispatch("/login/forgot/", {
        method: "POST",
        env: RECOVERY,
        body: forgotBody("Owner@example.com"),
      });
      assert.equal(response.status, 302);
      assert.match(response.headers.get("Location") ?? "", /\/login\/\?.*sent=1/);
      assert.equal(response.headers.get("Set-Cookie"), null);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://api.resend.com/emails");
      const headers = calls[0].init.headers;
      const auth = headers.Authorization ?? headers.authorization;
      assert.match(auth, /Bearer re_test_key/);
      const payload = JSON.parse(calls[0].init.body);
      const to = Array.isArray(payload.to) ? payload.to.join(" ") : String(payload.to);
      assert.match(to, /owner@example.com/);
      const body = `${payload.subject ?? ""}\n${payload.html ?? ""}\n${payload.text ?? ""}`;
      assert.match(payload.subject ?? "", /15 分钟/);
      assert.match(body, /https:\/\/wall\.yangcyyang\.cn\/login\/reset\/?\?token=/);
      assert.doesNotMatch(body, /correct-horse/);
      assert.doesNotMatch(JSON.stringify(payload), /correct-horse/);

      const tokenMatch = String(payload.text).match(/[?&]token=([^&\s]+)/);
      assert.ok(tokenMatch, "邮件正文应带 token");
      const reset = await dispatch(`/login/reset/?token=${tokenMatch[1]}`);
      assert.equal(reset.status, 302);
      assert.equal(reset.headers.get("Location"), "https://wall.yangcyyang.cn/");
      const gated = await dispatch("/", { cookie: sessionCookie(reset) });
      assert.equal(gated.status, 200);
    },
  );
});

test("未配置 Resend 或发信失败时仍返回通用成功", async () => {
  await withMockedFetch(
    async () => {
      throw new Error("network down");
    },
    async (calls) => {
      const noKey = await dispatch("/login/forgot/", {
        method: "POST",
        env: { ...SECRETS, WALL_RECOVERY_EMAIL: "owner@example.com" },
        body: forgotBody("owner@example.com"),
      });
      assert.equal(noKey.status, 302);
      assert.match(noKey.headers.get("Location") ?? "", /sent=1/);
      assert.equal(calls.length, 0);

      const failed = await dispatch("/login/forgot/", {
        method: "POST",
        env: RECOVERY,
        body: forgotBody("owner@example.com"),
      });
      assert.equal(failed.status, 302);
      assert.match(failed.headers.get("Location") ?? "", /sent=1/);
      assert.equal(failed.headers.get("Set-Cookie"), null);
    },
  );
});

test("waitUntil 发信时响应立刻返回通用成功", async () => {
  let releaseFetch;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  await withMockedFetch(
    async () => {
      await fetchGate;
      return new Response("{}", { status: 200 });
    },
    async (calls) => {
      let pending;
      const url = new URL("/login/forgot/", "https://wall.yangcyyang.cn");
      const response = await handleWallRequest({
        request: new Request(url, {
          method: "POST",
          body: forgotBody("owner@example.com"),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          redirect: "manual",
        }),
        env: RECOVERY,
        next: async () => new Response("static-ok", { status: 200 }),
        waitUntil: (work) => {
          pending = work;
        },
      });
      assert.equal(response.status, 302);
      assert.match(response.headers.get("Location") ?? "", /sent=1/);
      releaseFetch();
      await pending;
      assert.equal(calls.length, 1);
    },
  );
});

test("过期或损坏的重置 token 不写会话 cookie", async () => {
  const expired = await signPayload(SECRETS.WALL_SESSION_SECRET, {
    typ: "reset",
    e: Date.now() - 60_000,
  });
  const expiredRes = await dispatch(`/login/reset/?token=${expired}`);
  assert.equal(expiredRes.status, 302);
  assert.match(expiredRes.headers.get("Location") ?? "", /reset=expired/);
  assert.equal(expiredRes.headers.get("Set-Cookie"), null);
  assert.match(expiredRes.headers.get("Cache-Control") ?? "", /no-store/);

  const bad = await dispatch("/login/reset/?token=not-a-token");
  assert.equal(bad.status, 302);
  assert.match(bad.headers.get("Location") ?? "", /\/login\/\?/);
  assert.equal(bad.headers.get("Set-Cookie"), null);
  assert.equal((await dispatch("/")).status, 302);
});

test("有效重置 token 写入与普通登录相同的会话 cookie", async () => {
  const token = await signPayload(SECRETS.WALL_SESSION_SECRET, {
    typ: "reset",
    e: Date.now() + 15 * 60 * 1000,
  });
  const response = await dispatch(`/login/reset/?token=${encodeURIComponent(token)}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://wall.yangcyyang.cn/");
  const setCookie = response.headers.get("Set-Cookie") ?? "";
  assert.match(setCookie, new RegExp(`${COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.doesNotMatch(setCookie, /correct-horse/);

  const gated = await dispatch("/", { cookie: sessionCookie(response) });
  assert.equal(gated.status, 200);
  assert.equal(await gated.text(), "static-ok");
});

test("忘记密码与重置路径保持公开，资讯推特仍可未登录访问", async () => {
  assert.equal(isPublicPath("/login/forgot/"), true);
  assert.equal(isPublicPath("/login/reset/"), true);
  assert.equal((await dispatch("/news/")).status, 200);
  assert.equal((await dispatch("/twitter/")).status, 200);
});

test("Ask AI 接口与收藏墙一样需要登录", async () => {
  const locked = await dispatch("/api/ask-ai", { method: "POST", body: JSON.stringify({ query: "PPT" }), headers: { "Content-Type": "application/json" } });
  assert.equal(locked.status, 302);
  assert.match(locked.headers.get("Location") ?? "", /\/login\//);

  const loggedIn = await dispatch("/login/", {
    method: "POST",
    body: loginBody("wall-user", "correct-horse", "/"),
  });
  const opened = await dispatch("/api/ask-ai", {
    method: "POST",
    cookie: sessionCookie(loggedIn),
    body: JSON.stringify({ query: "PPT" }),
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(opened.status, 200);
});

test("私有静态资源不能未登录直链绕过", async () => {
  for (const path of [
    "/covers/seed-01.jpg",
    "/skills/covers/mattpocock-skills.webp",
    "/knowledge/",
    "/prompts/",
    "/radar/",
    "/xianyu/",
    "/xiaohongshu/",
    "/sidehustle/",
    "/api/ask-ai",
  ]) {
    const response = await dispatch(path);
    assert.equal(response.status, 302, path);
    assert.match(response.headers.get("Location") ?? "", /\/login\//, path);
  }
});
