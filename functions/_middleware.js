import { handleWallRequest } from "./auth.js";

export async function onRequest(context) {
  return handleWallRequest(context);
}
