const HAN = /\p{Script=Han}/u;

const WORDS = {
  ads: "广告",
  afk: "挂机",
  agent: "智能体",
  agentic: "智能体化",
  agents: "智能体",
  api: "接口",
  audit: "审计",
  auto: "自动",
  browser: "浏览器",
  caching: "缓存",
  calls: "调用",
  checkpoint: "检查点",
  ci: "持续集成",
  cli: "命令行",
  clinicians: "临床",
  code: "代码",
  coding: "编码",
  commerce: "商业",
  compute: "算力",
  computer: "电脑",
  consumers: "消费端",
  context: "上下文",
  cost: "成本",
  credits: "额度",
  data: "数据",
  decision: "决策",
  deployment: "部署",
  distribution: "分发",
  enterprise: "企业",
  evals: "评测",
  feedback: "反馈",
  finances: "财务",
  financial: "金融",
  fleet: "机群",
  flash: "快速版",
  frontier: "前沿",
  gated: "门控",
  governance: "治理",
  gtm: "市场进入",
  gui: "图形界面",
  hardware: "硬件",
  harness: "编排",
  hitl: "人在回路",
  household: "家庭",
  human: "人工",
  hybrid: "混合",
  image: "图像",
  knowledge: "知识",
  layer: "层",
  live: "实时",
  local: "本地",
  marketplace: "市集",
  mcp: "模型上下文协议",
  memory: "记忆",
  microvm: "微型虚拟机",
  mobile: "移动端",
  mode: "模式",
  models: "模型",
  moe: "混合专家",
  multi: "多",
  multimodal: "多模态",
  observability: "可观测性",
  office: "办公",
  omni: "全模态",
  omnimodal: "全模态",
  open: "开放",
  orchestration: "编排",
  oss: "开源",
  passkey: "通行密钥",
  persistent: "持久",
  playbook: "行动手册",
  plugins: "插件",
  pm: "项目管理",
  portable: "便携",
  pr: "拉取请求",
  pricing: "定价",
  privacy: "隐私",
  projects: "项目",
  qa: "测试",
  realtime: "实时",
  research: "研究",
  rl: "强化学习",
  router: "路由",
  rpa: "机器人流程自动化",
  rsi: "递归自改进",
  runtime: "运行时",
  safety: "安全",
  sandbox: "沙箱",
  screen: "屏幕",
  secure: "安全",
  security: "安全",
  services: "服务",
  shared: "共享",
  skill: "技能",
  skills: "技能",
  sms: "短信",
  speech: "语音",
  sponsored: "赞助",
  structured: "结构化",
  support: "支持",
  teammate: "队友",
  tee: "可信执行环境",
  tool: "工具",
  tools: "工具",
  translation: "翻译",
  trust: "信任",
  typesafe: "类型安全",
  ui: "界面",
  versioning: "版本",
  vertical: "垂直",
  video: "视频",
  visual: "可视化",
  vm: "虚拟机",
  voice: "语音",
  web: "网页",
  weights: "权重",
  wiki: "维基",
};

const PHRASES = {
  "always on": "常驻",
  "ci/cd": "持续集成与交付",
  "computer use": "电脑操控",
  "gated deployment": "门控发布",
  "git worktree": "Git 工作树",
  "mcp ui": "MCP 界面",
  "no code": "无代码",
  "on device": "端侧",
  "portable work": "可携带工作",
  "teach by showing": "示范教学",
};

const TAGLINES = {
  "local ai agent memory served via mcp": "经 MCP 提供的本地 AI 智能体记忆",
  "the deterministic memory layer for ai": "面向 AI 的确定性记忆层",
  "assign work to ai agents, like any teammate": "像分派给同事一样，把工作交给 AI 智能体",
  "open-source email marketing with managed smtp": "带托管 SMTP 的开源邮件营销",
  "open omnimodal intelligence, trained in public": "公开训练的开放全模态智能",
  "the laptop your android phone has been waiting for": "你的 Android 手机一直在等的那台笔记本",
  "a standalone desktop editor for markdown and mdx": "独立的 Markdown 与 MDX 桌面编辑器",
  "stop waiting for tokens, and start shipping": "别再干等 token，开始交付",
  "clipboard that adapts to wherever you paste it": "会按粘贴位置自动适配的剪贴板",
  "your ai agent builds the app. you stay in control": "AI 智能体负责搭建应用，控制权仍在你手里",
};

function hasHan(value) {
  return HAN.test(String(value ?? ""));
}

function normKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function taglineKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.。!！]+$/g, "");
}

function bilingual(english, chinese) {
  const en = english.trim();
  const zh = String(chinese ?? "").trim();
  if (!zh || zh.toLowerCase() === en.toLowerCase()) return en;
  return `${en}（${zh}）`;
}

function joinZh(parts) {
  return parts.reduce((acc, part) => {
    if (!acc) return part;
    const needSpace = /[A-Za-z0-9]$/.test(acc) || /^[A-Za-z0-9]/.test(part);
    return needSpace ? `${acc} ${part}` : `${acc}${part}`;
  }, "");
}

export function formatTag(tag) {
  const text = typeof tag === "string" ? tag.trim() : "";
  if (!text || hasHan(text)) return text;
  const key = normKey(text);
  if (PHRASES[key]) return bilingual(text, PHRASES[key]);
  if (WORDS[key]) return bilingual(text, WORDS[key]);
  const parts = key.split(" ").filter(Boolean);
  if (parts.length > 1 && parts.every((part) => WORDS[part])) {
    return bilingual(text, joinZh(parts.map((part) => WORDS[part])));
  }
  return text;
}

export function translateTagline(english, taglineZh = "") {
  const preset = typeof taglineZh === "string" ? taglineZh.trim() : "";
  if (preset) return preset;
  const text = typeof english === "string" ? english.trim() : "";
  if (!text || hasHan(text)) return "";
  return TAGLINES[taglineKey(text)] ?? "";
}
