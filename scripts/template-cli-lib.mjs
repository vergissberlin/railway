import fs from "node:fs";
import path from "node:path";

export const DEFAULT_FOOTER_MARKER = "<!-- footer -->";

export function readTextNormalized(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

export function parseSubmodulesFromGitmodules(content) {
  const sections = content.split(/\n(?=\[submodule ")/g);
  const submodules = [];

  for (const section of sections) {
    const pathMatch = section.match(/^\s*path\s*=\s*(.+)\s*$/m);
    const urlMatch = section.match(/^\s*url\s*=\s*(.+)\s*$/m);
    if (!pathMatch || !urlMatch) continue;
    submodules.push({
      path: pathMatch[1].trim(),
      repoUrl: toHttpsRepoUrl(urlMatch[1].trim()),
    });
  }

  return submodules;
}

export function getSubmodulesFromRoot(rootPath) {
  const gitmodulesPath = path.join(rootPath, ".gitmodules");
  if (!fs.existsSync(gitmodulesPath)) {
    throw new Error(`Missing .gitmodules at ${gitmodulesPath}`);
  }
  const content = readTextNormalized(gitmodulesPath);
  return parseSubmodulesFromGitmodules(content);
}

export function toHttpsRepoUrl(repoUrl) {
  if (repoUrl.startsWith("git@github.com:")) {
    return `https://github.com/${repoUrl
      .replace("git@github.com:", "")
      .replace(/\.git$/, "")}`;
  }
  return repoUrl.replace(/\.git$/, "");
}

export function replaceFooterContent(readmeContent, marker, footerContent) {
  const markerIndex = readmeContent.indexOf(marker);
  if (markerIndex < 0) return null;

  const before = readmeContent.slice(0, markerIndex).replace(/\s*$/, "");
  const footer = footerContent.trim();
  return `${before}\n\n${marker}\n${footer}\n`;
}

export function ensureFooterMarker(content, marker = DEFAULT_FOOTER_MARKER) {
  if (content.includes(marker)) return content;
  return `${content.replace(/\s*$/, "")}\n\n${marker}\n`;
}

export function applyFooterWithMarker(
  content,
  footerMarkdown,
  marker = DEFAULT_FOOTER_MARKER
) {
  const withMarker = ensureFooterMarker(content, marker);
  const idx = withMarker.indexOf(marker);
  const before = withMarker.slice(0, idx).replace(/\s*$/, "");
  return `${before}\n\n${marker}\n${footerMarkdown}\n`;
}

export function makeBadgeMarkdown(cfg, repoUrl) {
  const label = encodeURIComponent(cfg.label);
  const logo = encodeURIComponent(cfg.logo);
  const color = encodeURIComponent(cfg.color);
  const img = `https://img.shields.io/badge/${label}-${color}?style=for-the-badge&logo=${logo}&logoColor=white`;
  return `[![${cfg.label}](${img})](${repoUrl})`;
}

/**
 * Railway `templatePublish` validates description length (observed: 25–75 characters).
 * @param {string} description
 * @param {{ min?: number, max?: number }} [opts]
 * @returns {{ ok: true, value: string, warnings: string[] } | { ok: false, error: string }}
 */
export function validateRailwayTemplatePublishDescription(description, opts = {}) {
  const min = opts.min ?? 25;
  const max = opts.max ?? 75;
  const raw = String(description ?? "");
  const trimmed = raw.trim();
  if (trimmed.length < min) {
    return {
      ok: false,
      error: `description must be between ${min} and ${max} characters after trim (got ${trimmed.length})`,
    };
  }
  const warnings = [];
  let value = trimmed;
  if (value.length > max) {
    value = value.slice(0, max);
    warnings.push(`description was truncated to ${max} characters`);
  }
  return { ok: true, value, warnings };
}

/**
 * @param {Array<{ message?: string, traceId?: string, extensions?: { code?: string } }>|undefined} errors
 * @returns {string}
 */
export function formatRailwayGraphqlErrors(errors) {
  if (!errors?.length) return "";
  return errors
    .map((e) => {
      const parts = [e.message ?? "Unknown GraphQL error"];
      if (e.traceId) parts.push(`traceId=${e.traceId}`);
      if (e.extensions?.code) parts.push(`code=${e.extensions.code}`);
      return parts.join(" ");
    })
    .join(" | ");
}
