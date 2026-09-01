export const COOKIE_NAME = "wall_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 15 * 60 * 1000;
const FORGOT_WINDOW_MS = 10 * 60 * 1000;
const FORGOT_MAX_ATTEMPTS = 8;
const forgotHits = new Map();
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_RESEND_FROM = "onboarding@resend.dev";

const PUBLIC_EXACT = new Set(["/news", "/twitter", "/login", "/favicon.ico", "/favicon.svg", "/robots.txt"]);

export function isPublicPath(pathname) {
  const path = pathname || "/";
  if (PUBLIC_EXACT.has(path)) return true;
  return (
    path.startsWith("/news/")
    || path.startsWith("/twitter/")
    || path.startsWith("/login/")
    || path.startsWith("/_astro/")
    || path.startsWith("/favicon.")
  );
}

export function safeReturnPath(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("://") || next.includes("\\")) {
    return "/";
  }
  if (next === "/login" || next.startsWith("/login/")) return "/";
  return next;
}

export async function handleWallRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (isAuthPath(path, "/logout") && request.method === "POST") {
    return redirectWithCookie(new URL("/login/", url).toString(), clearCookie());
  }

  if (isAuthPath(path, "/login/forgot") && request.method === "POST") {
    return handleForgot(request, env, url);
  }

  if (isAuthPath(path, "/login/reset") && request.method === "GET") {
    return handleReset(request, env, url);
  }

  if (isAuthPath(path, "/login") && request.method === "POST") {
    return handleLogin(request, env, url);
  }

  if (isPublicPath(path)) {
    return next();
  }

  if (await readSession(request, env)) {
    return next();
  }

  const login = new URL("/login/", url);
  login.searchParams.set("next", `${url.pathname}${url.search}` || "/");
  return Response.redirect(login, 302);
}

function isAuthPath(pathname, base) {
  return pathname === base || pathname === `${base}/`;
}

function hasSecrets(env) {
  return Boolean(env?.WALL_USERNAME && env?.WALL_PASSWORD && env?.WALL_SESSION_SECRET);
}

async function handleLogin(request, env, url) {
  const form = await request.formData();
  const next = safeReturnPath(String(form.get("next") ?? "/"));
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const userOk = hasSecrets(env) && await timingSafeEqualString(username, env.WALL_USERNAME);
  const passOk = hasSecrets(env) && await timingSafeEqualString(password, env.WALL_PASSWORD ?? "");
  if (!userOk || !passOk) {
    const login = new URL("/login/", url);
    login.searchParams.set("error", "1");
    login.searchParams.set("next", next);
    return Response.redirect(login, 302);
  }

  const cookie = await sessionCookie(env.WALL_USERNAME, env.WALL_SESSION_SECRET);
  return redirectWithCookie(new URL(next, url).toString(), cookie);
}

async function handleForgot(request, env, url) {
  const form = await request.formData();
  const next = safeReturnPath(String(form.get("next") ?? "/"));
  const email = normalizeEmail(form.get("email"));
  const expected = normalizeEmail(env?.WALL_RECOVERY_EMAIL);
  const matched = expected.length > 0 && await timingSafeEqualString(email, expected);
  const limited = isForgotRateLimited(request);

  if (matched && !limited && env?.RESEND_API_KEY && env?.WALL_SESSION_SECRET && env?.WALL_USERNAME) {
    try {
      const token = await createResetToken(env.WALL_SESSION_SECRET);
      const reset = new URL("/login/reset/", url);
      reset.searchParams.set("token", token);
      if (next !== "/") reset.searchParams.set("next", next);
      await sendResendLoginLink(env, expected, reset.toString());
    } catch (error) {
      console.error("wall-auth: forgot-password send failed", error);
    }
  }

  const login = new URL("/login/", url);
  login.searchParams.set("sent", "1");
  if (next !== "/") login.searchParams.set("next", next);
  return Response.redirect(login.toString(), 302);
}

async function handleReset(request, env, url) {
  const token = url.searchParams.get("token") ?? "";
  const next = safeReturnPath(url.searchParams.get("next") ?? "/");
  if (!hasSecrets(env) || !await verifyResetToken(token, env.WALL_SESSION_SECRET)) {
    return Response.redirect(new URL("/login/?error=1&reset=expired", url).toString(), 302);
  }
  const cookie = await sessionCookie(env.WALL_USERNAME, env.WALL_SESSION_SECRET);
  return redirectWithCookie(new URL(next, url).toString(), cookie);
}

async function createResetToken(secret, expiresAt = Date.now() + RESET_TTL_MS) {
  const payloadB64 = base64urlEncode(JSON.stringify({ typ: "reset", e: expiresAt }));
  const signature = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${signature}`;
}

async function verifyResetToken(token, secret) {
  const sep = token.lastIndexOf(".");
  if (sep <= 0) return false;
  const payloadB64 = token.slice(0, sep);
  const signature = token.slice(sep + 1);
  const expected = await hmacSign(secret, payloadB64);
  if (!await timingSafeEqualString(signature, expected)) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch {
    return false;
  }
  return payload.typ === "reset" && typeof payload.e === "number" && payload.e >= Date.now();
}

async function sendResendLoginLink(env, to, resetUrl) {
  const from = String(env.RESEND_FROM || DEFAULT_RESEND_FROM);
  const subject = "收藏墙一次性登录链接";
  const text = [
    "请在 15 分钟内打开下面的链接登录收藏墙。",
    "此邮件不会发送密码，也不会修改密码。",
    "",
    resetUrl,
    "",
    "如果不是你本人操作，请忽略这封邮件。",
  ].join("\n");
  const safeHref = resetUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const html = `<p>请在 15 分钟内打开下面的链接登录收藏墙。</p><p>此邮件不会发送密码，也不会修改密码。</p><p><a href="${safeHref}">打开登录链接</a></p><p>如果不是你本人操作，请忽略这封邮件。</p>`;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!response.ok) {
    throw new Error(`resend ${response.status}`);
  }
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isForgotRateLimited(request) {
  const ip = request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")
    || "local";
  const now = Date.now();
  const entry = forgotHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    forgotHits.set(ip, { count: 1, resetAt: now + FORGOT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > FORGOT_MAX_ATTEMPTS;
}

async function readSession(request, env) {
  if (!hasSecrets(env)) return null;
  const raw = readCookie(request, COOKIE_NAME);
  const sep = raw.lastIndexOf(".");
  if (sep <= 0) return null;
  const payloadB64 = raw.slice(0, sep);
  const signature = raw.slice(sep + 1);
  const expected = await hmacSign(env.WALL_SESSION_SECRET, payloadB64);
  if (!await timingSafeEqualString(signature, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch {
    return null;
  }
  if (payload.u !== env.WALL_USERNAME || typeof payload.e !== "number" || payload.e < Date.now()) {
    return null;
  }
  return payload;
}

async function sessionCookie(username, secret) {
  const payloadB64 = base64urlEncode(JSON.stringify({ u: username, e: Date.now() + SESSION_TTL_MS }));
  const signature = await hmacSign(secret, payloadB64);
  return `${COOKIE_NAME}=${payloadB64}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function redirectWithCookie(location, cookie) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Set-Cookie": cookie,
    },
  });
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return "";
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64urlEncode(new Uint8Array(signature));
}

async function timingSafeEqualString(left, right) {
  const digest = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function base64urlEncode(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64urlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
