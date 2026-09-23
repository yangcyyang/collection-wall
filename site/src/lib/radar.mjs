import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const radarDirectory = resolve(process.cwd(), "../data/radar");
const defaultSignals = resolve(radarDirectory, "signals.json");
const defaultProducts = resolve(radarDirectory, "products.json");
const defaultWatchlist = resolve(radarDirectory, "watchlist.json");

function emptyFeed() {
  return { source: "", title: "", updated_at: "", count: 0, items: [] };
}

async function readFeed(file) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const items = Array.isArray(raw.items) ? raw.items : [];
    return {
      source: raw.source ?? "",
      title: raw.title ?? "",
      updated_at: raw.updated_at ?? "",
      count: items.length,
      items,
    };
  } catch {
    return emptyFeed();
  }
}

function byScoreDesc(a, b) {
  return (b.score ?? 0) - (a.score ?? 0);
}

export async function getSignalsFeed(file = defaultSignals) {
  return readFeed(file);
}

export async function getProductsFeed(file = defaultProducts) {
  return readFeed(file);
}

export async function getWatchlistFeed(file = defaultWatchlist) {
  return readFeed(file);
}

export async function getSignals(file = defaultSignals) {
  return (await getSignalsFeed(file)).items;
}

export async function getProducts(file = defaultProducts) {
  return (await getProductsFeed(file)).items;
}

export async function getWatchlist(file = defaultWatchlist) {
  return (await getWatchlistFeed(file)).items;
}

export async function getSignalById(id, file = defaultSignals) {
  return (await getSignals(file)).find((item) => item.id === id) ?? null;
}

export async function getProductById(id, file = defaultProducts) {
  return (await getProducts(file)).find((item) => item.id === id) ?? null;
}

export async function getWatchlistById(id, file = defaultWatchlist) {
  return (await getWatchlist(file)).find((item) => item.id === id) ?? null;
}

export function relatedSignalLabels(ids = [], signals = []) {
  return ids.map((id) => signals.find((item) => item.id === id)?.title ?? id);
}

export function homepageSignals(items) {
  return items.filter((item) => item.homepage === true).sort(byScoreDesc);
}

export function homepageProducts(items) {
  return items.filter((item) => item.homepage === true || item.status === "new").sort(byScoreDesc);
}

export function emergingSignals(items) {
  return items.filter((item) => item.status === "new" || item.status === "watching");
}

export function sortEvidenceByDate(evidence) {
  return [...evidence].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

const STATUS_LABELS = {
  new: "新发现",
  watching: "观察中",
  strengthening: "加强中",
  weakening: "减弱中",
  confirmed_trend: "已成趋势",
  closed: "已关闭",
};

const CONFIDENCE_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
};

export function radarStatusClass(status = "") {
  if (status === "new") return "new";
  if (status === "strengthening" || status === "confirmed_trend") return "frequent";
  if (status === "watching") return "common";
  return "occasional";
}

export function radarStatusLabel(status = "") {
  return STATUS_LABELS[status] ?? status;
}

export function radarConfidenceLabel(confidence = "") {
  return CONFIDENCE_LABELS[confidence] ?? confidence;
}

const HAN = /\p{Script=Han}/u;

export const TAG_LABELS = {
  ads: "广告",
  afk: "挂机",
  "agent api": "智能体接口",
  "agent browser": "智能体浏览器",
  "agent commerce": "智能体商业",
  "agent computer": "智能体电脑",
  "agent consumers": "智能体消费端",
  "agent runtime": "智能体运行时",
  "agent teammate": "智能体队友",
  "agent tools": "智能体工具",
  agent: "智能体",
  agentic: "智能体化",
  "agents api": "智能体接口",
  "always on": "常驻",
  "api governance": "接口治理",
  api: "接口",
  audit: "审计",
  "auto mode": "自动模式",
  browser: "浏览器",
  "browser agent": "浏览器智能体",
  caching: "缓存",
  "ci/cd": "持续集成与交付",
  ci: "持续集成",
  cli: "命令行",
  clinicians: "临床",
  coding: "编码",
  "coding agent": "编码智能体",
  commerce: "商业",
  "computer use": "电脑操控",
  "context layer": "上下文层",
  context: "上下文",
  cost: "成本",
  credits: "额度",
  "data agent": "数据智能体",
  "decision models": "决策模型",
  distribution: "分发",
  enterprise: "企业",
  evals: "评测",
  feedback: "反馈",
  finances: "财务",
  financial: "金融",
  "financial services": "金融服务",
  fleet: "机群",
  flash: "快速版",
  frontier: "前沿",
  "gated deployment": "门控发布",
  "git worktree": "Git 工作树",
  gtm: "市场进入",
  gui: "图形界面",
  hardware: "硬件",
  harness: "编排",
  hitl: "人在回路",
  household: "家庭",
  "human checkpoint": "人工检查点",
  "hybrid compute": "混合算力",
  image: "图像",
  knowledge: "知识",
  live: "实时",
  local: "本地",
  marketplace: "市集",
  mcp: "模型上下文协议",
  "mcp ui": "MCP 界面",
  memory: "记忆",
  microvm: "微型虚拟机",
  mobile: "移动端",
  moe: "混合专家",
  "multi agent": "多智能体",
  multimodal: "多模态",
  "no code": "无代码",
  observability: "可观测性",
  office: "办公",
  omni: "全模态",
  "on device": "端侧",
  "open weights": "开放权重",
  orchestration: "编排",
  oss: "开源",
  passkey: "通行密钥",
  persistent: "持久",
  playbook: "行动手册",
  plugins: "插件",
  pm: "项目管理",
  "portable work": "可携带工作",
  pr: "拉取请求",
  pricing: "定价",
  privacy: "隐私",
  projects: "项目",
  qa: "测试",
  realtime: "实时",
  research: "研究",
  "research agents": "研究智能体",
  rl: "强化学习",
  router: "路由",
  rpa: "机器人流程自动化",
  runtime: "运行时",
  safety: "安全",
  sandbox: "沙箱",
  "screen context": "屏幕上下文",
  "secure vm": "安全虚拟机",
  security: "安全",
  "shared agent": "共享智能体",
  "shared memory": "共享记忆",
  skill: "技能",
  skills: "技能",
  sms: "短信",
  speech: "语音",
  "sponsored agents": "赞助智能体",
  "structured research": "结构化研究",
  support: "支持",
  "teach by showing": "示范教学",
  tee: "可信执行环境",
  "tool calls": "工具调用",
  translation: "翻译",
  trust: "信任",
  typesafe: "类型安全",
  versioning: "版本",
  vertical: "垂直",
  video: "视频",
  visual: "可视化",
  voice: "语音",
  web: "网页",
  wiki: "维基",
};

function tagKey(value) {
  return String(value).trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function radarTagLabel(tag) {
  const text = typeof tag === "string" ? tag.trim() : "";
  if (!text || HAN.test(text)) return text;
  const zh = TAG_LABELS[tagKey(text)];
  if (!zh || zh.toLowerCase() === text.toLowerCase()) return text;
  return `${text}（${zh}）`;
}
