export function loginQueryState(search) {
  const query = typeof search === "string" && search.startsWith("?") ? search.slice(1) : (search ?? "");
  const params = new URLSearchParams(query);
  return {
    next: safeReturnPath(params.get("next")),
    error: params.get("error") === "1",
  };
}

function safeReturnPath(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("://") || next.includes("\\")) {
    return "/";
  }
  if (next === "/login" || next.startsWith("/login/")) return "/";
  return next;
}
