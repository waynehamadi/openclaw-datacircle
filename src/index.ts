import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

const BASE = "https://api.datacircle.dev/v1";
const AGENT = "openclaw-datacircle/0.1.0";

type Plan = Record<string, unknown>;
type Answer = Record<string, any>;

// A plan holds about 90 keys (its terms of use, its aggregators...): an agent gets the ones that choose a plan, the rest is on its page.
const PLAN_KEYS = ["api", "rank", "provider", "plan", "score", "perThousand", "notFoundPerThousand", "billing", "pay",
  "currency", "units", "unit", "strengths", "latencyMs", "page", "pricingPage", "docs"];

function brief(plan: Plan, keys: string[] = PLAN_KEYS): Plan {
  return Object.fromEntries(keys.filter((key) => plan[key] !== null && plan[key] !== undefined).map((key) => [key, plan[key]]));
}

async function get(path: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<Answer> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const url = `${BASE}${path}${query.size ? `?${query}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": AGENT }, signal });
    if (response.ok) return (await response.json()) as Answer;
    const body = await response.text();
    if (response.status === 429 && attempt === 0) {
      const wait = Math.min(Number(response.headers.get("Retry-After")) || 30, 60);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    let words = body;
    try {
      const parsed = JSON.parse(body);
      words = parsed.slugs ? `${parsed.error}; the slugs: ${parsed.slugs.join(", ")}` : parsed.error ?? body;
    } catch {}
    throw new Error(`Datacircle's API answered ${response.status}: ${String(words).slice(0, 3000)}`);
  }
}

// A provider's best plan on an API: its lowest rank, a plan with no score having none.
function best(plans: Plan[]): Plan | null {
  const ranked = [...plans].sort((a, b) => (Number(a.rank) || Infinity) - (Number(b.rank) || Infinity));
  return ranked[0] ? brief(ranked[0], ["plan", "score", "perThousand", "page"]) : null;
}

// The API's rule for a slug: the name in lowercase letters and digits, the rest a hyphen.
function slugOf(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default defineToolPlugin({
  id: "datacircle",
  name: "Datacircle",
  description: "Find the best GTM APIs: every API on Datacircle's sheet, who is best for each, every plan and its price, and each provider's ranks, from the open Datacircle API (no key).",
  tools: (tool) => [
    tool({
      name: "datacircle_list_apis",
      label: "Datacircle: list the APIs",
      description: "Lists the GTM APIs on Datacircle's sheet (https://datacircle.dev), with each API's slug, how many plans and providers it has and its best plan. Call it first to find an API's slug.",
      workspaceAccess: false,
      parameters: Type.Object({
        query: Type.Optional(Type.String({ description: "Words of the API's name or slug, like 'email' or 'linkedin profile': the APIs that hold the most of them come first. The sheet's order when left out." })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, description: "How many APIs to give, 1 to 200. 20 when left out: the sheet has about 150." })),
      }),
      async execute({ query, limit }, _config, { signal }) {
        const apis = (await get("/apis", {}, signal)) as unknown as Answer[];
        const words = (query ?? "").toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
        const held = apis.map((api, index) => {
          const name = `${api.api} ${String(api.slug).replace(/-/g, " ")}`.toLowerCase();
          return { api, index, matched: words.filter((word) => name.includes(word)).length };
        });
        const found = held
          .filter((h) => h.matched || !words.length)
          .sort((a, b) => b.matched - a.matched || a.index - b.index)
          .map((h) => brief(h.api, ["api", "slug", "plans", "providers", "best", "bestPage", "sheetPage"]));
        return { total: found.length, apis: found.slice(0, limit ?? 20) };
      },
    }),
    tool({
      name: "datacircle_best_plans",
      label: "Datacircle: who is best for an API",
      description: "Gives an API's plans best first by their score out of 100 on Datacircle's benchmark (https://datacircle.dev), each with its rank, provider, plan, $ per 1,000 calls and its page.",
      workspaceAccess: false,
      parameters: Type.Object({
        slug: Type.String({ description: "The API's slug, like 'email-finder' or 'linkedin-profile', as datacircle_list_apis gives it." }),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "How many plans to give, 1 to 50. 10 when left out." })),
      }),
      async execute({ slug, limit }, _config, { signal }) {
        const answer = await get(`/apis/${encodeURIComponent(slugOf(slug))}/best`, { limit }, signal);
        return { ...answer, plans: (answer.plans ?? []).map((plan: Plan) => brief(plan)) };
      },
    }),
    tool({
      name: "datacircle_search_plans",
      label: "Datacircle: search the plans",
      description: "Searches every plan on Datacircle's sheet (https://datacircle.dev), or one API's, by provider or plan name, sorted by score, provider or price. Gives how many were found and up to limit of them.",
      workspaceAccess: false,
      parameters: Type.Object({
        api: Type.Optional(Type.String({ description: "Only this API's plans: its name or slug, like 'email-finder'. A provider's name goes in query, never here. Every API when left out." })),
        query: Type.Optional(Type.String({ description: "Words that must all appear in the provider's or plan's name, like 'bright data'." })),
        sort: Type.Optional(Type.String({ enum: ["score", "provider", "price"], description: "score (best first, the default), provider (A to Z) or price ($ per 1,000, lowest first)." })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "How many plans to give, 1 to 50. 10 when left out." })),
        offset: Type.Optional(Type.Integer({ minimum: 0, description: "How many found plans to skip first. 0 when left out." })),
      }),
      async execute({ api, query, sort, limit, offset }, _config, { signal }) {
        const answer = await get("/plans", { api, query, sort, limit, offset }, signal);
        return { ...answer, plans: (answer.plans ?? []).map((plan: Plan) => brief(plan)) };
      },
    }),
    tool({
      name: "datacircle_provider",
      label: "Datacircle: one provider",
      description: "Gives each API one provider sells and its rank on each on Datacircle's benchmark (https://datacircle.dev), with its best plan there.",
      workspaceAccess: false,
      parameters: Type.Object({
        slug: Type.String({ description: "The provider's slug, like 'bright-data', or its name, like 'Bright Data': the name is made a slug." }),
      }),
      async execute({ slug }, _config, { signal }) {
        const answer = await get(`/providers/${encodeURIComponent(slugOf(slug))}`, {}, signal);
        return {
          ...answer,
          apis: (answer.apis ?? []).map((entry: Answer) => ({
            ...brief(entry, ["api", "slug", "rank", "bestPage"]),
            plans: (entry.plans ?? []).length,
            best: best(entry.plans ?? []),
          })),
        };
      },
    }),
  ],
});
