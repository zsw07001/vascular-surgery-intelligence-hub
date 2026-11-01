import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pubmedConfig, buildPubMedQuery } from "../scripts/config.mjs";
import { updatePubMed, compareSnapshots } from "../scripts/update-pubmed.mjs";

async function setup(t, fetcher) {
  const dir = await mkdtemp(join(tmpdir(), "vsih-pubmed-"));
  const original = { ...pubmedConfig };
  const email = process.env.NCBI_EMAIL;
  process.env.NCBI_EMAIL = "pubmed-test@example.invalid";
  pubmedConfig.requestDelayMs = 0;
  pubmedConfig.requestRetryCount = 0;
  t.mock.method(globalThis, "fetch", fetcher);
  t.after(async () => {
    Object.assign(pubmedConfig, original);
    if (email === undefined) delete process.env.NCBI_EMAIL;
    else process.env.NCBI_EMAIL = email;
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

function searchResponse(ids, count = ids.length) {
  return Response.json({ esearchresult: { count: String(count), idlist: ids, webenv: "test-snapshot", querykey: "1" } });
}

function articleXml(id) {
  return `<PubmedArticle><MedlineCitation><PMID>${id}</PMID><Article><ArticleTitle>Endovascular aortic aneurysm repair ${id}</ArticleTitle><Journal><Title>Vascular Journal</Title><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal><Abstract><AbstractText>Clinical trial in patients.</AbstractText></Abstract><PublicationTypeList><PublicationType>Clinical Trial</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle>`;
}

test("retrieves every search page and EFetch batch beyond 200 records", async (t) => {
  const ids = Array.from({ length: 503 }, (_, i) => String(100000 + i));
  const offsets = [];
  let batches = 0;
  const dir = await setup(t, async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("esearch.fcgi")) {
      const start = Number(url.searchParams.get("retstart") || 0);
      const size = Number(url.searchParams.get("retmax"));
      offsets.push(start);
      if (start) {
        assert.equal(url.searchParams.get("sort"), "pub date");
        assert.equal(url.searchParams.get("term"), "#1");
        assert.equal(url.searchParams.get("WebEnv"), "test-snapshot");
      }
      return searchResponse(ids.slice(start, start + size), ids.length);
    }
    batches += 1;
    return new Response(`<PubmedArticleSet>${url.searchParams.get("id").split(",").map(articleXml).join("")}</PubmedArticleSet>`);
  });
  const result = await updatePubMed({ rootDir: dir, dataDir: dir });
  assert.deepEqual(offsets, [0, 500]);
  assert.equal(batches, 6);
  assert.equal(result.articles.length, 503);
  assert.equal(result.retrieval.matchedCount, 503);
  assert.equal(result.retrieval.complete, true);
  assert.equal(result.changes.comparable, false);
  assert.equal(JSON.parse(await readFile(join(dir, "latest-research.json"), "utf8")).length, 503);
});

test("a partial EFetch response preserves all existing data files", async (t) => {
  const dir = await setup(t, async (input) => new URL(input).pathname.endsWith("esearch.fcgi")
    ? searchResponse(["1", "2"])
    : new Response(`<PubmedArticleSet>${articleXml("1")}</PubmedArticleSet>`));
  const files = ["latest-research.json", "high-impact-research.json", "china-research.json"];
  for (const name of files) await writeFile(join(dir, name), "[]\n");
  await assert.rejects(updatePubMed({ rootDir: dir, dataDir: dir }), /incomplete/);
  for (const name of files) assert.equal(await readFile(join(dir, name), "utf8"), "[]\n");
});

test("an API error returned with HTTP 200 is not mistaken for zero results", async (t) => {
  const dir = await setup(t, async () => Response.json({ error: "Temporary backend failure" }));
  await assert.rejects(updatePubMed({ rootDir: dir, dataDir: dir }), /invalid search/);
});

test("a successful zero-result search produces real empty datasets", async (t) => {
  const dir = await setup(t, async () => searchResponse([]));
  const result = await updatePubMed({ rootDir: dir, dataDir: dir });
  assert.equal(result.articles.length, 0);
  assert.equal(result.retrieval.matchedCount, 0);
  assert.equal(result.retrieval.complete, true);
});

test("temporary HTTP 500 is retried before data is replaced", async (t) => {
  let attempts = 0;
  const dir = await setup(t, async () => ++attempts === 1
    ? new Response("Server error", { status: 500, statusText: "Internal Server Error" })
    : searchResponse([]));
  pubmedConfig.requestRetryCount = 1;
  pubmedConfig.requestRetryBaseDelayMs = 1;
  const result = await updatePubMed({ rootDir: dir, dataDir: dir });
  assert.equal(attempts, 2);
  assert.equal(result.ok, true);
});

test("snapshot differences distinguish new IDs, edited content and window expiry", () => {
  const before = [{ pmid: "1", title: "Old" }, { pmid: "2", title: "Same", score: 4 }, { pmid: "3", title: "Expired" }];
  const after = [{ pmid: "1", title: "Revised" }, { pmid: "2", title: "Same", score: 8 }, { pmid: "4", title: "New" }];
  const status = { pubmed: { retrieval: { complete: true }, counts: { total: 3 }, query: buildPubMedQuery(), lookbackDays: pubmedConfig.lookbackDays, dateType: pubmedConfig.dateType } };
  const changes = compareSnapshots(before, after, status, buildPubMedQuery());
  assert.equal(changes.added, 1);
  assert.equal(changes.updated, 1);
  assert.equal(changes.removedFromWindow, 1);
  assert.equal(changes.unchanged, 1);
});
