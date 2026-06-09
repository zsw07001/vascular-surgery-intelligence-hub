import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clinicalTrialsConfig } from "./config.mjs";
import { writeJsonFile } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");

export async function updateClinicalTrials(options = {}) {
  const targetDataDir = options.dataDir || dataDir;
  const shouldWrite = options.writeFiles !== false;
  const topicResults = [];
  const trials = [];
  const version = await fetchApiVersionSafely();

  for (const topic of clinicalTrialsConfig.topics) {
    try {
      const topicTrials = await fetchTrialsForTopic(topic);
      trials.push(...topicTrials);
      topicResults.push({
        topic,
        status: "success",
        count: topicTrials.length,
        message: "Fetched from ClinicalTrials.gov API v2."
      });
    } catch (error) {
      topicResults.push({
        topic,
        status: "error",
        count: 0,
        message: error.message
      });
    }
  }

  const deduped = dedupeTrials(trials)
    .map(normalizeTrial)
    .filter(isRelevantTrial)
    .filter((trial) => trial.nctId)
    .sort(compareTrials);

  const successCount = topicResults.filter((result) => result.status === "success").length;
  if (successCount === 0) {
    return {
      ok: false,
      error: "All ClinicalTrials.gov topic requests failed; existing data was preserved.",
      trials: [],
      topicResults,
      version
    };
  }

  if (shouldWrite) {
    await writeJsonFile(join(targetDataDir, "clinical-trials.json"), deduped);
  }

  return {
    ok: true,
    error: null,
    trials: deduped,
    topicResults,
    version
  };
}

async function fetchTrialsForTopic(topic) {
  const studies = [];
  let pageToken = "";

  for (let page = 0; page < clinicalTrialsConfig.maxPagesPerTopic; page += 1) {
    const url = new URL(`${clinicalTrialsConfig.apiBase}/studies`);
    url.searchParams.set("format", "json");
    url.searchParams.set(queryParamForTopic(topic), topic);
    url.searchParams.set("filter.overallStatus", clinicalTrialsConfig.activeStatuses.join(","));
    url.searchParams.set("pageSize", String(clinicalTrialsConfig.pageSize));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const data = await fetchJson(url);
    studies.push(...(data.studies || []));

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return studies;
}

function queryParamForTopic(topic) {
  return clinicalTrialsConfig.termTopics.includes(topic) ? "query.term" : "query.cond";
}

function normalizeTrial(study) {
  const protocol = study.protocolSection || {};
  const identification = protocol.identificationModule || {};
  const status = protocol.statusModule || {};
  const design = protocol.designModule || {};
  const conditions = protocol.conditionsModule || {};
  const arms = protocol.armsInterventionsModule || {};
  const sponsors = protocol.sponsorCollaboratorsModule || {};
  const contacts = protocol.contactsLocationsModule || {};
  const nctId = identification.nctId || "";

  return {
    nctId,
    title: identification.officialTitle || identification.briefTitle || "",
    condition: conditions.conditions || [],
    intervention: extractInterventions(arms),
    status: status.overallStatus || "",
    phase: extractPhase(design),
    studyType: design.studyType || "",
    enrollment: design.enrollmentInfo?.count ?? null,
    startDate: status.startDateStruct?.date || "",
    completionDate: status.completionDateStruct?.date || status.primaryCompletionDateStruct?.date || "",
    locations: extractLocations(contacts),
    sponsor: sponsors.leadSponsor?.name || "",
    trialUrl: nctId ? `https://clinicaltrials.gov/study/${nctId}` : "",
    source: "ClinicalTrials.gov",
    hasResults: Boolean(study.hasResults),
    lastUpdatePostDate: status.lastUpdatePostDateStruct?.date || "",
    summary: protocol.descriptionModule?.briefSummary || ""
  };
}

function extractInterventions(arms) {
  const interventions = (arms.interventions || []).map((item) =>
    [item.type, item.name].filter(Boolean).join(": ")
  );
  const armInterventions = (arms.armGroups || []).flatMap((group) => group.interventionNames || []);
  return [...new Set([...interventions, ...armInterventions].filter(Boolean))];
}

function extractPhase(design) {
  const phases = design.phases || [];
  if (phases.length) return phases.join(", ");
  return design.studyType === "INTERVENTIONAL" ? "Not Applicable" : "N/A";
}

function extractLocations(contacts) {
  return (contacts.locations || [])
    .map((location) =>
      [location.facility, location.city, location.state, location.country].filter(Boolean).join(", ")
    )
    .filter(Boolean)
    .slice(0, 30);
}

function dedupeTrials(studies) {
  const seen = new Set();
  const deduped = [];

  for (const study of studies) {
    const nctId = study.protocolSection?.identificationModule?.nctId;
    if (!nctId || seen.has(nctId)) continue;
    seen.add(nctId);
    deduped.push(study);
  }

  return deduped;
}

function compareTrials(a, b) {
  const statusDiff = statusRank(a.status) - statusRank(b.status);
  if (statusDiff !== 0) return statusDiff;
  return dateValue(b.lastUpdatePostDate || b.startDate) - dateValue(a.lastUpdatePostDate || a.startDate);
}

function isRelevantTrial(trial) {
  const text = trialText(trial);
  const hasInclude =
    clinicalTrialsConfig.includePatterns.some((pattern) => matchesPattern(text, pattern)) ||
    matchesContextualInclude(text);
  if (!hasInclude) return false;

  if (matchesStrictExcludeRule(text)) return false;

  const hasStrongVascularSignal = clinicalTrialsConfig.strongVascularPatterns.some((pattern) =>
    matchesPattern(text, pattern)
  );

  const hasExclude = clinicalTrialsConfig.excludePatterns.some((pattern) => matchesPattern(text, pattern));
  return !hasExclude || hasStrongVascularSignal;
}

function matchesContextualInclude(text) {
  return clinicalTrialsConfig.contextualIncludeRules.some((rule) => {
    const hasRequired = rule.requiredPatterns.every((pattern) => matchesPattern(text, pattern));
    const hasContext = rule.contextPatterns.some((pattern) => matchesPattern(text, pattern));
    return hasRequired && hasContext;
  });
}

function matchesStrictExcludeRule(text) {
  return clinicalTrialsConfig.strictExcludeRules.some((rule) => {
    const isBlocked = rule.blockPatterns.some((pattern) => matchesPattern(text, pattern));
    const isAllowed = rule.allowPatterns.some((pattern) => matchesPattern(text, pattern));
    return isBlocked && !isAllowed;
  });
}

function trialText(trial) {
  return [
    trial.title,
    trial.summary,
    trial.sponsor,
    trial.studyType,
    ...(trial.condition || []),
    ...(trial.intervention || []),
    ...(trial.locations || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesPattern(text, pattern) {
  const escaped = String(pattern).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = escaped.replace(/\\ /g, "[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${flexible}([^a-z0-9]|$)`, "i").test(text);
}

function statusRank(status) {
  const order = {
    RECRUITING: 0,
    NOT_YET_RECRUITING: 1,
    ACTIVE_NOT_RECRUITING: 2
  };
  return order[status] ?? 9;
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function fetchApiVersionSafely() {
  try {
    return await fetchJson(`${clinicalTrialsConfig.apiBase}/version`);
  } catch (error) {
    return { error: error.message };
  }
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`ClinicalTrials.gov request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), clinicalTrialsConfig.requestTimeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`ClinicalTrials.gov request timed out after ${clinicalTrialsConfig.requestTimeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateClinicalTrials()
    .then((result) => {
      if (result.ok) {
        console.log(`ClinicalTrials.gov update complete: ${result.trials.length} trials.`);
      } else {
        console.log(result.error);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
