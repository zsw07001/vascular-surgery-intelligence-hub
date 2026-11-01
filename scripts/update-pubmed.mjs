import { XMLParser, XMLValidator } from "fast-xml-parser";
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
import { ensureArray, loadDotEnv, readJsonFile, summarizeWithRules, writeJsonFile } from "./utils.mjs";

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
  const previous = ensureArray(await readJsonFile(join(dataDir, "latest-research.json"), []));
  const previousStatus = await readJsonFile(join(dataDir, "update-status.json"), {});
  const { search, records } = await retrievePubMedRecords(query, { rootDir });
  const articles = records
    .map(enrichArticle)
    .sort((a, b) => sortDate(b.publicationDate) - sortDate(a.publicationDate));

  const deduped = dedupeByPmid(articles);
  const requested = new Set(search.ids);
  if (deduped.length !== search.matchedCount || deduped.some((article) => !requested.has(article.pmid))) {
    throw new Error(`PubMed returned incomplete records (${deduped.length}/${search.matchedCount}); existing data was preserved.`);
  }
  const highImpact = deduped.filter(isHighImpactArticle);
  const chinaResearch = deduped.filter((article) => article.isChinaResearch);
  const counts = countByRelevance(deduped);
  counts.highImpact = highImpact.length;
  counts.china = chinaResearch.length;
  const retrieval = {
    matchedCount: search.matchedCount,
    fetchedCount: deduped.length,
    complete: true,
    searchPages: search.pages,
    fetchBatches: Math.ceil(search.ids.length / pubmedConfig.fetchBatchSize)
  };
  const changes = compareSnapshots(previous, deduped, previousStatus, query);

  if (shouldWrite) {
    await writePubMedOutputs(dataDir, deduped, highImpact, chinaResearch);
  }

  return {
    ok: true,
    skipped: false,
    error: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    pmids: search.ids,
    articles: deduped,
    highImpact,
    chinaResearch,
    counts,
    query,
    retrieval,
    changes
  };
}

function getRuntimeConfig() {
  return {
    email: (process.env[pubmedConfig.emailEnvVar] || "").trim(),
    tool: (process.env[pubmedConfig.toolEnvVar] || pubmedConfig.defaultTool).trim()
  };
}

export async function retrievePubMedRecords(query, options = {}) {
  await loadDotEnv(options.rootDir || defaultRootDir);
  const runtime = getRuntimeConfig();
  if (!runtime.email) throw new Error("NCBI_EMAIL is not configured; existing topic data was preserved.");
  const search = await searchPubMedIds(query, runtime, options);
  const records = dedupeByPmid(await fetchPubMedArticles(search.ids, runtime));
  const expected = new Set(search.ids);
  if (records.length !== search.matchedCount || records.some((article) => !expected.has(article.pmid))) {
    throw new Error("PubMed returned incomplete records; existing data was preserved.");
  }
  return { search, records };
}

async function searchPubMedIds(query, runtime, options = {}) {
  const url = new URL(`${pubmedConfig.eutilsBase}/esearch.fcgi`);
  url.searchParams.set("db", pubmedConfig.database);
  url.searchParams.set("term", query);
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", String(pubmedConfig.searchPageSize));
  url.searchParams.set("usehistory", "y");
  url.searchParams.set("datetype", options.dateType || pubmedConfig.dateType);
  url.searchParams.set("reldate", String(options.lookbackDays ?? pubmedConfig.lookbackDays));
  url.searchParams.set("sort", "pub date");
  url.searchParams.set("tool", runtime.tool);
  url.searchParams.set("email", runtime.email);

  const first = validateSearchResult(await fetchJson(url));
  const matchedCount = Number(first.count);
  // PubMed ESearch cannot page beyond 9,999 IDs. Never publish a silently truncated set.
  if (matchedCount > 9999) {
    throw new Error(`PubMed matched ${matchedCount} records, exceeding the ESearch 9,999-ID limit. Narrow the date window or query; existing data was preserved.`);
  }
  const ids = [...first.idlist];
  let pages = 1;
  if (matchedCount > ids.length && (!first.webenv || !first.querykey || !ids.length)) {
    throw new Error("PubMed did not return a complete search snapshot; existing data was preserved.");
  }

  for (let offset = ids.length; offset < matchedCount;) {
    await sleep(pubmedConfig.requestDelayMs);
    const pageUrl = new URL(`${pubmedConfig.eutilsBase}/esearch.fcgi`);
    pageUrl.search = new URLSearchParams({
      db: pubmedConfig.database,
      term: `#${first.querykey}`,
      WebEnv: first.webenv,
      usehistory: "y",
      retmode: "json",
      sort: "pub date",
      retstart: String(offset),
      retmax: String(Math.min(pubmedConfig.searchPageSize, matchedCount - offset)),
      tool: runtime.tool,
      email: runtime.email
    });
    const page = validateSearchResult(await fetchJson(pageUrl));
    if (Number(page.count) !== matchedCount || !page.idlist.length) {
      throw new Error("PubMed search pagination was incomplete; existing data was preserved.");
    }
    ids.push(...page.idlist);
    offset += page.idlist.length;
    pages += 1;
  }

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== matchedCount) {
    throw new Error(`PubMed search returned ${uniqueIds.length}/${matchedCount} unique IDs; existing data was preserved.`);
  }
  console.log(`PubMed search: ${matchedCount} matches across ${pages} page(s).`);
  return { ids: uniqueIds, matchedCount, pages };
}

function validateSearchResult(data) {
  const result = data?.esearchresult;
  if (data?.error || result?.ERROR || result?.errorlist || !/^\d+$/.test(String(result?.count)) || !Array.isArray(result?.idlist)) {
    throw new Error("PubMed returned an invalid search result; existing data was preserved.");
  }
  if (result.idlist.some((id) => !/^\d+$/.test(id))) {
    throw new Error("PubMed returned invalid PMID values; existing data was preserved.");
  }
  return result;
}

async function fetchPubMedArticles(ids, runtime) {
  const chunks = chunk(ids, pubmedConfig.fetchBatchSize);
  const articles = [];

  for (let index = 0; index < chunks.length; index += 1) {
    await sleep(pubmedConfig.requestDelayMs);

    const url = new URL(`${pubmedConfig.eutilsBase}/efetch.fcgi`);
    url.searchParams.set("db", pubmedConfig.database);
    url.searchParams.set("id", chunks[index].join(","));
    url.searchParams.set("retmode", "xml");
    url.searchParams.set("tool", runtime.tool);
    url.searchParams.set("email", runtime.email);

    const batch = parsePubMedXml(await fetchText(url));
    const expected = new Set(chunks[index]);
    const actual = new Set(batch.map((article) => article.pmid));
    if (actual.size !== expected.size || [...actual].some((pmid) => !expected.has(pmid))) {
      throw new Error(`PubMed EFetch batch ${index + 1} was incomplete; existing data was preserved.`);
    }
    articles.push(...batch);
  }

  return articles;
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
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("PubMed returned malformed XML; existing data was preserved.");
  }
  const parsed = parser.parse(xml);
  if (!parsed?.PubmedArticleSet || parsed.ERROR || parsed.PubmedArticleSet.ERROR) {
    throw new Error("PubMed returned an invalid EFetch response; existing data was preserved.");
  }
  const articles = arrayify(parsed?.PubmedArticleSet?.PubmedArticle);
  const books = arrayify(parsed?.PubmedArticleSet?.PubmedBookArticle);
  return [
    ...articles.map(normalizePubMedArticle),
    ...books.map(normalizePubMedBook)
  ].filter((article) => article.pmid);
}

function normalizePubMedBook(record) {
  const doc = record.BookDocument || {};
  const book = doc.Book || {};
  return normalizePubMedArticle({
    MedlineCitation: {
      PMID: doc.PMID,
      Article: {
        ...doc,
        ArticleTitle: doc.ArticleTitle || book.BookTitle,
        AuthorList: doc.AuthorList || book.AuthorList,
        Journal: { Title: book.BookTitle, JournalIssue: { PubDate: book.PubDate } },
        PublicationTypeList: { PublicationType: "Book Chapter" }
      }
    },
    PubmedData: { ArticleIdList: doc.ArticleIdList }
  });
}

export function compareSnapshots(previous, current, status, query) {
  const meta = status?.pubmed;
  const comparable = meta?.retrieval?.complete === true && meta?.counts?.total === previous.length &&
    meta?.query === query && meta?.lookbackDays === pubmedConfig.lookbackDays && meta?.dateType === pubmedConfig.dateType;
  const base = {
    comparable,
    comparedWith: meta?.lastSuccessfulUpdate || null,
    added: null,
    updated: null,
    removedFromWindow: null,
    unchanged: null
  };
  if (!comparable) return { ...base, note: "本次建立完整数据基线；后续显示相较上次成功同步的新入库和内容变更。" };

  const before = new Map(previous.map((article) => [article.pmid, article]));
  const after = new Set(current.map((article) => article.pmid));
  let added = 0;
  let updated = 0;
  for (const article of current) {
    const old = before.get(article.pmid);
    if (!old) added += 1;
    else if (articleFingerprint(old) !== articleFingerprint(article)) updated += 1;
  }
  return {
    ...base,
    added,
    updated,
    removedFromWindow: previous.filter((article) => !after.has(article.pmid)).length,
    unchanged: current.length - added - updated,
    note: "与上次完整同步比较；新入库指新增到本站的 PMID，内容变更指同一 PMID 的原始文献字段变化。移出窗口不代表论文被撤回。"
  };
}

function articleFingerprint(article) {
  const fields = ["title", "abstract", "journal", "publicationDate", "authors", "affiliations", "doi", "publicationTypes"];
  return JSON.stringify(fields.map((field) => article[field] ?? null));
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

export function getStudyTypeTags(article) {
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

export function hasChinaAffiliation(affiliations) {
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
