import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchAllMarketplaceTemplates,
  RAILWAY_GRAPHQL_URL,
} from "../scripts/lib/railway-marketplace-search.mjs";

let originalFetch;

test.beforeEach(() => {
  originalFetch = globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchAllMarketplaceTemplates aggregates paginated GraphQL responses", async () => {
  let call = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, RAILWAY_GRAPHQL_URL);
    assert.ok(init.headers.authorization?.includes("Bearer tok"));
    const body = JSON.parse(init.body);
    call += 1;
    if (call === 1) {
      assert.equal(body.variables.after, null);
      return {
        ok: true,
        async json() {
          return {
            data: {
              templates: {
                pageInfo: { hasNextPage: true, endCursor: "c1" },
                edges: [
                  { node: { id: "1", name: "A", code: "a", description: "d", category: null } },
                ],
              },
            },
          };
        },
      };
    }
    assert.equal(body.variables.after, "c1");
    return {
      ok: true,
      async json() {
        return {
          data: {
            templates: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [{ node: { id: "2", name: "B", code: "b", description: "d2", category: "x" } }],
            },
          },
        };
      },
    };
  };

  const out = await fetchAllMarketplaceTemplates("tok", { pageSize: 1 });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "1");
  assert.equal(out[1].name, "B");
});

test("fetchAllMarketplaceTemplates throws on non-OK HTTP response", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => "bad gateway",
  });
  await assert.rejects(
    () => fetchAllMarketplaceTemplates("t"),
    /Railway GraphQL HTTP 502/
  );
});

test("fetchAllMarketplaceTemplates throws when GraphQL returns errors", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { errors: [{ message: "auth failed" }] };
    },
  });
  await assert.rejects(() => fetchAllMarketplaceTemplates("t"), /auth failed/);
});

test("fetchAllMarketplaceTemplates throws when templates connection is missing", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { data: {} };
    },
  });
  await assert.rejects(
    () => fetchAllMarketplaceTemplates("t"),
    /Invalid templates response/
  );
});

test("fetchAllMarketplaceTemplates invokes onPage after each page", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        data: {
          templates: {
            pageInfo: { hasNextPage: false },
            edges: [{ node: { id: "1", name: "A", code: "a", description: "d" } }],
          },
        },
      };
    },
  });
  const pages = [];
  await fetchAllMarketplaceTemplates("tok", {
    onPage: (edgeCount, totalSoFar) => pages.push([edgeCount, totalSoFar]),
  });
  assert.deepEqual(pages, [[1, 1]]);
});

test("fetchAllMarketplaceTemplates clamps pageSize to 1–500", async () => {
  let seenFirst;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (seenFirst === undefined) {
      seenFirst = body.variables.first;
    }
    return {
      ok: true,
      async json() {
        return {
          data: {
            templates: {
              pageInfo: { hasNextPage: false },
              edges: [],
            },
          },
        };
      },
    };
  };
  await fetchAllMarketplaceTemplates("t", { pageSize: 999 });
  assert.equal(seenFirst, 500);
});
