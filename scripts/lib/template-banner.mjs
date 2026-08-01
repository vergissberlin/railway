/**
 * Builds the flat gradient header banner (`template-header.svg`) shown at the top of every
 * `railwayapp-*` README. The same file doubles as the Railway marketplace `image`, which is why
 * the logo is inlined as a base64 data URI: the SVG has to render standalone from
 * raw.githubusercontent.com without fetching anything.
 *
 * Keep logos small (SVG, or PNG up to ~256px). A 1024px PNG inflates the banner to ~93 KB,
 * where a 170px logo lands around 4 KB.
 */
import fs from "node:fs";
import path from "node:path";

/** Filename of the generated banner inside each template repo. */
export const BANNER_FILENAME = "template-header.svg";

/** Markdown that references the banner. The alt text is a constant, never the software name. */
export const HEADER_IMAGE_MARKDOWN = `![Template Header](./${BANNER_FILENAME})`;

/** Second line of every banner; intentionally identical across templates. */
export const DEFAULT_SUBTITLE = "Railway Template";

const FONT_STACK = "Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

/**
 * Every template repo keeps the software logo at its root as `logo-<slug>.png` (an `.svg` is
 * equally welcome and stays far smaller once inlined). The fixed name is what lets a generator
 * run, a reviewer or a follow-up agent find the logo without reading `railway-template.json`
 * first, so a deviating name is reported instead of silently accepted.
 */
export const LOGO_FILE_PATTERN = /^logo-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|svg)$/;

/**
 * @param {string} slug template slug, e.g. `uptime-kuma`
 * @param {string} ext extension including the dot, e.g. `.png`
 * @returns {string} conventional logo filename for that template
 */
export function logoFileNameFor(slug, ext) {
  return `logo-${slug}${ext.toLowerCase()}`;
}

/**
 * @param {string} file
 * @returns {string}
 */
export function mimeFor(file) {
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

/**
 * @param {string} filePath
 * @returns {string} base64 data URI
 */
export function toDataUri(filePath) {
  const data = fs.readFileSync(filePath);
  return `data:${mimeFor(filePath)};base64,${data.toString("base64")}`;
}

/**
 * Hand-drawn fallback marks for templates without a usable logo file.
 * Returns "" for an unknown name so the banner still renders (just without a mark).
 */
const CUSTOM_ICONS = {
  email: `
      <rect x="84" y="84" width="112" height="84" rx="14" fill="#1E293B" stroke="#38BDF8" stroke-width="4"/>
      <path d="M92 98 L140 132 L188 98" stroke="#7DD3FC" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  nodered: `
      <circle cx="102" cy="124" r="14" fill="#7F1D1D"/>
      <circle cx="140" cy="98" r="14" fill="#991B1B"/>
      <circle cx="178" cy="124" r="14" fill="#B91C1C"/>
      <path d="M116 117 L126 109 M154 109 L164 117 M116 131 L164 131" stroke="#FCA5A5" stroke-width="4" fill="none" stroke-linecap="round"/>
    `,
};

/** Initial-style fallbacks: a brand-colored circle or rect with 1-3 letters. */
const INITIAL_ICONS = {
  postgresql: { shape: "circle", fill: "#336791", text: "PG", fontSize: 26 },
  mysql: { shape: "circle", fill: "#4479A1", text: "SQL", fontSize: 22 },
  mongodb: { shape: "circle", fill: "#47A248", text: "M", fontSize: 26 },
  nodejs: { shape: "circle", fill: "#339933", text: "JS", fontSize: 26 },
  redis: { shape: "circle", fill: "#DC382D", text: "R", fontSize: 26 },
  flask: { shape: "circle", fill: "#3fad48", text: "F", fontSize: 26 },
  fastapi: { shape: "circle", fill: "#009688", text: "FA", fontSize: 22 },
  n8n: { shape: "rect", fill: "#EA4B71", text: "n8n", fontSize: 24, rect: { x: 92, y: 88, width: 96, height: 72, rx: 16 } },
  django: { shape: "rect", fill: "#092E20", text: "Dj", fontSize: 22, rect: { x: 92, y: 88, width: 96, height: 72, rx: 14 } },
  flowise: { shape: "rect", fill: "#4F46E5", text: "Fi", fontSize: 26, rect: { x: 88, y: 84, width: 104, height: 80, rx: 18 } },
};

/** @returns {string[]} names accepted by `customIcon` in railway-template.json */
export function knownCustomIcons() {
  return [...Object.keys(CUSTOM_ICONS), ...Object.keys(INITIAL_ICONS)].sort();
}

/**
 * @param {string} name
 * @returns {string} SVG fragment, or "" when the name is unknown
 */
export function customIconSvg(name) {
  if (!name) return "";
  if (CUSTOM_ICONS[name]) return CUSTOM_ICONS[name];

  const icon = INITIAL_ICONS[name];
  if (!icon) return "";

  const label = `<text x="140" y="134" text-anchor="middle" fill="#FFFFFF" font-family="${FONT_STACK}" font-size="${icon.fontSize}" font-weight="700">${icon.text}</text>`;
  const mark =
    icon.shape === "circle"
      ? `<circle cx="140" cy="124" r="48" fill="${icon.fill}" opacity="0.95"/>`
      : `<rect x="${icon.rect.x}" y="${icon.rect.y}" width="${icon.rect.width}" height="${icon.rect.height}" rx="${icon.rect.rx}" fill="${icon.fill}" opacity="0.95"/>`;

  return `
      ${mark}
      ${label}
    `;
}

/**
 * @param {{ title: string, subtitle?: string, logoDataUri?: string, customIcon?: string }} opts
 * @returns {string} complete SVG document
 */
export function buildBanner({ title, subtitle = DEFAULT_SUBTITLE, logoDataUri, customIcon }) {
  if (!title) throw new Error("buildBanner requires a title");

  const plate = `<rect x="64" y="60" width="152" height="152" rx="24" fill="#0B1228" opacity="0.92"/>`;
  const logoLayer = logoDataUri
    ? `
      ${plate}
      <image href="${logoDataUri}" x="84" y="80" width="112" height="112" preserveAspectRatio="xMidYMid meet"/>
    `
    : `
      ${plate}
      ${customIconSvg(customIcon)}
    `;

  return `<svg width="1280" height="270" viewBox="0 0 1280 270" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${title} header banner</title>
  <desc id="desc">Flat gradient banner for ${title} template with software logo.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1280" y2="270" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B1021"/>
      <stop offset="0.55" stop-color="#131B3F"/>
      <stop offset="1" stop-color="#1F174A"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="270" rx="26" fill="url(#bg)"/>
  <circle cx="1120" cy="68" r="34" fill="#4F46E5" opacity="0.33"/>
  <circle cx="1185" cy="205" r="56" fill="#06B6D4" opacity="0.15"/>
  ${logoLayer}
  <text x="258" y="122" fill="#FFFFFF" font-family="${FONT_STACK}" font-size="52" font-weight="800">${title}</text>
  <text x="258" y="168" fill="#B6C2FF" font-family="${FONT_STACK}" font-size="28" font-weight="500">${subtitle}</text>
  <rect x="258" y="188" width="286" height="44" rx="22" fill="#1C285D" stroke="#67E8F9" stroke-opacity="0.6"/>
  <text x="284" y="216" fill="#CFFAFE" font-family="${FONT_STACK}" font-size="19" font-weight="700">Deploy on Railway</text>
</svg>
`;
}

/**
 * Resolves the logo declared in a template's metadata and renders its banner.
 * A declared-but-missing logo is reported through `warnings` instead of throwing, so a bulk run
 * over many repos is not stopped by one bad path.
 *
 * @param {{ repoPath: string, title: string, subtitle?: string, logoFile?: string, customIcon?: string }} opts
 * @returns {{ svg: string, warnings: string[] }}
 */
export function buildBannerForRepo({ repoPath, title, subtitle, logoFile, customIcon }) {
  const warnings = [];
  let logoDataUri = "";

  if (logoFile) {
    if (!LOGO_FILE_PATTERN.test(logoFile)) {
      warnings.push(
        `logoFile "${logoFile}" breaks the naming convention: use logo-<slug>.png (or .svg) at the repo root`
      );
    }
    const logoPath = path.join(repoPath, logoFile);
    if (fs.existsSync(logoPath)) {
      logoDataUri = toDataUri(logoPath);
    } else {
      warnings.push(`Missing logo file: ${logoFile}`);
    }
  }

  // Neither a logo nor a deliberate fallback mark means nobody has looked for the software's logo
  // yet — the banner still renders from initials, but that is a gap to close, not a valid state.
  if (!logoFile && !customIcon) {
    warnings.push(
      "No logoFile or customIcon declared: find the official logo (max 256px) and commit it as logo-<slug>.png"
    );
  }

  if (!logoDataUri && customIcon && !customIconSvg(customIcon)) {
    warnings.push(`Unknown customIcon "${customIcon}" (known: ${knownCustomIcons().join(", ")})`);
  }

  return { svg: buildBanner({ title, subtitle, logoDataUri, customIcon }), warnings };
}

/**
 * Ensures the README references the banner right below its H1, and removes any other
 * root-relative leading image so a repo never grows a second hero graphic.
 *
 * Pure on purpose: the caller owns file I/O, which keeps this testable without a filesystem.
 *
 * @param {string} readmeContent
 * @returns {string}
 */
export function applyHeaderImage(readmeContent) {
  let content = readmeContent.replace(/\r\n/g, "\n");

  if (!content.includes(HEADER_IMAGE_MARKDOWN)) {
    const lines = content.split("\n");
    if (lines[0]?.startsWith("# ")) {
      lines.splice(1, 0, "", HEADER_IMAGE_MARKDOWN);
      content = lines.join("\n");
    } else {
      content = `${HEADER_IMAGE_MARKDOWN}\n\n${content}`;
    }
  }

  content = content.replace(/!\[[^\]]*\]\(\.\/[^)\n]+\.(svg|png)\)\n\n/g, (m) =>
    m.includes(BANNER_FILENAME) ? m : ""
  );
  return content.replace(/<img\s+src="\.\/[^"]+\.(svg|png)"[^>]*>\n\n/g, "");
}
