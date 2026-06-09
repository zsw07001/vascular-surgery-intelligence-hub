import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ensureArray, readJsonFile, writeJsonFile } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");

const PRIORITY_TOPIC_TAGS = new Set([
  "PAD / CLTI",
  "Aortic Disease",
  "Carotid Disease",
  "Venous Disease",
  "Endovascular",
  "Vascular Graft / Stent / Device"
]);

const SPECIFIC_VASCULAR_TOPIC_TAGS = new Set([
  "PAD / CLTI",
  "Aortic Disease",
  "Carotid Disease",
  "Venous Disease",
  "Dialysis Access",
  "Vascular Graft / Stent / Device"
]);

const PRIORITY_STUDY_TYPES = new Set([
  "RCT",
  "Clinical Trial",
  "Guideline",
  "Systematic Review",
  "Meta-analysis",
  "Registry",
  "Real-world Evidence"
]);

const TRIAL_ACTIVE_STATUSES = new Set(["RECRUITING", "NOT_YET_RECRUITING", "ACTIVE_NOT_RECRUITING"]);

const TRIAL_TOPIC_RULES = [
  { tag: "PAD / CLTI", patterns: ["peripheral arterial disease", "peripheral artery disease", "pad", "clti", "critical limb", "chronic limb"] },
  { tag: "Aortic Disease", patterns: ["aortic", "aneurysm", "dissection", "evar", "tevar"] },
  { tag: "Carotid Disease", patterns: ["carotid"] },
  { tag: "Venous Disease", patterns: ["deep vein thrombosis", "dvt", "venous", "varicose", "thromboembolism", "pulmonary embolism"] },
  { tag: "Dialysis Access", patterns: ["hemodialysis", "dialysis access", "vascular access", "arteriovenous fistula"] },
  { tag: "Endovascular", patterns: ["endovascular", "stent", "thrombectomy", "ivus", "angioplasty"] },
  { tag: "Vascular Graft / Stent / Device", patterns: ["stent", "graft", "endograft", "device", "prosthesis", "thrombectomy system"] }
];

export async function updateWeeklyBrief(options = {}) {
  const targetDataDir = options.dataDir || dataDir;
  const latest = ensureArray(await readJsonFile(join(targetDataDir, "latest-research.json"), []));
  const highImpact = ensureArray(await readJsonFile(join(targetDataDir, "high-impact-research.json"), []));
  const chinaResearch = ensureArray(await readJsonFile(join(targetDataDir, "china-research.json"), []));
  const trials = ensureArray(await readJsonFile(join(targetDataDir, "clinical-trials.json"), []));
  const guidelines = ensureArray(await readJsonFile(join(targetDataDir, "guidelines.json"), []));
  const devices = ensureArray(await readJsonFile(join(targetDataDir, "device-regulatory.json"), []));
  const safety = ensureArray(await readJsonFile(join(targetDataDir, "safety.json"), []));
  const conferenceNews = ensureArray(await readJsonFile(join(targetDataDir, "conference-news.json"), []));

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);

  const priorityReading = selectPriorityArticles(latest, highImpact, 10);
  const chinaHighlights = selectChinaArticles(chinaResearch, 5);
  const trialHighlights = selectTrialHighlights(trials, 10);
  const manualReview = buildManualReviewItems({ guidelines, devices, safety, conferenceNews });
  const topicTrends = buildTopicTrends(latest);
  const counts = {
    latestResearch: latest.length,
    highImpact: highImpact.length,
    chinaResearch: chinaResearch.length,
    clinicalTrials: trials.length,
    guidelines: guidelines.length,
    devices: devices.length,
    safety: safety.length,
    manualReview: manualReview.length,
    totalBriefItems: priorityReading.length + chinaHighlights.length + trialHighlights.length + manualReview.length
  };

  const brief = {
    generatedAt: now.toISOString(),
    period: {
      start: toDateString(weekStart),
      end: toDateString(now)
    },
    dataUpdatedAt: now.toISOString(),
    sourceUpdates: buildSourceUpdates(counts, now.toISOString()),
    counts,
    overviewZh: buildOverviewZh(counts),
    topicTrends,
    priorityReading,
    priorityArticles: priorityReading,
    chinaHighlights,
    chinaResearch: chinaHighlights,
    trialHighlights,
    clinicalTrials: trialHighlights,
    manualReview,
    reviewQueue: manualReview,
    note: "规则生成周报：基于 PubMed、ClinicalTrials.gov 和派生提醒数据按相关性、研究类型、主题、招募状态和更新时间排序，不调用 AI。"
  };

  await writeJsonFile(join(targetDataDir, "weekly-brief.json"), brief);
  return brief;
}

function selectPriorityArticles(latest, highImpact, limit) {
  const byPmid = new Map();

  for (const article of [...highImpact, ...latest]) {
    if (!article?.pmid || article.relevance === "low") continue;
    byPmid.set(article.pmid, article);
  }

  return [...byPmid.values()]
    .filter((article) => hasSpecificVascularTopic(article) && (article.relevance === "high" || hasPriorityStudyType(article) || hasPriorityTopic(article)))
    .sort((a, b) => articleRank(b) - articleRank(a) || dateValue(b.publicationDate) - dateValue(a.publicationDate))
    .slice(0, limit)
    .map(articleToBriefItem);
}

function selectChinaArticles(chinaResearch, limit) {
  return [...chinaResearch]
    .filter((article) => article.relevance !== "low" && hasSpecificVascularTopic(article))
    .sort((a, b) => articleRank(b) - articleRank(a) || dateValue(b.publicationDate) - dateValue(a.publicationDate))
    .slice(0, limit)
    .map((article) =>
      articleToBriefItem(article, {
        reasonPrefix: "中国机构研究"
      })
    );
}

function selectTrialHighlights(trials, limit) {
  return [...trials]
    .filter((trial) => TRIAL_ACTIVE_STATUSES.has(String(trial.status || "").toUpperCase()))
    .sort((a, b) => trialRank(b) - trialRank(a) || dateValue(b.lastUpdatePostDate || b.startDate) - dateValue(a.lastUpdatePostDate || a.startDate))
    .slice(0, limit)
    .map(trialToBriefItem);
}

function buildManualReviewItems({ guidelines, devices, safety, conferenceNews }) {
  const items = [
    ...selectReviewSignals(guidelines, 4, "Guidelines", "指南/共识信号，建议人工确认是否为正式指南或专家共识。"),
    ...selectReviewSignals(devices, 4, "Devices / Regulatory", "器械/支架/腔内治疗信号，建议人工核对器械名称、适应证和监管来源。"),
    ...selectReviewSignals(safety, 4, "Safety", "安全性或并发症信号，建议人工复核终点、事件定义和临床可操作性。"),
    ...selectReviewSignals(conferenceNews, 3, "Conference / News", "会议或热点信号，建议人工确认来源和时效性。")
  ];

  if (!conferenceNews.length) {
    items.push({
      title: "会议与热点来源待人工维护",
      source: "Conference / News",
      date: "",
      topicTags: ["Conference / News"],
      reason: "当前暂无会议/新闻结构化数据，建议后续人工补充可信来源。",
      url: ""
    });
  }

  return items.slice(0, 10);
}

function selectReviewSignals(items, limit, sourceName, fallbackReason) {
  return [...items]
    .sort((a, b) => signalRank(b) - signalRank(a) || dateValue(b.date || b.publicationDate) - dateValue(a.date || a.publicationDate))
    .slice(0, limit)
    .map((item) => ({
      title: item.title || "Untitled signal",
      source: sourceName,
      date: item.date || item.publicationDate || "",
      topicTags: item.topicTags || [],
      reason: buildSignalReason(item, fallbackReason),
      url: item.url || item.pubmedUrl || ""
    }));
}

function articleToBriefItem(article, options = {}) {
  const reason = buildArticleReason(article, options.reasonPrefix);

  return {
    pmid: article.pmid || "",
    title: article.title || "Untitled article",
    source: article.source || "PubMed",
    date: article.publicationDate || "",
    journal: article.journal || "",
    topicTags: article.topicTags || [],
    studyTypeTags: article.studyTypeTags || [],
    relevance: article.relevance || "review",
    score: article.score || 0,
    reason,
    summaryZh: article.summaryZh || reason,
    url: article.pubmedUrl || (article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : ""),
    doi: article.doi || ""
  };
}

function trialToBriefItem(trial) {
  const topicTags = inferTrialTopicTags(trial);
  const reasonParts = [
    statusLabel(trial.status),
    trial.studyType === "INTERVENTIONAL" ? "介入性研究" : "",
    topicTags.length ? `主题：${topicTags.slice(0, 3).join(" / ")}` : "",
    typeof trial.enrollment === "number" && trial.enrollment >= 300 ? `计划入组 ${trial.enrollment}` : "",
    trial.lastUpdatePostDate ? `最近更新 ${trial.lastUpdatePostDate}` : ""
  ].filter(Boolean);

  return {
    nctId: trial.nctId || "",
    title: trial.title || trial.nctId || "Untitled trial",
    source: "ClinicalTrials.gov",
    date: trial.lastUpdatePostDate || trial.startDate || "",
    topicTags,
    status: trial.status || "",
    studyType: trial.studyType || "",
    enrollment: trial.enrollment ?? null,
    reason: reasonParts.join("；") || "招募中或进行中的血管外科相关临床试验。",
    url: trial.trialUrl || (trial.nctId ? `https://clinicaltrials.gov/study/${trial.nctId}` : "")
  };
}

function buildTopicTrends(articles) {
  const counts = new Map();

  for (const article of articles) {
    for (const tag of article.topicTags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 8);
}

function articleRank(article) {
  const relevanceBonus = { high: 18, medium: 7, review: 1, low: -20 };
  const typeScore = (article.studyTypeTags || []).filter((tag) => PRIORITY_STUDY_TYPES.has(tag)).length * 5;
  const topicScore = (article.topicTags || []).filter((tag) => PRIORITY_TOPIC_TAGS.has(tag)).length * 3;
  const chinaScore = article.isChinaResearch ? 2 : 0;
  const recencyScore = recencyBonus(article.publicationDate, 60);
  return (article.score || 0) + (relevanceBonus[article.relevance] || 0) + typeScore + topicScore + chinaScore + recencyScore;
}

function trialRank(trial) {
  const statusScore = { RECRUITING: 14, NOT_YET_RECRUITING: 10, ACTIVE_NOT_RECRUITING: 8 };
  const topicScore = inferTrialTopicTags(trial).filter((tag) => PRIORITY_TOPIC_TAGS.has(tag)).length * 4;
  const enrollmentScore = Math.min(Math.floor((trial.enrollment || 0) / 100), 8);
  const interventionalScore = trial.studyType === "INTERVENTIONAL" ? 4 : 0;
  const recencyScore = recencyBonus(trial.lastUpdatePostDate || trial.startDate, 365);
  return (statusScore[trial.status] || 0) + topicScore + enrollmentScore + interventionalScore + recencyScore;
}

function signalRank(item) {
  const topicScore = (item.topicTags || []).filter((tag) => PRIORITY_TOPIC_TAGS.has(tag)).length * 3;
  const relevanceScore = { high: 6, medium: 3, low: -2, review: 0 }[item.relevance] || 0;
  return (item.score || 0) + topicScore + relevanceScore;
}

function hasPriorityStudyType(article) {
  return (article.studyTypeTags || []).some((tag) => PRIORITY_STUDY_TYPES.has(tag));
}

function hasPriorityTopic(article) {
  return (article.topicTags || []).some((tag) => PRIORITY_TOPIC_TAGS.has(tag));
}

function hasSpecificVascularTopic(article) {
  return (article.topicTags || []).some((tag) => SPECIFIC_VASCULAR_TOPIC_TAGS.has(tag));
}

function buildArticleReason(article, prefix = "") {
  const parts = [
    prefix,
    article.relevance === "high" ? "high relevance" : "",
    priorityMatches(article.studyTypeTags, PRIORITY_STUDY_TYPES).join(" / "),
    priorityMatches(article.topicTags, PRIORITY_TOPIC_TAGS).join(" / "),
    article.score ? `score ${article.score}` : ""
  ].filter(Boolean);

  return parts.join("；") || "与血管外科主题相关，建议快速浏览摘要和原文。";
}

function buildSignalReason(item, fallbackReason) {
  const parts = [
    fallbackReason,
    item.relevance === "high" ? "high relevance" : "",
    priorityMatches(item.topicTags, PRIORITY_TOPIC_TAGS).join(" / ")
  ].filter(Boolean);
  return parts.join("；");
}

function buildOverviewZh(counts) {
  return `本周自动汇总 ${counts.latestResearch} 篇 PubMed 文献、${counts.clinicalTrials} 项进行中/招募中临床试验，并筛出 ${counts.totalBriefItems} 条重点简报条目。`;
}

function buildSourceUpdates(counts, updatedAt) {
  return [
    { name: "PubMed", status: "success", count: counts.latestResearch, updatedAt },
    { name: "ClinicalTrials.gov", status: "success", count: counts.clinicalTrials, updatedAt },
    { name: "Guidelines", status: counts.guidelines > 0 ? "success" : "not_run", count: counts.guidelines, updatedAt },
    { name: "Devices / Regulatory", status: counts.devices > 0 ? "success" : "not_run", count: counts.devices, updatedAt },
    { name: "Safety", status: counts.safety > 0 ? "success" : "not_run", count: counts.safety, updatedAt },
    { name: "Weekly Brief", status: "success", count: counts.totalBriefItems, updatedAt }
  ];
}

function inferTrialTopicTags(trial) {
  const text = [
    trial.title,
    trial.summary,
    ...(trial.condition || []),
    ...(trial.intervention || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return TRIAL_TOPIC_RULES.filter((rule) => rule.patterns.some((pattern) => includesTerm(text, pattern))).map((rule) => rule.tag);
}

function priorityMatches(values = [], prioritySet) {
  return values.filter((value) => prioritySet.has(value));
}

function statusLabel(status) {
  const labels = {
    RECRUITING: "正在招募",
    NOT_YET_RECRUITING: "尚未开始招募",
    ACTIVE_NOT_RECRUITING: "进行中但不再招募"
  };
  return labels[status] || status || "";
}

function includesTerm(text, pattern) {
  return text.includes(pattern.toLowerCase());
}

function recencyBonus(value, maxDays) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const days = (Date.now() - date.getTime()) / 86400000;
  if (days < 0) return 2;
  return Math.max(0, Math.ceil(maxDays - days) / maxDays) * 3;
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateWeeklyBrief()
    .then((brief) => {
      console.log(`Weekly brief generated: ${brief.counts.totalBriefItems} items.`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
