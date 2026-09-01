import { handleRequest } from "./lib/auth.js";

export async function onRequest(context) {
  return handleRequest(context.request, {
    env: context.env ?? {},
    next: () => context.next(),
  });
}
