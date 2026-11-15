import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeArticle } from "../lib/article-overview.js";
import { summarizeWithRules } from "../scripts/utils.mjs";

test("content overviews distinguish a clinical question from generic relevance advice", () => {
  const a = summarizeArticle({ title: "Index Below-Knee Endovascular Intervention for Intermittent Claudication Is Associated with Increased Amputation Risk.", abstract: "We examined patients treated with below-knee interventions." });
  const b = summarizeArticle({ title: "Perioperative prothrombin time activity trajectories and subsequent mortality after surgical repair of acute type A aortic dissection.", abstract: "We examined perioperative trajectories and mortality." });
  assert.match(a.summaryZh, /间歇性跛行/);
  assert.match(a.summaryZh, /膝下动脉腔内干预/);
  assert.match(a.summaryZh, /截肢风险/);
  assert.match(b.summaryZh, /急性A型主动脉夹层/);
  assert.match(b.summaryZh, /凝血酶原时间活动度/);
  assert.match(b.summaryZh, /死亡风险/);
  assert.notEqual(a.summaryZh, b.summaryZh);
  assert.doesNotMatch(a.summaryZh, /适合优先阅读|建议重点关注/);
});

test("review design and background trial keywords cannot masquerade as original RCT evidence", () => {
  const article = { title: "A systematic review of endovascular repair for aortic aneurysm", abstract: "Prior randomized trials were discussed.", publicationTypes: ["Review", "Randomized Controlled Trial"] };
  assert.match(summarizeArticle(article).summaryZh, /综述/);
  assert.doesNotMatch(summarizeArticle(article).summaryZh, /这项随机对照/);
  assert.doesNotMatch(summarizeArticle({ ...article, title: "Endovascular repair for aortic aneurysm", publicationTypes: ["Journal Article"] }).summaryZh, /这项随机对照/);
});

test("only the title and actual objective contribute concepts, not background outcomes", () => {
  const result = summarizeArticle({ title: "Vascular function measurement", abstract: "BACKGROUND: Older randomized trials assessed mortality. OBJECTIVE: We aimed to evaluate acoustic sensing in a vascular phantom. METHODS: Measurements were collected." });
  assert.match(result.summaryZh, /体外实验或血流模型/);
  assert.match(result.summaryZh, /信号检测/);
  assert.doesNotMatch(result.summaryZh, /死亡风险|随机对照/);
  const objectiveWithBackground = summarizeArticle({ title: "Machine learning to predict venous thromboembolism", abstract: "OBJECTIVE: VTE is a cause of morbidity and mortality. This study aimed to predict VTE in contraceptive users. METHODS: We trained a model." });
  assert.doesNotMatch(objectiveWithBackground.summaryZh, /死亡风险|培训/);
});

test("materials, protein degradation and machine learning remain separate concepts", () => {
  const material = summarizeArticle({ title: "Multiscale Mg-2&#x202f;Zn alloy for biodegradable implants with moderate degradation and ductility", abstract: "We studied biomaterials." });
  assert.match(material.summaryZh, /镁锌合金/);
  assert.match(material.summaryZh, /材料降解/);
  const protein = summarizeArticle({ title: "Neural stem cell exosomes prevent Cx43 degradation in ischemic stroke", abstract: "We examined protein stability." });
  assert.match(protein.summaryZh, /蛋白降解/);
  assert.doesNotMatch(protein.summaryZh, /材料降解/);
  const model = summarizeArticle({ title: "Machine learning to predict venous thromboembolism in women using combined oral contraceptives", abstract: "We developed a model." });
  assert.match(model.summaryZh, /复方口服避孕药/);
  assert.doesNotMatch(model.summaryZh, /培训/);
});

test("animal evidence and missing abstracts are explicit, and unknown subjects are not invented", () => {
  assert.match(summarizeArticle({ title: "Molecular hydrogen and cerebral ischemia reperfusion in mice", abstract: "Animal research." }).summaryZh, /动物实验线索/);
  assert.match(summarizeArticle({ title: "Endovascular repair for aortic aneurysm" }).summaryZh, /未提供摘要/);
  assert.match(summarizeArticle({ title: "A newly observed phenomenon" }).summaryZh, /暂无法可靠概括/);
  assert.match(summarizeArticle(null).summaryZh, /未提供摘要/);
});

test("a negative result is not converted into an invented benefit or significance claim", () => {
  const result = summarizeArticle({ title: "Molecular hydrogen did not improve recovery after ischemic stroke", abstract: "The intervention had no significant effect." });
  assert.match(result.summaryZh, /氢气干预/);
  assert.doesNotMatch(result.summaryZh, /显著改善|有效治疗|降低风险|提高生存/);
});

test("Node data generation shares the same overview rules as the browser", () => {
  const article = { title: "Carbon quantum dots for cerebral ischemia-reperfusion injury", abstract: "Sentence one. Sentence two. Sentence three. Sentence four." };
  assert.deepEqual(summarizeWithRules(article), summarizeArticle(article));
  assert.equal(summarizeArticle(article).englishSummary, "Sentence one. Sentence two. Sentence three.");
});

test("the screenshot's statistics and topic directory precede the home reading workspace", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.indexOf('class="stat-grid"') < html.indexOf('class="topics-band"'));
  assert.ok(html.indexOf('class="topics-band"') < html.indexOf('class="home-reading-band"'));
  assert.equal(html.match(/id="home-reading-digest"/g).length, 1);
});
