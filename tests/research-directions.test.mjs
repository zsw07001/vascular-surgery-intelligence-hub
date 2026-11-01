import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pubmedConfig, researchDirectionsConfig } from "../scripts/config.mjs";
import { decorateDirectionArticle, updateResearchDirections } from "../scripts/update-research-directions.mjs";

test("hydrogen and cerebral reperfusion animal studies are retained as topic evidence", () => {
  const direction = researchDirectionsConfig.directions.find((item) => item.id === "hydrogen-brain-iri");
  const article = decorateDirectionArticle({
    pmid: "123", title: "Molecular hydrogen protects against cerebral ischemia reperfusion in rats",
    abstract: "An in vitro and animal study of reperfusion injury.", journal: "Neuroscience",
    publicationDate: "2026-11-01", authors: [], affiliations: ["Institute of Neuroscience, China"],
    doi: "", pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/123/", publicationTypes: ["Journal Article"], meshTerms: ["Animals"]
  }, direction);
  assert.equal(article.relevance, "high");
  assert.ok(article.topicTags.includes("Hydrogen Therapy"));
  assert.ok(article.topicTags.includes("Brain Ischemia / Reperfusion"));
  assert.ok(article.scoreReasons.every((reason) => !reason.startsWith("-")));
  assert.equal(article.isChinaResearch, true);
});

test("the vibration topic covers functional sensing and does not mean intravascular lithotripsy", () => {
  const direction = researchDirectionsConfig.directions.find((item) => item.id === "vascular-flow-vibration");
  assert.ok(direction.query.includes("vibrometry"));
  assert.ok(direction.query.includes("vascular compliance"));
  assert.ok(direction.query.includes("in vitro"));
  assert.ok(!direction.query.includes("lithotripsy"));
});

test("one topic failure preserves its data and allows other 30-day topics to update", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "vsih-topics-"));
  const originalEmail = process.env.NCBI_EMAIL;
  const originalRetries = pubmedConfig.requestRetryCount;
  process.env.NCBI_EMAIL = "topic-test@example.invalid";
  pubmedConfig.requestRetryCount = 0;
  const original = '[{"pmid":"123","title":"Previous safe data"}]\n';
  const oldFile = join(dir, "topic-hydrogen-brain-iri.json");
  await writeFile(oldFile, original);
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("reldate"), "30");
    return url.searchParams.get("term").includes("molecular hydrogen")
      ? Response.json({ error: "Temporary failure" })
      : Response.json({ esearchresult: { count: "0", idlist: [] } });
  });
  t.after(async () => {
    pubmedConfig.requestRetryCount = originalRetries;
    if (originalEmail === undefined) delete process.env.NCBI_EMAIL;
    else process.env.NCBI_EMAIL = originalEmail;
    await rm(dir, { recursive: true, force: true });
  });
  const result = await updateResearchDirections({ rootDir: dir, dataDir: dir });
  assert.equal(result.errors.length, 1);
  assert.equal(result.directions[0].status, "error");
  assert.equal(result.directions[0].count, 1);
  assert.equal(await readFile(oldFile, "utf8"), original);
  assert.ok(result.directions.slice(1).every((item) => item.status === "success" && item.count === 0));
  assert.equal(pubmedConfig.lookbackDays, 7);
});
