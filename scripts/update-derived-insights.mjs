import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ensureArray, readJsonFile, writeJsonFile } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");

const safetyPatterns = [
  "adverse",
  "complication",
  "mortality",
  "bleeding",
  "infection",
  "thrombosis",
  "embolization",
  "rupture",
  "reintervention",
  "restenosis",
  "endoleak",
  "device failure",
  "stent fracture",
  "occlusion"
];

const devicePatterns = [
  "stent",
  "graft",
  "endograft",
  "device",
  "prosthesis",
  "drug-coated balloon",
  "drug coated balloon",
  "covered stent",
  "atherectomy",
  "balloon angioplasty",
  "vascular closure",
  "flow diverter"
];

const guidelinePatterns = [
  "guideline",
  "practice guideline",
  "consensus",
  "recommendation",
  "position statement",
  "standards of care"
];

export async function updateDerivedInsights(options = {}) {
  const targetDataDir = options.dataDir || dataDir;
  const latest = ensureArray(await readJsonFile(join(targetDataDir, "latest-research.json"), []));

  const guidelines = selectDerivedItems(latest, {
    patterns: guidelinePatterns,
    tagMatchers: ["Guideline / Consensus"],
    studyTypeMatchers: ["Guideline"],
    sourceLabel: "PubMed guideline signal",
    limit: 30
  });

  const devices = selectDerivedItems(latest, {
    patterns: devicePatterns,
    tagMatchers: ["Vascular Graft / Stent / Device"],
    sourceLabel: "PubMed device signal",
    limit: 40
  });

  const safety = selectDerivedItems(latest, {
    patterns: safetyPatterns,
    sourceLabel: "PubMed safety signal",
    limit: 40
  });

  await Promise.all([
    writeJsonFile(join(targetDataDir, "guidelines.json"), guidelines),
    writeJsonFile(join(targetDataDir, "device-regulatory.json"), devices),
    writeJsonFile(join(targetDataDir, "safety.json"), safety)
  ]);

  return {
    guidelines,
    devices,
    safety
  };
}

function selectDerivedItems(articles, options) {
  return dedupeByPmid(
    articles
      .filter((article) => matchesDerivedRule(article, options))
      .sort((a, b) => rankArticle(b, options) - rankArticle(a, options) || dateValue(b.publicationDate) - dateValue(a.publicationDate))
      .slice(0, options.limit)
      .map((article) => toGenericItem(article, options.sourceLabel))
  );
}

function matchesDerivedRule(article, options) {
  const text = articleText(article);
  const patternMatch = (options.patterns || []).some((pattern) => matchesPattern(text, pattern));
  const topicMatch = (options.tagMatchers || []).some((tag) => (article.topicTags || []).includes(tag));
  const typeMatch = (options.studyTypeMatchers || []).some((tag) => (article.studyTypeTags || []).includes(tag));
  return patternMatch || topicMatch || typeMatch;
}

function rankArticle(article, options) {
  const text = articleText(article);
  const patternScore = (options.patterns || []).filter((pattern) => matchesPattern(text, pattern)).length * 2;
  const topicScore = (options.tagMatchers || []).filter((tag) => (article.topicTags || []).includes(tag)).length * 3;
  const typeScore = (options.studyTypeMatchers || []).filter((tag) => (article.studyTypeTags || []).includes(tag)).length * 4;
  const relevanceScore = { high: 6, medium: 3, low: 1, review: 0 }[article.relevance] || 0;
  return patternScore + topicScore + typeScore + relevanceScore + (article.score || 0);
}

function matchesPattern(text, pattern) {
  const escaped = String(pattern).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = escaped.replace(/\\ /g, "[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${flexible}([^a-z0-9]|$)`, "i").test(text);
}

function toGenericItem(article, sourceLabel) {
  return {
    pmid: article.pmid,
    title: article.title,
    source: sourceLabel,
    journal: article.journal,
    date: article.publicationDate,
    summary: article.summaryZh || "该条目来自 PubMed 规则筛选，建议回到原文核对。",
    url: article.pubmedUrl,
    doi: article.doi || "",
    topicTags: article.topicTags || [],
    studyTypeTags: article.studyTypeTags || [],
    relevance: article.relevance || "review",
    score: article.score || 0,
    isChinaResearch: Boolean(article.isChinaResearch)
  };
}

function articleText(article) {
  return [
    article.title,
    article.abstract,
    article.summaryZh,
    article.journal,
    ...(article.publicationTypes || []),
    ...(article.topicTags || []),
    ...(article.studyTypeTags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function dedupeByPmid(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = item.pmid || item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateDerivedInsights()
    .then((result) => {
      console.log(
        `Derived insights generated: ${result.guidelines.length} guidelines, ${result.devices.length} device signals, ${result.safety.length} safety signals.`
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
