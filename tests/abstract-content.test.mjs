import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAbstractSections, normalizeAbstract, resolveDetailedAbstract } from "../lib/abstract-content.js";
import { abstractSourceHash, updateDetailedAbstracts } from "../scripts/update-detailed-abstracts.mjs";

const article = { pmid: "42", title: "A study", abstract: "BACKGROUND: First. Second. Third. METHODS: 100 patients. RESULTS: 1.26%, not noninferior. CONCLUSIONS: Needs validation.", pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/42/" };
const note = { sourceHash: abstractSourceHash(article), objective: "目的", methods: "方法", results: "结果与阴性发现", limitations: "局限" };

test("complete abstracts keep all sections, numbers and negation, not only the first sentences", () => {
  const sections = getAbstractSections(article);
  assert.equal(sections.length, 4);
  assert.equal(sections[2].text, "1.26%, not noninferior.");
  assert.equal(sections[3].text, "Needs validation.");
  const plain = "First. Second. Third. Fourth. Fifth with 95% CI and no benefit.";
  assert.equal(getAbstractSections({ abstract: plain })[0].text, plain);
  assert.deepEqual(getAbstractSections({}), []);
  assert.equal(getAbstractSections({ englishSummary: plain })[0].text, plain);
});

test("section markers and XML entities preserve mathematical content", () => {
  const sections = getAbstractSections({ abstract: "Background/Objectives: Study. Patients and methods: 121 patients. Results: x &#x2265; 2 &amp; p &lt; 0.05. Conclusions: Not proven." });
  assert.equal(sections.length, 4);
  assert.equal(sections[2].text, "x ≥ 2 & p < 0.05.");
  assert.equal(normalizeAbstract("&#x3b2;  &#945;\n&#x110000;"), "β α");
});

test("Chinese notes are served only for the exact current source and four complete sections", () => {
  const record = { sourceTitle: article.title, sourceAbstract: article.abstract, sections: [1, 2, 3, 4].map(() => ({ heading: "标题", text: "正文" })) };
  const registry = { records: { [article.pmid]: record } };
  assert.equal(resolveDetailedAbstract(article, registry), record);
  assert.equal(resolveDetailedAbstract({ ...article, title: "Updated title" }, registry), null);
  assert.equal(resolveDetailedAbstract({ ...article, abstract: article.abstract.replace("not noninferior", "noninferior") }, registry), null);
  assert.equal(resolveDetailedAbstract({ ...article, abstract: "" }, registry), null);
  assert.equal(resolveDetailedAbstract(article, { records: { 42: { ...record, sections: [] } } }), null);
  assert.equal(resolveDetailedAbstract(article, { records: { 42: { ...record, sections: record.sections.map(() => ({ heading: "", text: "" })) } } }), null);
});

async function fixture(t, notes = { 42: note }) {
  const dir = await mkdtemp(join(tmpdir(), "vsih-abstracts-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pending = { ...article, pmid: "43" };
  for (const [name, value] of Object.entries({
    "abstract-notes.json": { preparedAt: "2026-11-15", notes },
    "latest-research.json": [article, pending],
    "reading-digest.json": { groups: [{ fileName: "latest-research.json", periods: { 30: { articles: [article, pending] } } }] }
  })) await writeFile(join(dir, name), JSON.stringify(value));
  t.mock.method(globalThis, "fetch", () => { throw new Error("Notes must not call an external service"); });
  return dir;
}

test("offline note generation reports available, pending and stale drafts without translating new papers", async (t) => {
  const dir = await fixture(t);
  const result = await updateDetailedAbstracts({ dataDir: dir });
  assert.deepEqual(result.counts, { available: 1, selected: 2, readySelected: 1, pendingSelected: 1 });
  assert.equal(result.records[42].isVerbatimTranslation, false);
  assert.equal(result.records[42].sourceAbstract, article.abstract);
  assert.match(result.records[42].preparation, /未经医学审校/);
  assert.equal(result.pending[0].pmid, "43");
  await writeFile(join(dir, "latest-research.json"), JSON.stringify([{ ...article, abstract: "Changed data" }]));
  const changed = await updateDetailedAbstracts({ dataDir: dir });
  assert.equal(changed.records[42], undefined);
  assert.deepEqual(changed.staleNotes, ["42"]);
  assert.match(changed.pending[0].reason, /原文摘要已变化/);
});

test("malformed drafts do not overwrite the last safe generated file", async (t) => {
  const dir = await fixture(t, { 42: { ...note, results: "" } });
  const safe = '{"records":{},"note":"safe"}';
  await writeFile(join(dir, "detailed-abstracts.json"), safe);
  await assert.rejects(updateDetailedAbstracts({ dataDir: dir }), /缺少必要章节/);
  assert.equal(await readFile(join(dir, "detailed-abstracts.json"), "utf8"), safe);
});

test("daily workflow schedule and homepage use the same Beijing time", async () => {
  const workflow = await readFile(new URL("../.github/workflows/update-data.yml", import.meta.url), "utf8");
  const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(workflow, /cron: "15 20 \* \* \*"/);
  assert.match(home, /每天 04:15 更新（北京时间，计划）/);
});
