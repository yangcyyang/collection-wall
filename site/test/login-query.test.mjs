import assert from "node:assert/strict";
import test from "node:test";

import { loginQueryState } from "../src/lib/login-query.mjs";

test("登录页从查询串读取回跳地址和错误标记", () => {
  assert.deepEqual(loginQueryState("?next=%2Fskills%2F"), { next: "/skills/", error: false });
  assert.deepEqual(loginQueryState("?error=1&next=%2F"), { next: "/", error: true });
});

test("登录页拒绝协议相对地址和登录循环", () => {
  assert.equal(loginQueryState("?next=https://evil.example/").next, "/");
  assert.equal(loginQueryState("?next=//evil.example/").next, "/");
  assert.equal(loginQueryState("?next=/\\evil").next, "/");
  assert.equal(loginQueryState("?next=/login/?x=1").next, "/");
});
