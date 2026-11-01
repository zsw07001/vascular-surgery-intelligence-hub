import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { researchDirectionsConfig } from "./config.mjs";
import { ensureArray, readJsonFile, writeJsonFile } from "./utils.mjs";
import { retrievePubMedRecords, getStudyTypeTags, hasChinaAffiliation } from "./update-pubmed.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function updateResearchDirections(options = {}) {
  const dataDir = options.dataDir || join(rootDir, "data");
  const previous = await readJsonFile(join(dataDir, "research-directions.json"), {});
  const directions = [];
  const errors = [];

  for (const direction of researchDirectionsConfig.directions) {
    const fileName = `topic-${direction.id}.json`;
    const old = (previous.directions || []).find((item) => item.id === direction.id);
    const item = {
      id: direction.id,
      title: direction.title,
      icon: direction.icon,
      description: direction.description,
      fileName,
      lookbackDays: researchDirectionsConfig.lookbackDays,
      dateType: researchDirectionsConfig.dateType,
      query: direction.query,
      lastAttemptAt: new Date().toISOString()
    };
    try {
      const { search, records } = await retrievePubMedRecords(direction.query, {
        rootDir: options.rootDir || rootDir,
        lookbackDays: researchDirectionsConfig.lookbackDays,
        dateType: researchDirectionsConfig.dateType
      });
      const articles = records.map((article) => decorateDirectionArticle(article, direction))
        .sort((a, b) => b.score - a.score || b.publicationDate.localeCompare(a.publicationDate));
      await writeJsonFile(join(dataDir, fileName), articles);
      directions.push({ ...item, status: "success", count: articles.length, matchedCount: search.matchedCount, complete: true, lastSuccessfulUpdate: new Date().toISOString(), error: null });
      console.log(`Research topic ${direction.id}: ${articles.length}/${search.matchedCount} articles.`);
    } catch (error) {
      const existing = ensureArray(await readJsonFile(join(dataDir, fileName), []));
      directions.push({ ...item, status: "error", count: existing.length, matchedCount: old?.matchedCount ?? null, complete: old?.complete || false, lastSuccessfulUpdate: old?.lastSuccessfulUpdate || null, error: error.message });
      errors.push(`${direction.title}: ${error.message}`);
    }
  }

  const result = { updatedAt: new Date().toISOString(), lookbackDays: researchDirectionsConfig.lookbackDays, directions };
  await writeJsonFile(join(dataDir, "research-directions.json"), result);
  return { ...result, errors };
}

export function decorateDirectionArticle(article, direction) {
  const text = [article.title, article.abstract, ...(article.meshTerms || [])].join(" ").toLowerCase();
  const groups = direction.groups.filter((group) => group.patterns.some((pattern) => text.includes(pattern.toLowerCase())));
  const titleMatch = groups.some((group) => group.patterns.some((pattern) => article.title.toLowerCase().includes(pattern.toLowerCase())));
  const rules = researchDirectionsConfig.scoring;
  const score = groups.length * rules.groupMatch + (titleMatch ? rules.titleMatch : 0);
  const isChinaResearch = hasChinaAffiliation(article.affiliations || []);
  return {
    pmid: article.pmid,
    title: article.title,
    abstract: article.abstract,
    englishSummary: article.abstract.split(/(?<=[.!?])\s+/).slice(0, 3).join(" "),
    journal: article.journal,
    publicationDate: article.publicationDate,
    authors: article.authors,
    affiliations: article.affiliations,
    doi: article.doi,
    pubmedUrl: article.pubmedUrl,
    publicationTypes: article.publicationTypes,
    topicTags: [...(groups.length ? groups.map((group) => group.tag) : [direction.title]), ...(isChinaResearch ? ["China Research"] : [])],
    studyTypeTags: getStudyTypeTags(article),
    relevance: score >= rules.highThreshold ? "high" : "medium",
    score,
    scoreReasons: [...groups.map((group) => `+${rules.groupMatch} 专题匹配: ${group.tag}`), ...(titleMatch ? [`+${rules.titleMatch} 标题命中专题词`] : [])],
    isChinaResearch,
    summaryZh: groups.map((group) => group.note).slice(0, 2).join(" ") || `该文献由“${direction.title}”独立检索式收录，建议结合原文确认相关性。`,
    source: "PubMed",
    researchDirection: direction.id
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateResearchDirections().then((result) => {
    console.log(`Research topics updated: ${result.directions.filter((item) => item.status === "success").length}/${result.directions.length}.`);
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
