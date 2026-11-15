import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readingDigestConfig, pubmedConfig } from "../scripts/config.mjs";
import { resolveJournalMetrics, isVerifiedCasOne, isVerifiedJcrOne } from "../lib/journal-metrics.js";
import { assessDigestArticle, buildDigestSection, isRecentPublication, updateReadingDigest } from "../scripts/update-reading-digest.mjs";

const registry = JSON.parse(await readFile(new URL("../data/journal-metrics.json", import.meta.url)));
const now = new Date("2026-11-01T10:00:00Z");
function article(overrides = {}) {
  return { pmid: "1", title: "Endovascular treatment of aortic aneurysm: a randomized trial", abstract: "A prospective randomized study of patients undergoing endovascular aortic aneurysm repair. Outcomes and adverse events were assessed after treatment.", publicationDate: "2026-10-30", publicationDatePrecision: "day", journal: "European journal of vascular and endovascular surgery : the official journal of the European Society for Vascular Surgery", publicationTypes: ["Journal Article", "Randomized Controlled Trial"], relevance: "high", score: 8, affiliations: [], authors: [], ...overrides };
}

test("journal matching is exact and does not confuse neighbouring titles or Q1 with CAS1", () => {
  assert.equal(resolveJournalMetrics(article(), registry).cas.zone, 1);
  assert.notEqual(resolveJournalMetrics({ journal: "Biomaterials advances" }, registry).journalId, resolveJournalMetrics({ journal: "Biomaterials" }, registry).journalId);
  assert.equal(resolveJournalMetrics({ journal: "JAMA imaginary supplement" }, registry).jcr, null);
  assert.equal(isVerifiedCasOne(resolveJournalMetrics({ journal: "Advanced healthcare materials" }, registry)), false);
  assert.equal(isVerifiedJcrOne(resolveJournalMetrics({ journal: "Advanced healthcare materials" }, registry)), true);
  assert.equal(isVerifiedCasOne({ cas: { zone: 1, year: 2023, scope: "major" } }), false);
  assert.equal(isVerifiedCasOne({ cas: { zone: 1, year: 2025, scope: "minor" } }), false);
  const invalid = structuredClone(registry);
  invalid.sources = [];
  assert.equal(resolveJournalMetrics(article(), invalid).cas, null);
  assert.equal(resolveJournalMetrics(article(), invalid).jcr, null);
  assert.equal(isVerifiedJcrOne({ cas: { zone: 1, year: 2025, scope: "major" } }), false);
  assert.equal(isVerifiedJcrOne({ jcr: { quartile: "Q1", year: 2024 } }), false);
});

test("publication windows exclude old updates, future dates, invalid dates and unknown precision", () => {
  assert.equal(isRecentPublication(article(), 7, now), true);
  assert.equal(isRecentPublication(article({ publicationDate: "2026-10-03" }), 30, now), true);
  for (const date of ["2026-10-02", "2026-11-02", "2025-11-01", "2026-02-30", ""]) {
    assert.equal(isRecentPublication(article({ publicationDate: date }), 30, now), false);
  }
  assert.equal(isRecentPublication(article({ publicationDatePrecision: "month" }), 30, now), false);
  assert.equal(isRecentPublication(article({ publicationDatePrecision: undefined }), 30, now), false);
});

test("pending metrics follow JCR verification, not the presence of a CAS classification", () => {
  const copy = structuredClone(registry);
  for (const journal of copy.journals) delete journal.cas;
  const section = buildDigestSection([article(), article({ pmid: "2", journal: "Unverified journal" })], "vascular", copy, 30, now);
  assert.equal(section.stats.eligible, 1);
  assert.equal(section.stats.metricsPending, 1);
});

test("digest admits direct high-relevance research, not case reports, protocols, low relevance or unverified metrics", () => {
  assert.equal(assessDigestArticle(article(), "vascular", registry).eligible, true);
  for (const overrides of [{ relevance: "low" }, { relevance: "medium" }, { journal: "Unknown journal" }, { publicationTypes: ["Case Reports"] }, { title: "Protocol for endovascular aortic aneurysm repair trial" }, { title: "Wound closure in orthopaedic surgery" }, { publicationTypes: ["Retracted Publication"] }]) {
    assert.equal(assessDigestArticle(article(overrides), "vascular", registry).eligible, false);
  }
});

test("reviews mentioning trials cannot masquerade as RCTs or flood the selection", () => {
  const review = article({ pmid: "r1", journal: "JAMA", title: "Aortic aneurysm randomized trials: a systematic review", publicationTypes: ["Journal Article", "Review", "Systematic Review"] });
  assert.equal(assessDigestArticle(review, "vascular", registry).eligible, false);
  assert.equal(assessDigestArticle(review, "vascular", registry).kind.includes("RCT"), false);
  const saved = readingDigestConfig.exceptionalReviewPmids;
  readingDigestConfig.exceptionalReviewPmids = ["r1", "r2"];
  try {
    const result = buildDigestSection([review, { ...review, pmid: "r2" }, ...Array.from({ length: 28 }, (_, i) => article({ pmid: String(10 + i) }))], "vascular", registry, 30, now);
    assert.equal(result.articles.length, 20);
    assert.ok(result.articles.filter((item) => item.digestIsReview).length <= 1);
    assert.equal(result.articles[0].digestKind, "RCT");
  } finally { readingDigestConfig.exceptionalReviewPmids = saved; }
});

test("lab topics retain relevant animal research but reject generic neural regeneration and cell assays", () => {
  const hydrogen = article({ journal: "Bioactive materials", title: "Molecular hydrogen protects against cerebral ischemia reperfusion injury in rats", publicationTypes: ["Journal Article"] });
  assert.equal(assessDigestArticle(hydrogen, "hydrogen-brain-iri", registry).eligible, true);
  assert.equal(assessDigestArticle(article({ title: "3D-bioprinted nerve conduits promote neurovascular regeneration", journal: "Biomaterials" }), "neurovascular-bioelectric", registry).eligible, false);
  assert.equal(assessDigestArticle(article({ title: "Hydrogels probe endothelial cell mechanosensing", journal: "Bioactive materials" }), "vascular-flow-vibration", registry).eligible, false);
});

test("cohorts mentioned only as background or comparison do not label an experimental platform as a cohort", () => {
  const platform = article({ publicationTypes: ["Journal Article"], abstract: "BACKGROUND: Cohort studies previously showed a limitation. METHODS: We engineered an ex vivo thrombus platform to test therapies in patients after aortic aneurysm repair. RESULTS: Our findings agree with human cohorts." });
  assert.equal(assessDigestArticle(platform, "vascular", registry).kind, "研究论文");
  const cohort = article({ publicationTypes: ["Journal Article"], abstract: "METHODS: This was a retrospective cohort study of patients undergoing aortic aneurysm repair. RESULTS: Survival and outcomes were examined in all patients." });
  assert.ok(assessDigestArticle(cohort, "vascular", registry).kind.startsWith("Cohort"));
});

test("recent candidate retrieval uses publication dates and verified journal restrictions without changing the broad library window", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "vsih-recent-"));
  const savedEmail = process.env.NCBI_EMAIL;
  process.env.NCBI_EMAIL = "digest-test@example.invalid";
  await writeFile(join(dir, "journal-metrics.json"), JSON.stringify(registry));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    const params = init?.method === "POST" ? new URLSearchParams(init.body) : url.searchParams;
    assert.equal(params.get("datetype"), "pdat");
    assert.equal(params.get("reldate"), "30");
    assert.ok(params.get("term").includes('"1878-5905"[ISSN]'));
    assert.ok(params.get("term").includes('"2192-2659"[ISSN]'));
    calls += 1;
    return Response.json({ esearchresult: { count: "0", idlist: [] } });
  });
  t.after(async () => {
    if (savedEmail === undefined) delete process.env.NCBI_EMAIL; else process.env.NCBI_EMAIL = savedEmail;
    await rm(dir, { recursive: true, force: true });
  });
  const result = await updateReadingDigest({ rootDir: dir, dataDir: dir, now });
  assert.equal(calls, 5);
  assert.equal(result.errors.length, 0);
  assert.equal(result.periods[30].articles.length, 0);
  assert.equal(pubmedConfig.dateType, "mdat");
  assert.equal(pubmedConfig.lookbackDays, 7);
});

test("failed recent searches retain cached records, mark errors and never pad with old literature", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "vsih-digest-"));
  const savedEmail = process.env.NCBI_EMAIL;
  const savedRetry = pubmedConfig.requestRetryCount;
  process.env.NCBI_EMAIL = "digest-test@example.invalid";
  pubmedConfig.requestRetryCount = 0;
  await writeFile(join(dir, "journal-metrics.json"), JSON.stringify(registry));
  await writeFile(join(dir, "reading-candidates.json"), JSON.stringify({ sources: [{ id: "vascular", articles: [article(), article({ pmid: "old", publicationDate: "2025-01-01" })], lastSuccessfulUpdate: "2026-10-30T00:00:00Z" }] }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Temporary unavailable" }));
  t.after(async () => {
    pubmedConfig.requestRetryCount = savedRetry;
    if (savedEmail === undefined) delete process.env.NCBI_EMAIL; else process.env.NCBI_EMAIL = savedEmail;
    await rm(dir, { recursive: true, force: true });
  });
  const result = await updateReadingDigest({ rootDir: dir, dataDir: dir, now });
  const cached = JSON.parse(await readFile(join(dir, "reading-candidates.json"), "utf8"));
  assert.equal(cached.sources[0].articles.length, 2);
  assert.equal(cached.sources[0].status, "error");
  assert.equal(result.errors.length, 5);
  assert.equal(result.groups[0].periods[30].articles.length, 1);
  assert.equal(result.groups[0].lastSuccessfulUpdate, "2026-10-30T00:00:00Z");
});
