import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pubmedConfig, buildPubMedQuery } from "../scripts/config.mjs";
import { updatePubMed, compareSnapshots, retrievePubMedRecords, parsePubMedXml } from "../scripts/update-pubmed.mjs";

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
  return Response.json({ esearchresult: { count: String(count), idlist: ids, webenv: "test-snapshot", querykey: "1", errorlist: { phrasesnotfound: [], fieldsnotfound: [] } } });
}

function articleXml(id) {
  return `<PubmedArticle><MedlineCitation><PMID>${id}</PMID><Article><ArticleTitle>Endovascular aortic aneurysm repair ${id}</ArticleTitle><Journal><Title>Vascular Journal</Title><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal><Abstract><AbstractText>Clinical trial in patients.</AbstractText></Abstract><PublicationTypeList><PublicationType>Clinical Trial</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle>`;
}

function requestParams(input, init) {
  return init?.method === "POST" ? new URLSearchParams(init.body) : new URL(input).searchParams;
}

test("retrieves every search page and EFetch batch beyond 200 records", async (t) => {
  const ids = Array.from({ length: 503 }, (_, i) => String(100000 + i));
  const offsets = [];
  let batches = 0;
  const dir = await setup(t, async (input, init) => {
    const url = new URL(input);
    const params = requestParams(input, init);
    if (url.pathname.endsWith("esearch.fcgi")) {
      const start = Number(params.get("retstart") || 0);
      const size = Number(params.get("retmax"));
      offsets.push(start);
      if (start) {
        assert.equal(params.get("sort"), "pub date");
        assert.equal(params.get("term"), "#1");
        assert.equal(params.get("WebEnv"), "test-snapshot");
      }
      return searchResponse(ids.slice(start, start + size), ids.length);
    }
    batches += 1;
    return new Response(`<PubmedArticleSet>${params.get("id").split(",").map(articleXml).join("")}</PubmedArticleSet>`);
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

test("long ESearch queries use form POST and preserve their body across retries and history pagination", async (t) => {
  const query = Array.from({ length: 150 }, (_, index) => `"Journal ${index}"[Journal]`).join(" OR ");
  const ids = ["11", "12", "13"];
  let posts = 0;
  let pages = 0;
  const dir = await setup(t, async (input, init) => {
    const url = new URL(input);
    const params = requestParams(input, init);
    if (url.pathname.endsWith("esearch.fcgi")) {
      if (params.get("retstart")) {
        pages += 1;
        assert.equal(params.get("WebEnv"), "test-snapshot");
        assert.equal(params.get("term"), "#1");
        return searchResponse(["13"], 3);
      }
      posts += 1;
      assert.equal(init.method, "POST");
      assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
      assert.equal(url.search, "");
      assert.equal(params.get("term"), query);
      assert.equal(params.get("datetype"), "pdat");
      assert.equal(params.get("reldate"), "30");
      return posts === 1 ? new Response("Temporary failure", { status: 500 }) : searchResponse(ids.slice(0, 2), 3);
    }
    return new Response(`<PubmedArticleSet>${params.get("id").split(",").map(articleXml).join("")}</PubmedArticleSet>`);
  });
  pubmedConfig.searchPageSize = 2;
  pubmedConfig.requestRetryCount = 1;
  pubmedConfig.requestRetryBaseDelayMs = 1;
  const result = await retrievePubMedRecords(query, { rootDir: dir, dateType: "pdat", lookbackDays: 30 });
  assert.equal(posts, 2);
  assert.equal(pages, 1);
  assert.deepEqual(result.search.ids, ids);
  assert.equal(result.records.length, 3);
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

test("nonempty ESearch error lists are rejected even when the HTTP status and count look valid", async (t) => {
  const dir = await setup(t, async () => Response.json({ esearchresult: { count: "0", idlist: [], errorlist: { phrasesnotfound: [], fieldsnotfound: ["invalid-field"] } } }));
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
  const status = { pubmed: { retrieval: { complete: true, contentParserVersion: pubmedConfig.contentParserVersion }, counts: { total: 3 }, query: buildPubMedQuery(), lookbackDays: pubmedConfig.lookbackDays, dateType: pubmedConfig.dateType } };
  const changes = compareSnapshots(before, after, status, buildPubMedQuery());
  assert.equal(changes.added, 1);
  assert.equal(changes.updated, 1);
  assert.equal(changes.removedFromWindow, 1);
  assert.equal(changes.unchanged, 1);
});

test("abstract and title inline markup preserve sentence order, labels and numbers", () => {
  const xml = '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>123</PMID><Article><ArticleTitle>Effects of <i>p</i>53 and H<sub>2</sub></ArticleTitle><Abstract><AbstractText Label="RESULTS">The <i>p</i> value was 0.03; <b>52</b> of 4231 (1.23%) had events.</AbstractText><AbstractText Label="CONCLUSIONS">H<sub>2</sub> did <i>not</i> improve survival.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>';
  const [article] = parsePubMedXml(xml);
  assert.equal(article.title, "Effects of p53 and H2");
  assert.equal(article.abstract, "RESULTS: The p value was 0.03; 52 of 4231 (1.23%) had events.\n\nCONCLUSIONS: H2 did not improve survival.");
});

test("numeric XML entities are decoded without changing mathematical comparisons or inline order", () => {
  const xml = '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>124</PMID><Article><ArticleTitle>A &amp; B &#x3b2;</ArticleTitle><Abstract><AbstractText Label="RESULTS">x &#x2265; 2; <i>p</i> &lt; .05; &#945; &#x00b1; 1.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>';
  const [article] = parsePubMedXml(xml);
  assert.equal(article.title, "A & B β");
  assert.equal(article.abstract, "RESULTS: x ≥ 2; p < .05; α ± 1.");
});

test("a parser revision rebuilds the comparison baseline instead of reporting formatting fixes as new literature", () => {
  const status = { pubmed: { retrieval: { complete: true, contentParserVersion: 1 }, counts: { total: 0 }, query: buildPubMedQuery(), lookbackDays: pubmedConfig.lookbackDays, dateType: pubmedConfig.dateType } };
  assert.equal(compareSnapshots([], [], status, buildPubMedQuery()).comparable, false);
});

test("a transient ESearch backend error inside HTTP 200 is retried, not treated as no results", async (t) => {
  let attempts = 0;
  const dir = await setup(t, async () => ++attempts === 1
    ? Response.json({ esearchresult: { ERROR: "Search Backend failed: the address table is empty." } })
    : searchResponse([]));
  pubmedConfig.requestRetryCount = 1;
  pubmedConfig.requestRetryBaseDelayMs = 1;
  const result = await updatePubMed({ rootDir: dir, dataDir: dir });
  assert.equal(attempts, 2);
  assert.equal(result.ok, true);
});
