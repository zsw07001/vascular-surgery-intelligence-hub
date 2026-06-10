import { XMLParser } from "fast-xml-parser";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildPubMedQuery,
  chinaAffiliationKeywords,
  highImpactConfig,
  pubmedConfig,
  scoringConfig,
  studyTypeTagRules,
  topicTagRules
} from "./config.mjs";
import { loadDotEnv, summarizeWithRules, writeJsonFile } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRootDir = join(__dirname, "..");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true
});

export async function updatePubMed(options = {}) {
  const rootDir = options.rootDir || defaultRootDir;
  const dataDir = options.dataDir || join(rootDir, "data");
  const shouldWrite = options.writeFiles !== false;

  await loadDotEnv(rootDir);

  const runtime = getRuntimeConfig();
  if (!runtime.email) {
    return {
      ok: false,
      skipped: true,
      error: `${pubmedConfig.emailEnvVar} is not configured. Fill .env before running real PubMed updates.`,
      articles: [],
      highImpact: [],
      chinaResearch: [],
      counts: emptyCounts()
    };
  }

  const query = buildPubMedQuery();
  const startedAt = new Date().toISOString();
  const ids = await searchPubMedIds(query, runtime);
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    const empty = [];
    if (shouldWrite) {
      await writePubMedOutputs(dataDir, empty, empty, empty);
    }
    return {
      ok: true,
      skipped: false,
      error: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      articles: empty,
      highImpact: empty,
      chinaResearch: empty,
      counts: emptyCounts(),
      query
    };
  }

  const xml = await fetchPubMedXml(uniqueIds, runtime);
  const articles = parsePubMedXml(xml)
    .map(enrichArticle)
    .sort((a, b) => sortDate(b.publicationDate) - sortDate(a.publicationDate));

  const deduped = dedupeByPmid(articles);
  const highImpact = deduped.filter(isHighImpactArticle);
  const chinaResearch = deduped.filter((article) => article.isChinaResearch);
  const counts = countByRelevance(deduped);
  counts.highImpact = highImpact.length;
  counts.china = chinaResearch.length;

  if (shouldWrite) {
    await writePubMedOutputs(dataDir, deduped, highImpact, chinaResearch);
  }

  return {
    ok: true,
    skipped: false,
    error: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    pmids: uniqueIds,
    articles: deduped,
    highImpact,
    chinaResearch,
    counts,
    query
  };
}

function getRuntimeConfig() {
  return {
    email: (process.env[pubmedConfig.emailEnvVar] || "").trim(),
    tool: (process.env[pubmedConfig.toolEnvVar] || pubmedConfig.defaultTool).trim()
  };
}

async function searchPubMedIds(query, runtime) {
  const url = new URL(`${pubmedConfig.eutilsBase}/esearch.fcgi`);
  url.searchParams.set("db", pubmedConfig.database);
  url.searchParams.set("term", query);
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", String(pubmedConfig.maxRecords));
  url.searchParams.set("datetype", pubmedConfig.dateType);
  url.searchParams.set("reldate", String(pubmedConfig.lookbackDays));
  url.searchParams.set("sort", "pub date");
  url.searchParams.set("tool", runtime.tool);
  url.searchParams.set("email", runtime.email);

  const data = await fetchJson(url);
  return data?.esearchresult?.idlist || [];
}

async function fetchPubMedXml(ids, runtime) {
  const chunks = chunk(ids, 100);
  const xmlParts = [];

  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) {
      await sleep(pubmedConfig.requestDelayMs);
    }

    const url = new URL(`${pubmedConfig.eutilsBase}/efetch.fcgi`);
    url.searchParams.set("db", pubmedConfig.database);
    url.searchParams.set("id", chunks[index].join(","));
    url.searchParams.set("retmode", "xml");
    url.searchParams.set("tool", runtime.tool);
    url.searchParams.set("email", runtime.email);

    xmlParts.push(await fetchText(url));
  }

  return `<PubmedArticleSet>${xmlParts.map(stripPubmedArticleSet).join("")}</PubmedArticleSet>`;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`PubMed request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`PubMed request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchWithRetry(url) {
  const maxAttempts = Math.max(1, (pubmedConfig.requestRetryCount || 0) + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url);
      if (!shouldRetryResponse(response) || attempt === maxAttempts) {
        return response;
      }

      lastError = new Error(`PubMed request failed: ${response.status} ${response.statusText}`);
      await waitBeforeRetry(attempt, maxAttempts, lastError.message);
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error) || attempt === maxAttempts) {
        throw error;
      }

      await waitBeforeRetry(attempt, maxAttempts, error.message);
    }
  }

  throw lastError || new Error("PubMed request failed after retries.");
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), pubmedConfig.requestTimeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`PubMed request timed out after ${pubmedConfig.requestTimeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRetryResponse(response) {
  return response.status === 429 || response.status >= 500;
}

function shouldRetryError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

async function waitBeforeRetry(attempt, maxAttempts, reason) {
  const delay = retryDelayMs(attempt);
  console.warn(`PubMed request retry ${attempt}/${maxAttempts - 1} after ${delay} ms: ${reason}`);
  await sleep(delay);
}

function retryDelayMs(attempt) {
  const baseDelay = pubmedConfig.requestRetryBaseDelayMs || 1000;
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay * 2 ** (attempt - 1) + jitter;
}

function parsePubMedXml(xml) {
  const parsed = parser.parse(xml);
  const articles = arrayify(parsed?.PubmedArticleSet?.PubmedArticle);
  return articles.map(normalizePubMedArticle).filter((article) => article.pmid);
}

function normalizePubMedArticle(record) {
  const citation = record?.MedlineCitation || {};
  const article = citation.Article || {};
  const journal = article.Journal || {};
  const pubmedData = record?.PubmedData || {};
  const articleIds = arrayify(pubmedData?.ArticleIdList?.ArticleId);
  const meshTerms = extractMeshTerms(citation);
  const authors = extractAuthors(article);
  const affiliations = extractAffiliations(article);
  const publicationTypes = arrayify(article?.PublicationTypeList?.PublicationType)
    .map(textValue)
    .filter(Boolean);
  const abstract = extractAbstract(article);
  const doi = extractArticleId(articleIds, "doi");
  const pmid = textValue(citation.PMID);

  return {
    pmid,
    title: cleanText(textValue(article.ArticleTitle)),
    abstract,
    journal: cleanText(textValue(journal.Title || journal.ISOAbbreviation)),
    publicationDate: normalizePublicationDate(article, journal),
    authors,
    affiliations,
    doi,
    pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    publicationTypes,
    meshTerms
  };
}

function enrichArticle(article) {
  const isChinaResearch = hasChinaAffiliation(article.affiliations);
  const topicTags = getTopicTags(article, isChinaResearch);
  const studyTypeTags = getStudyTypeTags(article);
  const scoringArticle = {
    ...article,
    topicTags,
    studyTypeTags,
    isChinaResearch
  };
  const scoreResult = scoreArticle(scoringArticle);
  const summary = summarizeWithRules(scoringArticle);

  return {
    pmid: article.pmid,
    title: article.title,
    abstract: article.abstract,
    englishSummary: summary.englishSummary,
    journal: article.journal,
    publicationDate: article.publicationDate,
    authors: article.authors,
    affiliations: article.affiliations,
    doi: article.doi,
    pubmedUrl: article.pubmedUrl,
    publicationTypes: article.publicationTypes,
    topicTags,
    studyTypeTags,
    relevance: scoreResult.relevance,
    score: scoreResult.score,
    scoreReasons: scoreResult.scoreReasons,
    isChinaResearch,
    summaryZh: summary.summaryZh,
    source: "PubMed"
  };
}

function scoreArticle(article) {
  let score = 0;
  const scoreReasons = [];

  for (const rule of scoringConfig.additions) {
    const text = textForScoringField(article, rule.field);
    const matched = firstMatchingPattern(text, rule.patterns);
    if (matched) {
      score += rule.points;
      scoreReasons.push(`+${rule.points} ${rule.label}: ${matched}`);
    }
  }

  const allText = textForScoringField(article, "all");
  for (const rule of scoringConfig.penalties) {
    const matched = firstMatchingPattern(allText, rule.patterns);
    if (matched) {
      score += rule.points;
      scoreReasons.push(`${rule.points} ${rule.label}: ${matched}`);
    }
  }

  return {
    score,
    scoreReasons,
    relevance: relevanceFromScore(score)
  };
}

function relevanceFromScore(score) {
  if (score >= scoringConfig.thresholds.high) return "high";
  const [mediumMin, mediumMax] = scoringConfig.thresholds.medium;
  if (score >= mediumMin && score <= mediumMax) return "medium";
  const [lowMin, lowMax] = scoringConfig.thresholds.low;
  if (score >= lowMin && score <= lowMax) return "low";
  return "review";
}

function getTopicTags(article, isChinaResearch) {
  const text = articleSearchText(article);
  const tags = topicTagRules
    .filter((rule) => firstMatchingPattern(text, rule.patterns))
    .map((rule) => rule.tag);

  if (isChinaResearch) {
    tags.push("China Research");
  }

  return [...new Set(tags)];
}

function getStudyTypeTags(article) {
  const text = articleSearchText(article);
  return [
    ...new Set(
      studyTypeTagRules
        .filter((rule) => firstMatchingPattern(text, rule.patterns))
        .map((rule) => rule.tag)
    )
  ];
}

function isHighImpactArticle(article) {
  if (highImpactConfig.includeRelevanceLevels.includes(article.relevance)) {
    return true;
  }

  const hasHighValueType = article.studyTypeTags.some((tag) =>
    highImpactConfig.highValueStudyTypes.includes(tag)
  );
  return hasHighValueType && article.score >= highImpactConfig.minimumScoreForHighValueStudyType;
}

function hasChinaAffiliation(affiliations) {
  const haystack = affiliations.join(" ").toLowerCase();
  return chinaAffiliationKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function articleSearchText(article) {
  return [
    article.title,
    article.abstract,
    article.journal,
    ...(article.publicationTypes || []),
    ...(article.affiliations || []),
    ...(article.meshTerms || [])
  ]
    .filter(Boolean)
    .join(" ");
}

function textForScoringField(article, field) {
  if (field === "title") return article.title || "";
  if (field === "abstract") return article.abstract || "";
  if (field === "publicationTypes") return (article.publicationTypes || []).join(" ");
  if (field === "affiliations") return (article.affiliations || []).join(" ");
  if (field === "meshOrAbstract") return [article.abstract, ...(article.meshTerms || [])].join(" ");
  if (field === "titleAbstract") return [article.title, article.abstract].join(" ");
  return articleSearchText(article);
}

function firstMatchingPattern(text, patterns) {
  const normalized = String(text || "").toLowerCase();
  return patterns.find((pattern) => matchesPattern(normalized, pattern)) || "";
}

function matchesPattern(text, pattern) {
  const escaped = String(pattern).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = escaped.replace(/\\ /g, "[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${flexible}([^a-z0-9]|$)`, "i").test(text);
}

function extractAuthors(article) {
  return arrayify(article?.AuthorList?.Author)
    .map((author) => {
      if (author?.CollectiveName) return cleanText(textValue(author.CollectiveName));
      const lastName = textValue(author?.LastName);
      const initials = textValue(author?.Initials);
      const foreName = textValue(author?.ForeName);
      return cleanText([lastName, initials || foreName].filter(Boolean).join(" "));
    })
    .filter(Boolean);
}

function extractAffiliations(article) {
  const affiliations = [];

  for (const author of arrayify(article?.AuthorList?.Author)) {
    for (const info of arrayify(author?.AffiliationInfo)) {
      const affiliation = cleanText(textValue(info?.Affiliation));
      if (affiliation) affiliations.push(affiliation);
    }
  }

  return [...new Set(affiliations)];
}

function extractAbstract(article) {
  const abstractText = arrayify(article?.Abstract?.AbstractText)
    .map((part) => {
      const label = textValue(part?.["@_Label"]);
      const text = cleanText(textValue(part));
      if (!text) return "";
      return label ? `${label}: ${text}` : text;
    })
    .filter(Boolean);

  return abstractText.join(" ");
}

function extractMeshTerms(citation) {
  return arrayify(citation?.MeshHeadingList?.MeshHeading)
    .map((heading) => textValue(heading?.DescriptorName))
    .filter(Boolean);
}

function extractArticleId(articleIds, idType) {
  const match = articleIds.find((id) => String(id?.["@_IdType"] || "").toLowerCase() === idType);
  return cleanText(textValue(match));
}

function normalizePublicationDate(article, journal) {
  const articleDate = arrayify(article?.ArticleDate)[0];
  if (articleDate) {
    return composeDate(articleDate.Year, articleDate.Month, articleDate.Day);
  }

  const pubDate = journal?.JournalIssue?.PubDate || {};
  if (pubDate.Year) {
    return composeDate(pubDate.Year, pubDate.Month, pubDate.Day);
  }

  const medlineDate = textValue(pubDate.MedlineDate);
  const year = medlineDate.match(/\d{4}/)?.[0];
  return year ? `${year}-01-01` : "";
}

function composeDate(yearValue, monthValue, dayValue) {
  const year = textValue(yearValue).match(/\d{4}/)?.[0];
  if (!year) return "";
  const month = normalizeMonth(textValue(monthValue)) || "01";
  const day = normalizeDay(textValue(dayValue)) || "01";
  return `${year}-${month}-${day}`;
}

function normalizeMonth(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const numeric = Number.parseInt(trimmed, 10);
  if (numeric >= 1 && numeric <= 12) return String(numeric).padStart(2, "0");

  const lookup = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  return lookup[trimmed.slice(0, 3).toLowerCase()] || "";
}

function normalizeDay(value) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return numeric >= 1 && numeric <= 31 ? String(numeric).padStart(2, "0") : "";
}

function dedupeByPmid(articles) {
  const seen = new Set();
  const deduped = [];

  for (const article of articles) {
    if (seen.has(article.pmid)) continue;
    seen.add(article.pmid);
    deduped.push(article);
  }

  return deduped;
}

function countByRelevance(articles) {
  return articles.reduce(
    (acc, article) => {
      acc.total += 1;
      acc[article.relevance] += 1;
      return acc;
    },
    emptyCounts()
  );
}

function emptyCounts() {
  return {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
    review: 0,
    china: 0,
    highImpact: 0
  };
}

async function writePubMedOutputs(dataDir, latest, highImpact, chinaResearch) {
  await Promise.all([
    writeJsonFile(join(dataDir, "latest-research.json"), latest),
    writeJsonFile(join(dataDir, "high-impact-research.json"), highImpact),
    writeJsonFile(join(dataDir, "china-research.json"), chinaResearch)
  ]);
}

function stripPubmedArticleSet(xml) {
  return xml
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/<!DOCTYPE[^>]*>/g, "")
    .replace(/<\/?PubmedArticleSet[^>]*>/g, "")
    .trim();
}

function textValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith("@_"))
      .map(([, child]) => textValue(child))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function arrayify(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function sortDate(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updatePubMed()
    .then((result) => {
      if (result.ok) {
        console.log(`Fetched ${result.articles.length} PubMed articles.`);
      } else {
        console.log(result.error);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
