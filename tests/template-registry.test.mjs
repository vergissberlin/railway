import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  REGISTRY_RELATIVE_PATH,
  buildFooterMarkdown,
  emptyRegistry,
  mergeRegistry,
  missingRegistryEntries,
  readRegistry,
  writeRegistry,
} from "../scripts/lib/template-registry.mjs";

const BADGE_A = { label: "Alpha", color: "AABBCC", logo: "alpha" };
const BADGE_B = { label: "Beta", color: "112233", logo: "beta" };

function tempRoot(registry) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "railway-registry-test-"));
  if (registry) {
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, REGISTRY_RELATIVE_PATH),
      `${JSON.stringify(registry, null, 2)}\n`
    );
  }
  return root;
}

const submodules = [
  { path: "railwayapp-beta", repoUrl: "https://github.com/o/railwayapp-beta" },
  { path: "railwayapp-alpha", repoUrl: "https://github.com/o/railwayapp-alpha" },
];

test("emptyRegistry is a valid empty cache", () => {
  const r = emptyRegistry();
  assert.equal(r.schemaVersion, 1);
  assert.deepEqual(r.badges, {});
});

test("readRegistry returns an empty cache when the file is absent", () => {
  assert.deepEqual(readRegistry(tempRoot()).badges, {});
});

test("readRegistry loads badges and tolerates a missing badges key", () => {
  const withBadges = readRegistry(
    tempRoot({ schemaVersion: 1, badges: { "railwayapp-alpha": BADGE_A } })
  );
  assert.deepEqual(withBadges.badges["railwayapp-alpha"], BADGE_A);
  assert.deepEqual(readRegistry(tempRoot({ schemaVersion: 1 })).badges, {});
});

test("readRegistry rejects an unknown schemaVersion", () => {
  assert.throws(() => readRegistry(tempRoot({ schemaVersion: 2, badges: {} })), /schemaVersion/);
});

test("writeRegistry sorts keys so diffs stay stable", () => {
  const root = tempRoot({ schemaVersion: 1, badges: {} });
  writeRegistry(root, {
    schemaVersion: 1,
    badges: { "railwayapp-beta": BADGE_B, "railwayapp-alpha": BADGE_A },
  });
  const written = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_RELATIVE_PATH), "utf8"));
  assert.deepEqual(Object.keys(written.badges), ["railwayapp-alpha", "railwayapp-beta"]);
  assert.match(written.$comment, /Generated cache/);
});

test("mergeRegistry adds new badges and reports them", () => {
  const result = mergeRegistry(emptyRegistry(), [{ project: "railwayapp-alpha", badge: BADGE_A }]);
  assert.deepEqual(result.added, ["railwayapp-alpha"]);
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.next.badges["railwayapp-alpha"], BADGE_A);
});

test("mergeRegistry reports a changed badge but stays quiet on an identical one", () => {
  const base = { ...emptyRegistry(), badges: { "railwayapp-alpha": BADGE_A } };
  const same = mergeRegistry(base, [{ project: "railwayapp-alpha", badge: { ...BADGE_A } }]);
  assert.deepEqual(same.changed, []);
  assert.deepEqual(same.added, []);

  const changed = mergeRegistry(base, [
    { project: "railwayapp-alpha", badge: { ...BADGE_A, color: "FFFFFF" } },
  ]);
  assert.deepEqual(changed.changed, ["railwayapp-alpha"]);
});

test("mergeRegistry keeps cached entries for templates without badge metadata", () => {
  const base = { ...emptyRegistry(), badges: { "railwayapp-alpha": BADGE_A } };
  const result = mergeRegistry(base, [{ project: "railwayapp-alpha", badge: null }]);
  assert.deepEqual(result.withoutBadge, ["railwayapp-alpha"]);
  assert.deepEqual(
    result.next.badges["railwayapp-alpha"],
    BADGE_A,
    "an absent badge must never delete a cached entry"
  );
});

test("missingRegistryEntries lists uncached submodules alphabetically", () => {
  const registry = { ...emptyRegistry(), badges: { "railwayapp-beta": BADGE_B } };
  assert.deepEqual(missingRegistryEntries(registry, submodules), ["railwayapp-alpha"]);
});

test("buildFooterMarkdown orders badges by submodule path", () => {
  const registry = {
    ...emptyRegistry(),
    badges: { "railwayapp-alpha": BADGE_A, "railwayapp-beta": BADGE_B },
  };
  const footer = buildFooterMarkdown(registry, submodules);
  assert.ok(footer.startsWith("---\n\n"));
  assert.ok(
    footer.indexOf("railwayapp-alpha") < footer.indexOf("railwayapp-beta"),
    "alphabetical order removes the need for a hand-maintained order list"
  );
  assert.match(footer, /img\.shields\.io\/badge\/Alpha-AABBCC/);
});

test("buildFooterMarkdown fails loudly and actionably on missing badge data", () => {
  assert.throws(
    () => buildFooterMarkdown(emptyRegistry(), submodules),
    /Missing badge data for railwayapp-alpha, railwayapp-beta[\s\S]*templates:registry:sync/
  );
});
