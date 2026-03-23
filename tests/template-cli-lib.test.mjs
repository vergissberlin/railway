import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FOOTER_MARKER,
  applyFooterWithMarker,
  formatRailwayGraphqlErrors,
  makeBadgeMarkdown,
  parseSubmodulesFromGitmodules,
  replaceFooterContent,
  toHttpsRepoUrl,
  validateRailwayTemplatePublishDescription,
} from "../scripts/template-cli-lib.mjs";

test("toHttpsRepoUrl converts SSH GitHub URLs to HTTPS", () => {
  assert.equal(
    toHttpsRepoUrl("git@github.com:vergissberlin/railwayapp-airflow.git"),
    "https://github.com/vergissberlin/railwayapp-airflow"
  );
});

test("parseSubmodulesFromGitmodules reads path and normalized repo URL", () => {
  const content = `[submodule "railwayapp-airflow"]
\tpath = railwayapp-airflow
\turl = git@github.com:vergissberlin/railwayapp-airflow.git
[submodule "railwayapp-email"]
\tpath = railwayapp-email
\turl = https://github.com/vergissberlin/railwayapp-email.git
`;

  const parsed = parseSubmodulesFromGitmodules(content);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    path: "railwayapp-airflow",
    repoUrl: "https://github.com/vergissberlin/railwayapp-airflow",
  });
  assert.deepEqual(parsed[1], {
    path: "railwayapp-email",
    repoUrl: "https://github.com/vergissberlin/railwayapp-email",
  });
});

test("replaceFooterContent replaces everything after marker", () => {
  const readme = `# Template

Body text

<!-- footer -->
old content
`;

  const replaced = replaceFooterContent(
    readme,
    DEFAULT_FOOTER_MARKER,
    "[new footer](https://example.com)"
  );

  assert.equal(
    replaced,
    `# Template

Body text

<!-- footer -->
[new footer](https://example.com)
`
  );
});

test("replaceFooterContent returns null when marker is missing", () => {
  const readme = "# Template\n\nBody text\n";
  assert.equal(replaceFooterContent(readme, DEFAULT_FOOTER_MARKER, "x"), null);
});

test("applyFooterWithMarker appends marker if not present", () => {
  const readme = "# Template\n\nBody text\n";
  const updated = applyFooterWithMarker(readme, "footer line");
  assert.equal(
    updated,
    `# Template

Body text

<!-- footer -->
footer line
`
  );
});

test("makeBadgeMarkdown builds expected shields URL", () => {
  const md = makeBadgeMarkdown(
    { label: "Apache Airflow", color: "017CEE", logo: "apacheairflow" },
    "https://github.com/vergissberlin/railwayapp-airflow"
  );

  assert.equal(
    md,
    "[![Apache Airflow](https://img.shields.io/badge/Apache%20Airflow-017CEE?style=for-the-badge&logo=apacheairflow&logoColor=white)](https://github.com/vergissberlin/railwayapp-airflow)"
  );
});

test("validateRailwayTemplatePublishDescription accepts 25–75 chars", () => {
  const s = "x".repeat(30);
  const r = validateRailwayTemplatePublishDescription(s);
  assert.equal(r.ok, true);
  assert.equal(r.value, s);
  assert.equal(r.warnings.length, 0);
});

test("validateRailwayTemplatePublishDescription rejects short text", () => {
  const r = validateRailwayTemplatePublishDescription("short");
  assert.equal(r.ok, false);
  assert.match(r.error, /got 5/);
});

test("validateRailwayTemplatePublishDescription truncates long text", () => {
  const long = "y".repeat(100);
  const r = validateRailwayTemplatePublishDescription(long);
  assert.equal(r.ok, true);
  assert.equal(r.value.length, 75);
  assert.equal(r.warnings.length, 1);
});

test("formatRailwayGraphqlErrors joins messages and traceId", () => {
  const out = formatRailwayGraphqlErrors([
    { message: "Problem processing request", traceId: "abc", extensions: { code: "X" } },
  ]);
  assert.match(out, /Problem processing request/);
  assert.match(out, /traceId=abc/);
  assert.match(out, /code=X/);
});
