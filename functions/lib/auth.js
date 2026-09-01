export const COOKIE_NAME = "wall_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

export function credentialsConfigured(env = {}) {
  return Boolean(env.WALL_USERNAME && env.WALL_PASSWORD && env.WALL_SESSION_SECRET);
}

export function isPublicPath(pathname) {
  const path = normalizePath(pathname);
  if (path === "/login/" || path === "/logout/") return true;
  if (path === "/favicon.ico" || path === "/favicon.svg") return true;
  return path.endsWith(".css");
}

export function normalizePath(pathname) {
  if (!pathname) return "/";
  const path = pathname.split("?")[0];
  if (path.length > 1 && path.endsWith("/")) return path;
  if (path === "/login" || path === "/logout") return `${path}/`;
  return path;
}

export function safeNextPath(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("\\") || raw.includes("://")) return "/";
  const path = normalizePath(raw.split("?")[0]);
  if (path === "/login/" || path === "/logout/") return "/";
  return path;
}

export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export async function createSessionToken(username, secret, now = Date.now()) {
  const payload = toBase64Url(JSON.stringify({ u: username, exp: now + SESSION_TTL_MS }));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret || !token.includes(".")) return null;
  const dot = token.lastIndexOf(".");
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await sign(payload, secret);
  if (!(await timingSafeEqualString(signature, expected))) return null;
  try {
    const data = JSON.parse(fromBase64Url(payload));
    if (!data?.u || typeof data.exp !== "number" || data.exp <= now) return null;
    return data;
  } catch {
    return null;
  }
}

export async function credentialsMatch(username, password, env) {
  if (!credentialsConfigured(env)) return false;
  const userOk = await timingSafeEqualString(username ?? "", env.WALL_USERNAME);
  const passOk = await timingSafeEqualString(password ?? "", env.WALL_PASSWORD);
  return userOk && passOk;
}

export function sessionCookie(token, { secure, maxAgeSec = SESSION_TTL_MS / 1000 }) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeSec)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie({ secure }) {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function handleRequest(request, { env = {}, next, now = Date.now() }) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const secure = url.protocol === "https:";

  if (path === "/logout/") {
    if (request.method === "POST") {
      return redirect(loginUrl(url, { next: null }), {
        status: 303,
        headers: { "set-cookie": clearSessionCookie({ secure }) },
      });
    }
    return redirect(loginUrl(url, { next: null }));
  }

  if (request.method === "POST" && path === "/login/") {
    return handleLogin(request, url, env, { secure, now });
  }

  if (isPublicPath(path) && request.method !== "POST") {
    return next();
  }

  if (!credentialsConfigured(env)) {
    return redirectToLogin(url);
  }

  const token = parseCookies(request.headers.get("cookie"))[COOKIE_NAME];
  const session = await verifySessionToken(token, env.WALL_SESSION_SECRET, now);
  if (!session) {
    return redirectToLogin(url, path);
  }

  return uncached(await next());
}

async function uncached(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleLogin(request, url, env, { secure, now }) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const nextPath = safeNextPath(String(form.get("next") || url.searchParams.get("next") || "/"));

  if (!(await credentialsMatch(username, password, env))) {
    return redirect(loginUrl(url, { error: true, next: nextPath }), { status: 303 });
  }

  const token = await createSessionToken(username, env.WALL_SESSION_SECRET, now);
  return redirect(new URL(nextPath, url).toString(), {
    status: 303,
    headers: { "set-cookie": sessionCookie(token, { secure }) },
  });
}

function redirectToLogin(url, nextPath = "") {
  return redirect(loginUrl(url, { next: nextPath && nextPath !== "/" ? nextPath : null }));
}

function loginUrl(url, { error = false, next = null } = {}) {
  const target = new URL("/login/", url);
  if (error) target.searchParams.set("error", "1");
  if (next) target.searchParams.set("next", next);
  return target.toString();
}

function redirect(location, { status = 302, headers = {} } = {}) {
  return new Response(null, {
    status,
    headers: { location, ...headers },
  });
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(signature);
}

async function timingSafeEqualString(left, right) {
  const leftHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(left)));
  const rightHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(right)));
  if (leftHash.length !== rightHash.length) return false;
  let diff = 0;
  for (let i = 0; i < leftHash.length; i += 1) diff |= leftHash[i] ^ rightHash[i];
  return diff === 0;
}

function toBase64Url(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
