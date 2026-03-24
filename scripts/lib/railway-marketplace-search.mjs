/**
 * Railway public marketplace: fetch all published templates via GraphQL and rank by query.
 * Uses the same endpoint as other repo scripts: https://backboard.railway.app/graphql/v2
 *
 * @typedef {{ id: string, name: string, code: string, description: string, category?: string|null }} RailwayMarketplaceTemplate
 */

export const RAILWAY_GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";

/** Display name / search phrase → preferred search string (UI naming differs). */
export const QUERY_ALIASES = {
  N8N: "n8n",
  Calcom: "Cal.com",
  "Deno K V": "Deno KV",
  "Apprise Api": "Apprise",
  "Calibre Web Automated Book Downloader": "Calibre Web Automated",
  "It Tools": "IT Tools",
  Librechat: "LibreChat",
  Anythingllm: "Anything LLM",
  Openclaw: "OpenClaw",
  "Github Runner": "GitHub Runner",
  Gitlab: "GitLab",
  Wikijs: "Wiki.js",
  "Matrix Synapse With Sqlite": "Matrix Synapse SQLite",
  "N8N With Postgres And Worker": "n8n postgres worker",
  "Ollama With Open Webui": "Ollama Open WebUI",
  "Open Webui": "Open WebUI",
  "Pi Hole": "Pi-hole",
  "Pgadmin": "pgAdmin",
  Phpmyadmin: "phpMyAdmin",
  "Jupyter Notebook Python": "Jupyter",
};

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeForMatch(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} displayName
 * @returns {string}
 */
export function resolveQueryAlias(displayName) {
  const trimmed = String(displayName || "").trim();
  if (QUERY_ALIASES[trimmed]) return QUERY_ALIASES[trimmed];
  if (/^Wordpress\b/i.test(trimmed)) {
    return trimmed.replace(/^Wordpress\b/i, "WordPress");
  }
  return trimmed;
}

/**
 * @param {string} queryRaw
 * @param {RailwayMarketplaceTemplate} tpl
 * @returns {number}
 */
export function scoreTemplate(queryRaw, tpl) {
  const primary = normalizeForMatch(resolveQueryAlias(queryRaw));
  const alt = normalizeForMatch(queryRaw);
  const candidates = primary === alt ? [primary] : [primary, alt].filter(Boolean);

  const name = normalizeForMatch(tpl.name);
  const code = normalizeForMatch(tpl.code).replace(/\s+/g, "");
  const desc = normalizeForMatch(tpl.description);
  const hay = `${name} ${code} ${desc}`;

  let best = 0;
  for (const q of candidates) {
    if (!q) continue;
    let s = 0;
    if (name === q) s += 1_000_000;
    const qCompact = q.replace(/\s+/g, "");
    if (code && (code === qCompact || code === q.replace(/\s+/g, "-"))) s += 800_000;
    if (q.length > 2 && name.startsWith(q)) s += 50_000;
    if (hay.includes(q)) s += 10_000 + Math.min(q.length * 20, 2000);
    const tokens = q.split(" ").filter((t) => t.length > 1);
    for (const t of tokens) {
      if (hay.includes(t)) s += 80 * t.length;
    }
    const first = tokens[0] || q;
    if (first.length > 2 && name.includes(first)) s += 300;
    if (s > best) best = s;
  }
  return best;
}

/**
 * @param {RailwayMarketplaceTemplate[]} templates
 * @param {string} queryRaw
 * @param {number} [limit=5]
 * @returns {{ query: string, resolvedQuery: string, matches: { template: RailwayMarketplaceTemplate, score: number }[] }}
 */
export function topMatches(templates, queryRaw, limit = 5) {
  const resolved = resolveQueryAlias(queryRaw);
  const scored = templates.map((t) => ({
    template: t,
    score: scoreTemplate(queryRaw, t),
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  return {
    query: queryRaw,
    resolvedQuery: resolved,
    matches: top,
  };
}

const TEMPLATES_QUERY = `
  query MarketplaceTemplatesPage($first: Int!, $after: String) {
    templates(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          code
          description
          category
        }
      }
    }
  }
`;

/**
 * @param {string} token Railway API token (account or workspace)
 * @param {{ pageSize?: number, onPage?: (n: number, totalSoFar: number) => void }} [opts]
 * @returns {Promise<RailwayMarketplaceTemplate[]>}
 */
export async function fetchAllMarketplaceTemplates(token, opts = {}) {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 250, 1), 500);
  const out = [];
  let after = null;
  let hasNext = true;

  while (hasNext) {
    const res = await fetch(RAILWAY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: TEMPLATES_QUERY,
        variables: { first: pageSize, after },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Railway GraphQL HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join(" | "));
    }

    const conn = json.data?.templates;
    if (!conn) throw new Error("Invalid templates response");

    const edges = conn.edges ?? [];
    for (const e of edges) {
      if (e?.node) out.push(e.node);
    }

    hasNext = Boolean(conn.pageInfo?.hasNextPage);
    after = conn.pageInfo?.endCursor ?? null;
    opts.onPage?.(edges.length, out.length);
  }

  return out;
}
