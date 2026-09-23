import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatTag, translateTagline } from "../src/lib/en-zh.mjs";

test("描述性英文标签附上中文，保留原文", () => {
  assert.equal(formatTag("Pricing"), "Pricing（定价）");
  assert.equal(formatTag("MCP"), "MCP（模型上下文协议）");
  assert.equal(formatTag("Skills"), "Skills（技能）");
  assert.equal(formatTag("Frontier"), "Frontier（前沿）");
  assert.equal(formatTag("Distribution"), "Distribution（分发）");
  assert.equal(formatTag("Caching"), "Caching（缓存）");
  assert.equal(formatTag("Cost"), "Cost（成本）");
  assert.equal(formatTag("Harness"), "Harness（编排）");
  assert.equal(formatTag("harness"), "harness（编排）");
  assert.equal(formatTag("Agent"), "Agent（智能体）");
  assert.equal(formatTag("Observability"), "Observability（可观测性）");
  assert.equal(formatTag("Security"), "Security（安全）");
  assert.equal(formatTag("Agent Teammate"), "Agent Teammate（智能体队友）");
  assert.equal(formatTag("Coding Agent"), "Coding Agent（编码智能体）");
  assert.equal(formatTag("Coding agent"), "Coding agent（编码智能体）");
  assert.equal(formatTag("Browser Agent"), "Browser Agent（浏览器智能体）");
  assert.equal(formatTag("Agent Commerce"), "Agent Commerce（智能体商业）");
  assert.equal(formatTag("Shared Memory"), "Shared Memory（共享记忆）");
  assert.equal(formatTag("Structured Research"), "Structured Research（结构化研究）");
  assert.equal(formatTag("Teach-by-showing"), "Teach-by-showing（示范教学）");
  assert.equal(formatTag("No-code"), "No-code（无代码）");
  assert.equal(formatTag("HITL"), "HITL（人在回路）");
  assert.equal(formatTag("PM"), "PM（项目管理）");
  assert.equal(formatTag("OSS"), "OSS（开源）");
  assert.equal(formatTag("Ads"), "Ads（广告）");
  assert.equal(formatTag("Local"), "Local（本地）");
  assert.equal(formatTag("Clinicians"), "Clinicians（临床）");
  assert.equal(formatTag("Credits"), "Credits（额度）");
  assert.equal(formatTag("Context"), "Context（上下文）");
  assert.equal(formatTag("Sandbox"), "Sandbox（沙箱）");
  assert.equal(formatTag("Household"), "Household（家庭）");
  assert.equal(formatTag("Open Weights"), "Open Weights（开放权重）");
  assert.equal(formatTag("Computer Use"), "Computer Use（电脑操控）");
  assert.equal(formatTag("Gated Deployment"), "Gated Deployment（门控发布）");
  assert.equal(formatTag("Decision Models"), "Decision Models（决策模型）");
  assert.equal(formatTag("Agentic"), "Agentic（智能体化）");
  assert.equal(formatTag("Multimodal"), "Multimodal（多模态）");
  assert.equal(formatTag("Secure VM"), "Secure VM（安全虚拟机）");
  assert.equal(formatTag("TypeSafe"), "TypeSafe（类型安全）");
  assert.equal(formatTag("CI"), "CI（持续集成）");
  assert.equal(formatTag("Evals"), "Evals（评测）");
  assert.equal(formatTag("Finances"), "Finances（财务）");
  assert.equal(formatTag("SMS"), "SMS（短信）");
  assert.equal(formatTag("Marketplace"), "Marketplace（市集）");
  assert.equal(formatTag("Omni"), "Omni（全模态）");
});

test("品牌、型号和未知专名保持英文，已有中文不改写", () => {
  for (const tag of ["OpenAI", "Anthropic", "Kimi", "Cursor", "Claude Code", "Product Hunt", "GPT-6", "Google Labs", "Work", "Zypher"]) {
    assert.equal(formatTag(tag), tag);
  }
  assert.equal(formatTag("医疗"), "医疗");
  assert.equal(formatTag("分发"), "分发");
  assert.equal(formatTag("手机 agent"), "手机 agent");
  assert.equal(formatTag(""), "");
  assert.equal(formatTag(null), "");
});

test("Product Hunt 英文 tagline 译成中文，未知句与中文句不再造译文", () => {
  assert.equal(
    translateTagline("Local AI agent memory served via MCP"),
    "经 MCP 提供的本地 AI 智能体记忆",
  );
  assert.equal(
    translateTagline("The deterministic memory layer for AI"),
    "面向 AI 的确定性记忆层",
  );
  assert.equal(
    translateTagline("Assign work to AI agents, like any teammate"),
    "像分派给同事一样，把工作交给 AI 智能体",
  );
  assert.equal(
    translateTagline("Open-source email marketing with managed SMTP"),
    "带托管 SMTP 的开源邮件营销",
  );
  assert.equal(
    translateTagline("Open omnimodal intelligence, trained in public"),
    "公开训练的开放全模态智能",
  );
  assert.equal(
    translateTagline("The laptop your Android phone has been waiting for"),
    "你的 Android 手机一直在等的那台笔记本",
  );
  assert.equal(
    translateTagline("A standalone desktop editor for Markdown and MDX"),
    "独立的 Markdown 与 MDX 桌面编辑器",
  );
  assert.equal(
    translateTagline("Stop waiting for tokens, and start shipping"),
    "别再干等 token，开始交付",
  );
  assert.equal(
    translateTagline("Clipboard that adapts to wherever you paste it"),
    "会按粘贴位置自动适配的剪贴板",
  );
  assert.equal(
    translateTagline("Your AI agent builds the app. You stay in control."),
    "AI 智能体负责搭建应用，控制权仍在你手里",
  );
  assert.equal(translateTagline("Some brand new English tagline"), "");
  assert.equal(translateTagline("已经是中文卖点"), "");
  assert.equal(translateTagline(""), "");
  assert.equal(translateTagline("Local AI agent memory served via MCP", "自定义译文"), "自定义译文");
});

test("当前 digest 的英文 tagline 都有中文，雷达与 Product Hunt 模板会调用展示层", async () => {
  const digest = JSON.parse(await readFile(new URL("../../data/producthunt/digest.json", import.meta.url), "utf8"));
  for (const item of digest.products) {
    const zh = translateTagline(item.tagline, item.tagline_zh);
    assert.ok(zh, `${item.name} 缺少 tagline 中文`);
    assert.notEqual(zh, item.tagline);
  }

  const radar = await readFile(new URL("../src/pages/radar.astro", import.meta.url), "utf8");
  const radarViewer = await readFile(new URL("../src/components/RadarViewer.astro", import.meta.url), "utf8");
  const producthunt = await readFile(new URL("../src/pages/producthunt.astro", import.meta.url), "utf8");
  const phViewer = await readFile(new URL("../src/components/ProducthuntViewer.astro", import.meta.url), "utf8");
  assert.match(radar, /formatTag/);
  assert.match(radarViewer, /formatTag/);
  assert.match(producthunt, /translateTagline/);
  assert.doesNotMatch(producthunt, /translateTagline\(line\)/);
  assert.match(phViewer, /translateTagline/);
});
