export function normalizeJournalName(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

export function resolveJournalMetrics(article, registry = {}) {
  const name = normalizeJournalName(article?.journal);
  const issns = (article?.journalIssns || []).map((value) => String(value).toUpperCase());
  const entries = Array.isArray(registry.journals) ? registry.journals : [];
  const byIssn = entries.filter((entry) => (entry.issns || []).some((issn) => issns.includes(issn)));
  const byName = entries.filter((entry) => [entry.title, ...(entry.aliases || [])].some((alias) => name && normalizeJournalName(alias) === name));
  const matches = byIssn.length ? byIssn : byName;
  // Ambiguous matches are never silently assigned a journal's metrics.
  const journal = matches.length === 1 ? matches[0] : null;
  const sources = Array.isArray(registry.sources) ? registry.sources : [];
  const sourceFor = (metric) => sources.find((source) => source.id === metric?.sourceId && safeSourceUrl(source.url));
  const impactSource = sourceFor(journal?.impactFactor);
  const casSource = sourceFor(journal?.cas);
  const jcrSource = sourceFor(journal?.jcr);
  const impact = journal?.impactFactor;
  const cas = journal?.cas;
  return {
    journalId: journal?.id || null,
    impactFactor: impactSource && typeof impact?.value === "number" && impact.value >= 0 && Number.isInteger(impact.year)
      ? { ...impact, sourceUrl: `${impactSource.url}${Number.isInteger(impact.page) ? `#page=${impact.page}` : ""}`, sourceLabel: impactSource.label } : null,
    jcr: jcrSource && journal.jcr.verified === true && /^Q[1-4]$/.test(journal.jcr.quartile) && Number.isInteger(journal.jcr.year)
      ? { ...journal.jcr, sourceUrl: `${jcrSource.url}${journal.jcr.page ? `#page=${journal.jcr.page}` : ""}`, sourceLabel: jcrSource.label } : null,
    cas: casSource && cas?.verified === true && [1, 2, 3, 4].includes(cas.zone) && Number.isInteger(cas.year) && ["major", "minor"].includes(cas.scope)
      ? { ...cas, sourceUrl: casSource.url, sourceLabel: casSource.label } : null
  };
}

export function isVerifiedJcrOne(metrics, year = 2025) {
  return metrics?.jcr?.quartile === "Q1" && metrics.jcr.year === year;
}

export function isVerifiedCasOne(metrics, year = 2025, scope = "major") {
  return metrics?.cas?.zone === 1 && metrics.cas.year === year && metrics.cas.scope === scope;
}
