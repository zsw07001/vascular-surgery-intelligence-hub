import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPubMedQuery, readingDigestConfig as config, researchDirectionsConfig } from "./config.mjs";
import { readJsonFile, writeJsonFile } from "./utils.mjs";
import { retrievePubMedRecords, enrichArticle } from "./update-pubmed.mjs";
import { decorateDirectionArticle } from "./update-research-directions.mjs";
import { isVerifiedJcrOne, resolveJournalMetrics } from "../lib/journal-metrics.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export function containsPattern(value, patterns) {
  const text = String(value || "").toLowerCase().replace(/[\u2010-\u2014]/g, "-");
  return patterns.some((pattern) => {
    const escaped = pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}`, "i").test(text);
  });
}

export function isRecentPublication(article, days, now = new Date()) {
  if (article.publicationDatePrecision !== "day" || !/^\d{4}-\d{2}-\d{2}$/.test(article.publicationDate || "")) return false;
  const published = new Date(`${article.publicationDate}T00:00:00Z`);
  if (Number.isNaN(published.getTime()) || published.toISOString().slice(0, 10) !== article.publicationDate) return false;
  const end = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return published.getTime() >= end - (days - 1) * 86400000 && published.getTime() <= end;
}

function matchesProfile(article, profile) {
  if (profile.alternatives) return profile.alternatives.some((item) => matchesProfile(article, item));
  const text = `${article.title || ""} ${article.abstract || ""}`;
  return containsPattern(article.title, profile.titleAny) && profile.requiredGroups.every((patterns) => containsPattern(text, patterns));
}

export function assessDigestArticle(article, groupId, registry) {
  const profile = config.profiles[groupId];
  const metrics = resolveJournalMetrics(article, registry);
  const types = (article.publicationTypes || []).map((value) => value.toLowerCase());
  const isReview = types.some((type) => config.reviewTypes.some((item) => item.toLowerCase() === type)) || containsPattern(article.title, config.reviewTitlePatterns) || /\b(?:this|our|the present) (?:systematic )?review\b/i.test(article.abstract || "");
  const blocked = types.some((type) => config.excludedPublicationTypes.some((item) => item.toLowerCase() === type)) || containsPattern(article.title, config.excludedTitlePatterns);
  const direct = !!profile && matchesProfile(article, profile);
  const confirmedOne = isVerifiedJcrOne(metrics, config.jcrYear);
  const exceptionalReview = isReview && config.exceptionalReviewPmids.includes(article.pmid) && (metrics.impactFactor?.value || 0) >= config.reviewMinimumImpactFactor;
  const eligible = !blocked && article.relevance === "high" && direct && confirmedOne && !!metrics.impactFactor && (article.abstract || "").length >= config.minimumAbstractLength && (!isReview || exceptionalReview);
  // Publication types take precedence over keywords mentioned in a review's abstract.
  const priority = !isReview && config.priorityTypes.find((rule) => rule.patterns.some((type) => types.includes(type.toLowerCase())));
  const methods = String(article.abstract || "").match(new RegExp(`(?:${config.designSectionLabels.join("|")}):([\\s\\S]*?)(?:\\b(?:${config.designSectionStops.join("|")}):|$)`, "i"))?.[1] || "";
  const observational = !isReview && config.observationalTypes.find((rule) => containsPattern(`${article.title} ${methods}`, rule.patterns));
  const kind = isReview ? "精选综述（人工确认）" : priority?.label || (observational ? `${observational.label}（标题/方法线索）` : "研究论文");
  const bonus = (profile?.bonusGroups || []).every((patterns) => containsPattern(`${article.title} ${article.abstract}`, patterns)) && profile?.bonusGroups?.length ? 10 : 0;
  const rank = 20 + (priority?.points || observational?.points || 3) + bonus + Math.min(Number(article.score) || 0, 10) - (isReview ? 10 : 0);
  const topicNote = profile?.alternatives?.find((item) => matchesProfile(article, item))?.note || profile?.note || "";
  const reason = `${topicNote}${kind === "研究论文" ? "研究设计与结论仍需原文复核。" : `${kind}；建议重点核对方法与终点。`}JCR ${config.jcrYear} Q1。`;
  return { eligible, direct, isReview, kind, rank, reason, metrics, blocked };
}

function limitSelection(items, limit = config.maxItems, groupLimit = Infinity) {
  const selected = [];
  const seen = new Set();
  const counts = new Map();
  let reviews = 0;
  for (const article of items) {
    const group = article.digestGroup;
    if (seen.has(article.pmid) || (counts.get(group) || 0) >= groupLimit || (article.digestIsReview && reviews >= config.maxReviews)) continue;
    selected.push(article);
    seen.add(article.pmid);
    counts.set(group, (counts.get(group) || 0) + 1);
    reviews += Number(article.digestIsReview);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function buildDigestSection(articles, groupId, registry, days, now = new Date()) {
  const recent = articles.filter((article) => isRecentPublication(article, days, now));
  const assessed = recent.map((article) => ({ article, ...assessDigestArticle(article, groupId, registry) }));
  const ranked = assessed.filter((item) => item.eligible).map((item) => ({
    ...item.article,
    journalMetrics: item.metrics,
    digestGroup: groupId,
    digestKind: item.kind,
    digestRank: item.rank,
    digestIsReview: item.isReview,
    selectionReason: item.reason
  })).sort((a, b) => b.digestRank - a.digestRank || b.publicationDate.localeCompare(a.publicationDate) || a.pmid.localeCompare(b.pmid));
  return {
    days,
    stats: {
      recentPublications: recent.length,
      directHighRelevance: assessed.filter((item) => item.direct && item.article.relevance === "high" && !item.blocked).length,
      metricsPending: assessed.filter((item) => item.direct && item.article.relevance === "high" && (item.metrics.jcr?.year !== config.jcrYear || !item.metrics.impactFactor)).length,
      eligible: ranked.length
    },
    articles: limitSelection(ranked),
    chinaArticles: limitSelection(ranked.filter((article) => article.isChinaResearch))
  };
}

export async function updateReadingDigest(options = {}) {
  const dataDir = options.dataDir || join(rootDir, "data");
  const now = options.now || new Date();
  const registry = await readJsonFile(join(dataDir, "journal-metrics.json"), {});
  if (!Array.isArray(registry.journals) || !registry.sources?.length) throw new Error("期刊指标表缺失或无可核对来源，保留上次精选。");
  const old = await readJsonFile(join(dataDir, "reading-candidates.json"), {});
  const directory = await readJsonFile(join(dataDir, "research-directions.json"), {});
  const status = await readJsonFile(join(dataDir, "update-status.json"), {});
  const definitions = [
    { id: "vascular", title: "血管外科", query: buildPubMedQuery(), fileName: "latest-research.json", count: status.pubmed?.counts?.total || 0 },
    ...researchDirectionsConfig.directions.map((direction) => ({ ...direction, fileName: `topic-${direction.id}.json`, count: directory.directions?.find((item) => item.id === direction.id)?.count || 0 }))
  ];
  const journalQuery = registry.journals.filter((journal) => isVerifiedJcrOne(resolveJournalMetrics({ journal: journal.title }, registry), config.jcrYear))
    .map((journal) => journal.issns?.length ? `"${journal.issns[0]}"[ISSN]` : `"${journal.title.replace(/"/g, "")}"[Journal]`).join(" OR ");
  if (!journalQuery) throw new Error("期刊指标表中没有已核实JCR Q1期刊，保留上次精选。");
  const sources = [];
  const groups = [];
  const errors = [];
  for (const definition of definitions) {
    const previous = (old.sources || []).find((item) => item.id === definition.id);
    let source = previous || { id: definition.id, status: "not_run", articles: [], lastSuccessfulUpdate: null };
    if (options.refresh !== false) {
      try {
        const query = `(${definition.query}) AND (${journalQuery})`;
        const { search, records } = await retrievePubMedRecords(query, { rootDir: options.rootDir || rootDir, lookbackDays: Math.max(...config.windows), dateType: "pdat" });
        const articles = records.map((article) => definition.id === "vascular" ? enrichArticle(article) : decorateDirectionArticle(article, definition));
        source = { id: definition.id, status: "success", articles, matchedCount: search.matchedCount, query, dateType: "pdat", lookbackDays: Math.max(...config.windows), lastSuccessfulUpdate: now.toISOString(), error: null };
      } catch (error) {
        source = { ...source, status: "error", error: error.message };
      }
    }
    if (source.status === "error") errors.push(`${definition.title}精选: ${source.error || "近期检索失败，保留缓存"}`);
    sources.push(source);
    const library = await readJsonFile(join(dataDir, definition.fileName), []);
    if (!Array.isArray(library)) throw new Error(`${definition.fileName} 不是文献数组，保留上次精选。`);
    const byPmid = new Map([...library, ...(source.articles || [])].filter((article) => article?.pmid).map((article) => [article.pmid, article]));
    groups.push({
      id: definition.id, title: definition.title, fileName: definition.fileName, libraryCount: library.length,
      sourceStatus: source.status, lastSuccessfulUpdate: source.lastSuccessfulUpdate,
      periods: Object.fromEntries(config.windows.map((days) => [days, buildDigestSection([...byPmid.values()], definition.id, registry, days, now)]))
    });
  }
  const periods = Object.fromEntries(config.windows.map((days) => {
    const ranked = groups.flatMap((group) => group.periods[days].articles).sort((a, b) => b.digestRank - a.digestRank || b.publicationDate.localeCompare(a.publicationDate));
    return [days, { articles: limitSelection(ranked, config.maxItems, config.maxPerGroupOnHome) }];
  }));
  const digest = {
    generatedAt: now.toISOString(), defaultWindow: config.defaultWindow,
    rankingSystem: "JCR", jcrYear: config.jcrYear, maxItems: config.maxItems, defaultVisibleItems: config.defaultVisibleItems, visibleItemOptions: config.visibleItemOptions, maxReviews: config.maxReviews,
    metrics: { journalCount: registry.journals.length, verifiedJcrOneCount: registry.journals.filter((journal) => isVerifiedJcrOne(resolveJournalMetrics({ journal: journal.title }, registry), config.jcrYear)).length, updatedAt: registry.updatedAt, note: registry.note },
    groups, periods, errors,
    note: "按实际发表日期筛选，不把PubMed记录修改当成新发表。高相关、直接主题匹配、已核实JCR 2025 Q1及有来源JIF；原始研究优先，普通综述不纳入。可自由切换5/10/20篇精选或完整文献库。JCR分区不等同中科院分区；所引用公开表未列逐学科明细，投稿/考核请核对原始JCR。未核实指标不推断为非Q1。"
  };
  await writeJsonFile(join(dataDir, "reading-candidates.json"), { updatedAt: now.toISOString(), sources });
  await writeJsonFile(join(dataDir, "reading-digest.json"), digest);
  return digest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateReadingDigest({ refresh: process.argv.includes("--refresh") }).then((digest) => {
    console.log(`Reading digest: ${digest.periods[30].articles.length} items; ${digest.metrics.journalCount} verified journal records.`);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
