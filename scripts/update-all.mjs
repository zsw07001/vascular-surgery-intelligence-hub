import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPubMedQuery, clinicalTrialsConfig, pubmedConfig } from "./config.mjs";
import { ensureArray, readJsonFile, writeJsonFile } from "./utils.mjs";
import { updatePubMed } from "./update-pubmed.mjs";
import { updateClinicalTrials } from "./update-clinicaltrials.mjs";
import { updateDerivedInsights } from "./update-derived-insights.mjs";
import { updateWeeklyBrief } from "./update-weekly-brief.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");

const supportArrayFiles = [
  "clinical-trials.json",
  "guidelines.json",
  "device-regulatory.json",
  "safety.json",
  "conference-news.json"
];
async function main() {
  const supportResults = await validateSupportData();
  const existingCounts = await readExistingPubMedCounts();
  const pubmedResult = await runPubMedSafely();
  const effectiveCounts = pubmedResult.ok ? pubmedResult.counts : existingCounts;
  const clinicalTrialsResult = await runClinicalTrialsSafely();
  const derivedResult = await runDerivedInsightsSafely();
  const weeklyBriefResult = await runWeeklyBriefSafely();

  const updateStatus = {
    lastUpdated: new Date().toISOString(),
    mode: pubmedResult.ok ? "pubmed" : pubmedResult.skipped ? "pubmed-skipped" : "pubmed-error",
    note: pubmedResult.ok
      ? "PubMed 已接入真实 ESearch/EFetch；ClinicalTrials.gov 已接入 API v2。"
      : "PubMed 未成功更新，已保留现有文献数据；ClinicalTrials.gov 会继续尝试使用 API v2 更新。",
    sources: [
      {
        name: "PubMed ESearch/EFetch",
        status: pubmedResult.ok ? "success" : pubmedResult.skipped ? "skipped" : "error",
        count: effectiveCounts.total,
        message: pubmedResult.ok
          ? `Fetched ${pubmedResult.articles.length} articles from PubMed.`
          : pubmedResult.error,
        startedAt: pubmedResult.startedAt || null,
        finishedAt: pubmedResult.finishedAt || null
      },
      {
        name: "ClinicalTrials.gov",
        status: clinicalTrialsResult.ok ? "success" : "error",
        count: clinicalTrialsResult.count,
        message: clinicalTrialsResult.ok
          ? `Fetched ${clinicalTrialsResult.count} active/recruiting trials from ClinicalTrials.gov API v2.`
          : clinicalTrialsResult.error,
        apiVersion: clinicalTrialsResult.version?.apiVersion || null,
        dataTimestamp: clinicalTrialsResult.version?.dataTimestamp || null
      },
      {
        name: "Guidelines and device regulatory",
        status: derivedResult.ok ? "success" : statusForSupport(supportResults),
        count: derivedResult.guidelines + derivedResult.devices,
        message: derivedResult.ok ? "Generated from current PubMed JSON." : derivedResult.error
      },
      {
        name: "Safety signals",
        status: derivedResult.ok ? "success" : statusForSupport(supportResults),
        count: derivedResult.safety,
        message: derivedResult.ok ? "Generated from current PubMed JSON." : derivedResult.error
      },
      {
        name: "Weekly Brief",
        status: weeklyBriefResult.ok ? "success" : "error",
        count: weeklyBriefResult.count,
        message: weeklyBriefResult.ok ? "Weekly brief generated from current PubMed JSON." : weeklyBriefResult.error
      }
    ],
    pubmed: {
      lookbackDays: pubmedConfig.lookbackDays,
      dateType: pubmedConfig.dateType,
      maxRecords: pubmedConfig.maxRecords,
      query: buildPubMedQuery(),
      counts: effectiveCounts,
      highImpactCount: pubmedResult.ok ? pubmedResult.highImpact.length : existingCounts.highImpact,
      chinaResearchCount: pubmedResult.ok ? pubmedResult.chinaResearch.length : existingCounts.china
    },
    errors: [
      pubmedResult.ok ? "" : pubmedResult.error,
      clinicalTrialsResult.ok ? "" : clinicalTrialsResult.error,
      derivedResult.ok ? "" : derivedResult.error,
      weeklyBriefResult.ok ? "" : weeklyBriefResult.error
    ].filter(Boolean),
    manualReview: buildManualReviewItems(pubmedResult, effectiveCounts),
    configPreview: {
      pubmedQuery: buildPubMedQuery(),
      clinicalTrialTopics: clinicalTrialsConfig.topics
    }
  };

  await writeJsonFile(join(dataDir, "update-status.json"), updateStatus);

  if (pubmedResult.ok) {
    console.log(
      `PubMed update complete: ${pubmedResult.articles.length} total, ${pubmedResult.highImpact.length} high-impact, ${pubmedResult.chinaResearch.length} China research.`
    );
  } else {
    console.log(`PubMed update skipped/failed: ${pubmedResult.error}`);
  }
  if (weeklyBriefResult.ok) {
    console.log(`Weekly brief generated: ${weeklyBriefResult.count} priority items.`);
  }
  if (derivedResult.ok) {
    console.log(
      `Derived insights generated: ${derivedResult.guidelines} guidelines, ${derivedResult.devices} device signals, ${derivedResult.safety} safety signals.`
    );
  }
  if (clinicalTrialsResult.ok) {
    console.log(`ClinicalTrials.gov update complete: ${clinicalTrialsResult.count} trials.`);
  }
}

async function runPubMedSafely() {
  try {
    return await updatePubMed({ rootDir, dataDir });
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error.message,
      articles: [],
      highImpact: [],
      chinaResearch: [],
      counts: await readExistingPubMedCounts()
    };
  }
}

async function validateSupportData() {
  const results = [];

  for (const fileName of supportArrayFiles) {
    const filePath = join(dataDir, fileName);

    if (!existsSync(filePath)) {
      await writeJsonFile(filePath, []);
    }

    try {
      const value = ensureArray(await readJsonFile(filePath, []));
      await writeJsonFile(filePath, value);
      results.push({
        name: fileName,
        status: "success",
        count: value.length,
        message: "Existing data validated."
      });
    } catch (error) {
      results.push({
        name: fileName,
        status: "error",
        count: 0,
        message: error.message
      });
    }
  }

  return results;
}

async function runClinicalTrialsSafely() {
  try {
    const result = await updateClinicalTrials({ dataDir });
    return {
      ok: result.ok,
      count: result.ok ? result.trials.length : ensureArray(await readJsonFile(join(dataDir, "clinical-trials.json"), [])).length,
      error: result.error,
      version: result.version,
      topicResults: result.topicResults
    };
  } catch (error) {
    return {
      ok: false,
      count: ensureArray(await readJsonFile(join(dataDir, "clinical-trials.json"), [])).length,
      error: error.message,
      version: null,
      topicResults: []
    };
  }
}

async function runDerivedInsightsSafely() {
  try {
    const result = await updateDerivedInsights({ dataDir });
    return {
      ok: true,
      guidelines: result.guidelines.length,
      devices: result.devices.length,
      safety: result.safety.length,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      guidelines: ensureArray(await readJsonFile(join(dataDir, "guidelines.json"), [])).length,
      devices: ensureArray(await readJsonFile(join(dataDir, "device-regulatory.json"), [])).length,
      safety: ensureArray(await readJsonFile(join(dataDir, "safety.json"), [])).length,
      error: error.message
    };
  }
}

async function runWeeklyBriefSafely() {
  try {
    const brief = await updateWeeklyBrief({ dataDir });
    return {
      ok: true,
      count: brief.priorityReading.length + brief.chinaHighlights.length + brief.reviewQueue.length,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      error: error.message
    };
  }
}

async function readExistingPubMedCounts() {
  const latest = ensureArray(await readJsonFile(join(dataDir, "latest-research.json"), []));
  const highImpact = ensureArray(await readJsonFile(join(dataDir, "high-impact-research.json"), []));
  const china = ensureArray(await readJsonFile(join(dataDir, "china-research.json"), []));

  return latest.reduce(
    (acc, article) => {
      acc.total += 1;
      const relevance = normalizeRelevance(article);
      if (Object.prototype.hasOwnProperty.call(acc, relevance)) {
        acc[relevance] += 1;
      } else {
        acc.review += 1;
      }
      return acc;
    },
    {
      total: 0,
      high: 0,
      medium: 0,
      low: 0,
      review: 0,
      china: china.length,
      highImpact: highImpact.length
    }
  );
}

function normalizeRelevance(article) {
  if (typeof article.relevance === "string") return article.relevance;
  return article.relevance?.level || "review";
}

function buildManualReviewItems(pubmedResult, counts) {
  const items = [];

  if (!pubmedResult.ok) {
    items.push("PubMed 未成功更新：请检查 .env 中 NCBI_EMAIL 是否已填写，或稍后重试 NCBI E-utilities。");
  }

  if (counts.review > 0) {
    items.push(`有 ${counts.review} 篇文献被标记为 review，建议人工确认是否纳入。`);
  }

  if (counts.low > 0) {
    items.push(`有 ${counts.low} 篇文献为低相关，建议抽样检查排除规则是否需要收紧。`);
  }

  if (counts.china > 0) {
    items.push(`有 ${counts.china} 篇文献命中中国机构 affiliation，建议抽样核对机构字段。`);
  }

  if (items.length === 0) {
    items.push("暂无明显待复核事项；仍建议抽样核对 PMID、DOI、affiliation 和标签结果。");
  }

  return items;
}

function statusForSupport(results) {
  return results.every((result) => result.status === "success") ? "success" : "error";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
