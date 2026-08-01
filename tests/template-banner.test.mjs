import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  BANNER_FILENAME,
  DEFAULT_SUBTITLE,
  HEADER_IMAGE_MARKDOWN,
  LOGO_FILE_PATTERN,
  applyHeaderImage,
  buildBanner,
  buildBannerForRepo,
  customIconSvg,
  knownCustomIcons,
  logoFileNameFor,
  mimeFor,
  toDataUri,
} from "../scripts/lib/template-banner.mjs";

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "railway-banner-test-"));
}

test("mimeFor maps the supported logo extensions", () => {
  assert.equal(mimeFor("logo.svg"), "image/svg+xml");
  assert.equal(mimeFor("logo.png"), "image/png");
  assert.equal(mimeFor("logo.webp"), "application/octet-stream");
});

test("toDataUri inlines file bytes as base64", () => {
  const dir = tempRepo();
  const file = path.join(dir, "logo.png");
  fs.writeFileSync(file, "abc");
  assert.equal(toDataUri(file), `data:image/png;base64,${Buffer.from("abc").toString("base64")}`);
});

test("buildBanner keeps the fixed canvas, palette and CTA", () => {
  const svg = buildBanner({ title: "Grafana" });
  assert.match(svg, /width="1280" height="270"/);
  assert.match(svg, /<title id="title">Grafana header banner<\/title>/);
  assert.ok(svg.includes(`>${DEFAULT_SUBTITLE}<`));
  assert.ok(svg.includes("Deploy on Railway"));
  assert.ok(svg.includes("#0B1021") && svg.includes("#1F174A"));
});

test("buildBanner prefers the logo over a custom icon", () => {
  const withLogo = buildBanner({
    title: "X",
    logoDataUri: "data:image/png;base64,AAA",
    customIcon: "redis",
  });
  assert.ok(withLogo.includes('href="data:image/png;base64,AAA"'));
  assert.ok(!withLogo.includes("#DC382D"), "custom icon must not be drawn alongside a logo");
});

test("buildBanner falls back to the custom icon when there is no logo", () => {
  assert.ok(buildBanner({ title: "Redis", customIcon: "redis" }).includes("#DC382D"));
});

test("buildBanner rejects a missing title", () => {
  assert.throws(() => buildBanner({ title: "" }), /requires a title/);
});

test("customIconSvg covers both icon families and unknown names", () => {
  assert.match(customIconSvg("email"), /<rect/);
  assert.match(customIconSvg("nodered"), /<circle/);
  assert.match(customIconSvg("postgresql"), /PG/);
  assert.match(customIconSvg("n8n"), /<rect/);
  assert.equal(customIconSvg("does-not-exist"), "");
  assert.equal(customIconSvg(""), "");
});

test("knownCustomIcons is sorted and contains both families", () => {
  const icons = knownCustomIcons();
  assert.deepEqual(icons, [...icons].sort());
  assert.ok(icons.includes("email") && icons.includes("redis"));
});

test("buildBannerForRepo inlines an existing logo without warnings", () => {
  const dir = tempRepo();
  fs.writeFileSync(path.join(dir, "logo-x.png"), "png-bytes");
  const { svg, warnings } = buildBannerForRepo({
    repoPath: dir,
    title: "X",
    logoFile: "logo-x.png",
  });
  assert.deepEqual(warnings, []);
  assert.ok(svg.includes("data:image/png;base64,"));
});

test("buildBannerForRepo warns instead of throwing on a missing logo", () => {
  const { svg, warnings } = buildBannerForRepo({
    repoPath: tempRepo(),
    title: "X",
    logoFile: "logo-missing.png",
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Missing logo file/);
  assert.ok(svg.includes("<svg"), "a banner is still produced so a bulk run continues");
});

test("logoFileNameFor builds the conventional name and normalises the extension", () => {
  assert.equal(logoFileNameFor("uptime-kuma", ".png"), "logo-uptime-kuma.png");
  assert.equal(logoFileNameFor("grafana", ".SVG"), "logo-grafana.svg");
});

test("LOGO_FILE_PATTERN accepts the convention and rejects legacy names", () => {
  for (const name of ["logo-grafana.png", "logo-uptime-kuma.svg", "logo-n8n.png"]) {
    assert.ok(LOGO_FILE_PATTERN.test(name), `${name} should be accepted`);
  }
  for (const name of [
    "railwayapp-grafana.png", // the pre-convention name
    "logo.png", // no slug
    "Logo-Grafana.png", // uppercase
    "assets/logo-grafana.png", // not at the repo root
    "logo-grafana.webp", // unsupported format
  ]) {
    assert.ok(!LOGO_FILE_PATTERN.test(name), `${name} should be rejected`);
  }
});

test("buildBannerForRepo warns about a logo that ignores the naming convention", () => {
  const dir = tempRepo();
  fs.writeFileSync(path.join(dir, "railwayapp-grafana.png"), "png-bytes");
  const { svg, warnings } = buildBannerForRepo({
    repoPath: dir,
    title: "Grafana",
    logoFile: "railwayapp-grafana.png",
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /naming convention/);
  assert.ok(svg.includes("data:image/png;base64,"), "the logo is still inlined");
});

test("buildBannerForRepo flags a template with neither logo nor fallback icon", () => {
  const { warnings } = buildBannerForRepo({ repoPath: tempRepo(), title: "X" });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /No logoFile or customIcon/);
});

test("buildBannerForRepo stays quiet for a deliberate customIcon fallback", () => {
  const { warnings } = buildBannerForRepo({
    repoPath: tempRepo(),
    title: "Redis",
    customIcon: "redis",
  });
  assert.deepEqual(warnings, [], "a declared fallback is a decision, not a gap");
});

test("buildBannerForRepo warns about an unknown customIcon", () => {
  const { warnings } = buildBannerForRepo({
    repoPath: tempRepo(),
    title: "X",
    customIcon: "not-a-real-icon",
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unknown customIcon/);
});

test("applyHeaderImage inserts the banner below the H1", () => {
  const out = applyHeaderImage("# Title\n\nBody\n");
  assert.equal(out, `# Title\n\n${HEADER_IMAGE_MARKDOWN}\n\nBody\n`);
});

test("applyHeaderImage prepends when there is no H1", () => {
  assert.ok(applyHeaderImage("Body only\n").startsWith(HEADER_IMAGE_MARKDOWN));
});

test("applyHeaderImage is idempotent and normalises CRLF", () => {
  const once = applyHeaderImage("# T\r\n\r\nBody\r\n");
  assert.equal(applyHeaderImage(once), once);
  assert.ok(!once.includes("\r"));
});

test("applyHeaderImage removes a competing local hero image", () => {
  const out = applyHeaderImage(
    `# T\n\n${HEADER_IMAGE_MARKDOWN}\n\n![Old](./old-banner.png)\n\nBody\n`
  );
  assert.ok(out.includes(BANNER_FILENAME));
  assert.ok(!out.includes("old-banner.png"));
});

test("applyHeaderImage removes a competing local img tag", () => {
  const out = applyHeaderImage(`# T\n\n<img src="./hero.svg" width="10">\n\nBody\n`);
  assert.ok(!out.includes("hero.svg"));
});
