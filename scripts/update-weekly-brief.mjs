import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ensureArray, readJsonFile, writeJsonFile } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");

export async function updateWeeklyBrief(options = {}) {
  const targetDataDir = options.dataDir || dataDir;
  const latest = ensureArray(await readJsonFile(join(targetDataDir, "latest-research.json"), []));
  const highImpact = ensureArray(await readJsonFile(join(targetDataDir, "high-impact-research.json"), []));
  const chinaResearch = ensureArray(await readJsonFile(join(targetDataDir, "china-research.json"), []));

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);

  const brief = {
    generatedAt: now.toISOString(),
    period: {
      start: toDateString(weekStart),
      end: toDateString(now)
    },
    counts: {
      latestResearch: latest.length,
      highImpact: highImpact.length,
      chinaResearch: chinaResearch.length,
      reviewQueue: latest.filter((article) => article.relevance === "review").length
    },
    topicTrends: buildTopicTrends(latest),
    priorityReading: selectArticles(highImpact, 6),
    chinaHighlights: selectArticles(chinaResearch, 4),
    reviewQueue: selectArticles(
      latest.filter((article) => article.relevance === "review"),
      5
    ),
    note: "规则生成周报：基于现有 PubMed 数据按相关性、研究类型、中国机构和主题标签排序，不调用 AI。"
  };

  await writeJsonFile(join(targetDataDir, "weekly-brief.json"), brief);
  return brief;
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

function selectArticles(articles, limit) {
  return [...articles]
    .sort((a, b) => articleRank(b) - articleRank(a) || dateValue(b.publicationDate) - dateValue(a.publicationDate))
    .slice(0, limit)
    .map((article) => ({
      pmid: article.pmid,
      title: article.title,
      journal: article.journal,
      publicationDate: article.publicationDate,
      authors: article.authors || [],
      doi: article.doi || "",
      pubmedUrl: article.pubmedUrl,
      topicTags: article.topicTags || [],
      studyTypeTags: article.studyTypeTags || [],
      relevance: article.relevance || "review",
      score: article.score || 0,
      isChinaResearch: Boolean(article.isChinaResearch),
      summaryZh: article.summaryZh || ""
    }));
}

function articleRank(article) {
  const studyTypeBonus = new Set(["RCT", "Clinical Trial", "Systematic Review", "Meta-analysis", "Guideline"]);
  const relevanceBonus = { high: 8, medium: 4, low: 1, review: 0 };
  const typeScore = (article.studyTypeTags || []).filter((tag) => studyTypeBonus.has(tag)).length * 2;
  return (article.score || 0) + (relevanceBonus[article.relevance] || 0) + typeScore;
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
      console.log(`Weekly brief generated: ${brief.priorityReading.length} priority articles.`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
