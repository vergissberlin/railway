/**
 * Cache of the shields.io badge data used to build the shared cross-repo README footer.
 *
 * Why a cache exists at all: the footer cross-links **all** template repos, but a working copy
 * usually has only one or two submodules checked out. Reading badge data straight from the
 * submodules would therefore make it impossible to regenerate the footer without a full
 * `git submodule update --init`.
 *
 * So this behaves like a lockfile. Source of truth stays each repo's own `railway-template.json`;
 * `pnpm templates:registry:sync` refreshes the entries for whichever submodules are on disk and
 * leaves the rest untouched. `--check` (run in CI with a recursive checkout) reports drift so a
 * stale entry cannot sit here unnoticed.
 */
import fs from "node:fs";
import path from "node:path";
import { makeBadgeMarkdown } from "../template-cli-lib.mjs";

/** Registry location, relative to the monorepo root. */
export const REGISTRY_RELATIVE_PATH = "docs/railway-templates-registry.json";

/** Generated footer file consumed by `pnpm readme:footer`. */
export const FOOTER_RELATIVE_PATH = "footer.md";

const REGISTRY_HEADER_COMMENT =
  "Generated cache - run `pnpm templates:registry:sync`. Source of truth is each repo's railway-template.json.";

/** @returns {{ $comment: string, schemaVersion: number, badges: Record<string, object> }} */
export function emptyRegistry() {
  return { $comment: REGISTRY_HEADER_COMMENT, schemaVersion: 1, badges: {} };
}

/**
 * @param {string} rootPath
 * @returns {{ $comment: string, schemaVersion: number, badges: Record<string, object> }}
 */
export function readRegistry(rootPath) {
  const file = path.join(rootPath, REGISTRY_RELATIVE_PATH);
  if (!fs.existsSync(file)) return emptyRegistry();

  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion in ${REGISTRY_RELATIVE_PATH}`);
  }
  return { ...emptyRegistry(), ...raw, badges: raw.badges ?? {} };
}

/**
 * @param {string} rootPath
 * @param {{ schemaVersion: number, badges: Record<string, object> }} registry
 */
export function writeRegistry(rootPath, registry) {
  const file = path.join(rootPath, REGISTRY_RELATIVE_PATH);
  const ordered = {
    $comment: REGISTRY_HEADER_COMMENT,
    schemaVersion: 1,
    badges: sortKeys(registry.badges),
  };
  fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

/** @param {Record<string, object>} obj */
function sortKeys(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]])
  );
}

/**
 * Merges badge data from checked-out templates into the cache. Entries for absent submodules are
 * preserved — an absent submodule means "unknown", never "delete".
 *
 * @param {{ badges: Record<string, object> }} registry
 * @param {{ project: string, badge: object | null }[]} templates
 * @returns {{ next: object, added: string[], changed: string[], withoutBadge: string[] }}
 */
export function mergeRegistry(registry, templates) {
  const badges = { ...registry.badges };
  const added = [];
  const changed = [];
  const withoutBadge = [];

  for (const meta of templates) {
    if (!meta.badge) {
      withoutBadge.push(meta.project);
      continue;
    }
    const next = { label: meta.badge.label, color: meta.badge.color, logo: meta.badge.logo };
    const current = badges[meta.project];
    if (!current) {
      added.push(meta.project);
    } else if (JSON.stringify(current) !== JSON.stringify(next)) {
      changed.push(meta.project);
    }
    badges[meta.project] = next;
  }

  return { next: { ...registry, badges }, added, changed, withoutBadge };
}

/**
 * @param {{ badges: Record<string, object> }} registry
 * @param {{ path: string }[]} submodules
 * @returns {string[]} submodule paths that have no cached badge yet
 */
export function missingRegistryEntries(registry, submodules) {
  return submodules
    .map((s) => s.path)
    .filter((p) => !registry.badges[p])
    .sort();
}

/**
 * Builds the badge block. Order is the alphabetical submodule path order, so adding a template
 * never means editing an order list.
 *
 * @param {{ badges: Record<string, object> }} registry
 * @param {{ path: string, repoUrl: string }[]} submodules
 * @returns {string}
 */
export function buildFooterMarkdown(registry, submodules) {
  const missing = missingRegistryEntries(registry, submodules);
  if (missing.length) {
    throw new Error(
      `Missing badge data for ${missing.join(", ")}. ` +
        "Add a `badge` block to those repos' railway-template.json and run `pnpm templates:registry:sync`."
    );
  }

  const parts = [...submodules]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((s) => makeBadgeMarkdown(registry.badges[s.path], s.repoUrl));

  return `---\n\n${parts.join(" ")}`;
}
