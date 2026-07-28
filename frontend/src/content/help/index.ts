// frontend/src/content/help/index.ts
export interface HelpTopic {
  moduleSlug: string;
  topicSlug: string;
  title: string;
  order: number;
  audience: string[];
  body: string;
}

export interface HelpModule {
  slug: string;
  topics: HelpTopic[];
}

// gray-matter gọi Buffer (Node global) — vite.config.ts không polyfill nên crash
// "Buffer is not defined" lúc runtime. Frontmatter chỉ 3 field cố định nên tự
// parse bằng regex, khỏi cần dependency.
function parseFrontmatter(raw: string): {
  title: string;
  order: number;
  audience: string[];
  body: string;
} {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { title: "", order: 0, audience: [], body: raw };
  const [, fm, body] = m;
  const data: Record<string, string> = {};
  for (const line of fm.split(/\r?\n/)) {
    const lm = line.match(/^(\w+):\s*(.*)$/);
    if (lm) data[lm[1]] = lm[2].trim();
  }
  const audience = (data.audience ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return {
    title: (data.title ?? "").replace(/^["']|["']$/g, ""),
    order: Number(data.order) || 0,
    audience,
    body,
  };
}

// { as: "raw" } bị xóa từ Vite 6 — repo đang Vite 8, dùng query+import.
const files = import.meta.glob("./**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function buildIndex(): Map<string, HelpModule> {
  const modules = new Map<string, HelpModule>();
  for (const [path, raw] of Object.entries(files)) {
    const match = path.match(/^\.\/([^/]+)\/([^/]+)\.md$/);
    if (!match) continue;
    const [, moduleSlug, topicSlug] = match;
    const { title, order, audience, body } = parseFrontmatter(raw);
    const topic: HelpTopic = {
      moduleSlug,
      topicSlug,
      title: title || topicSlug,
      order,
      audience,
      body,
    };
    let mod = modules.get(moduleSlug);
    if (!mod) {
      mod = { slug: moduleSlug, topics: [] };
      modules.set(moduleSlug, mod);
    }
    mod.topics.push(topic);
  }
  for (const mod of modules.values()) {
    mod.topics.sort((a, b) => a.order - b.order);
  }
  return modules;
}

const HELP_INDEX = buildIndex();

export function listHelpModules(): HelpModule[] {
  return Array.from(HELP_INDEX.values());
}

export function getHelpModule(moduleSlug: string): HelpModule | undefined {
  return HELP_INDEX.get(moduleSlug);
}

export function getHelpTopic(moduleSlug: string, topicSlug: string): HelpTopic | undefined {
  return HELP_INDEX.get(moduleSlug)?.topics.find((t) => t.topicSlug === topicSlug);
}

export function hasHelpModule(moduleSlug: string): boolean {
  return HELP_INDEX.has(moduleSlug);
}
