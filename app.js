const DATA_FILES = {
  latestResearch: "latest-research.json",
  highImpactResearch: "high-impact-research.json",
  chinaResearch: "china-research.json",
  clinicalTrials: "clinical-trials.json",
  weeklyBrief: "weekly-brief.json",
  updateStatus: "update-status.json"
};

const RELEVANCE_LABELS = {
  high: "高相关",
  medium: "中相关",
  low: "低相关",
  review: "待复核"
};

document.addEventListener("DOMContentLoaded", () => {
  initPage().catch((error) => {
    console.error(error);
    renderFatalError(error);
  });
});

async function initPage() {
  const page = document.body.dataset.page || "home";

  if (page === "home") {
    await initHome();
    return;
  }

  if (page === "research") {
    await initResearchPage();
    return;
  }

  if (page === "trials") {
    await initTrialsPage();
    return;
  }

  if (page === "status") {
    await initStatusPage();
    return;
  }

  if (page === "weekly") {
    await initWeeklyPage();
    return;
  }

  await initGenericPage();
}

function dataBasePath() {
  return window.location.pathname.includes("/pages/") ? "../data/" : "data/";
}

async function loadJson(fileName, fallback = []) {
  const response = await fetch(`${dataBasePath()}${fileName}`, { cache: "no-store" });
  if (!response.ok) {
    return fallback;
  }
  return response.json();
}

async function initHome() {
  const [latest, highImpact, china, trials, weeklyBrief, status] = await Promise.all([
    loadJson(DATA_FILES.latestResearch),
    loadJson(DATA_FILES.highImpactResearch),
    loadJson(DATA_FILES.chinaResearch),
    loadJson(DATA_FILES.clinicalTrials),
    loadJson(DATA_FILES.weeklyBrief, {}),
    loadJson(DATA_FILES.updateStatus, {})
  ]);

  setText("[data-stat='latestCount']", latest.length);
  setText("[data-stat='highImpactCount']", highImpact.length);
  setText("[data-stat='chinaCount']", china.length);
  setText("[data-stat='activeTrialCount']", countActiveTrials(trials));

  const updated = status.lastUpdated ? formatDateTime(status.lastUpdated) : "等待数据";
  setText("#home-updated", updated);

  renderArticleList(document.querySelector("#home-latest-list"), latest.slice(0, 3), {
    compact: true,
    emptyTitle: "暂无最新文献"
  });
  renderArticleList(document.querySelector("#home-high-list"), highImpact.slice(0, 3), {
    compact: true,
    emptyTitle: "暂无重点研究"
  });
  renderWeeklyBrief(document.querySelector("#home-weekly-brief"), weeklyBrief, { compact: true });
}

async function initResearchPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedDataset = params.get("dataset");
  const bodyDataset = document.body.dataset.dataset || "latest-research";
  const datasetKey = requestedDataset === "high-impact" ? "high-impact-research" : bodyDataset;
  const title = datasetKey === "high-impact-research" ? "重点研究" : datasetKey === "china-research" ? "中国研究" : "最新文献";
  setText("#research-page-title", title);

  const fileName = `${datasetKey}.json`;
  const articles = await loadJson(fileName);
  const list = document.querySelector("#research-list");
  const meta = document.querySelector("#result-meta");
  const state = {
    articles,
    query: "",
    topic: "",
    studyType: "",
    relevance: "",
    chinaOnly: document.body.dataset.forceChina === "true"
  };

  populateSelect("#topic-filter", collectTopicTags(articles), "全部主题");
  populateSelect("#study-type-filter", collectStudyTypeTags(articles), "全部类型");

  const searchInput = document.querySelector("#search-input");
  const topicFilter = document.querySelector("#topic-filter");
  const studyTypeFilter = document.querySelector("#study-type-filter");
  const relevanceFilter = document.querySelector("#relevance-filter");
  const chinaFilter = document.querySelector("#china-filter");

  if (chinaFilter) {
    chinaFilter.checked = state.chinaOnly;
    chinaFilter.disabled = document.body.dataset.forceChina === "true";
  }

  const render = () => {
    const filtered = filterArticles(state);
    if (meta) {
      meta.textContent = `显示 ${filtered.length} / ${articles.length} 条`;
    }
    renderArticleList(list, filtered, {
      emptyTitle: "暂无匹配文献",
      emptyText: "可以调整关键词或筛选条件。"
    });
  };

  searchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });
  topicFilter?.addEventListener("change", (event) => {
    state.topic = event.target.value;
    render();
  });
  studyTypeFilter?.addEventListener("change", (event) => {
    state.studyType = event.target.value;
    render();
  });
  relevanceFilter?.addEventListener("change", (event) => {
    state.relevance = event.target.value;
    render();
  });
  chinaFilter?.addEventListener("change", (event) => {
    state.chinaOnly = event.target.checked;
    render();
  });

  render();
}

async function initTrialsPage() {
  const trials = await loadJson(DATA_FILES.clinicalTrials);
  const list = document.querySelector("#trial-list");
  const meta = document.querySelector("#result-meta");
  const searchInput = document.querySelector("#search-input");

  const render = () => {
    const query = searchInput?.value.trim().toLowerCase() || "";
    const filtered = trials.filter((trial) => trialMatchesQuery(trial, query));
    if (meta) {
      meta.textContent = `显示 ${filtered.length} / ${trials.length} 项试验`;
    }
    renderTrialList(list, filtered);
  };

  searchInput?.addEventListener("input", render);
  render();
}

async function initStatusPage() {
  const status = await loadJson(DATA_FILES.updateStatus, {});
  renderStatus(document.querySelector("#status-panel"), status);
}

async function initWeeklyPage() {
  const weeklyBrief = await loadJson(DATA_FILES.weeklyBrief, {});
  renderWeeklyBrief(document.querySelector("#weekly-brief-panel"), weeklyBrief);
}

async function initGenericPage() {
  const container = document.querySelector("#generic-list");
  if (!container) return;
  const source = container.dataset.source;
  const emptyTitle = container.dataset.emptyTitle || "暂无数据";
  const items = source ? await loadJson(source) : [];
  renderGenericList(container, items, emptyTitle);
}

function filterArticles(state) {
  return state.articles.filter((article) => {
    const topics = getTopicTags(article);
    const studyTypes = getStudyTypeTags(article);
    const relevance = getRelevance(article);
    const haystack = [
      article.title,
      article.abstract,
      article.englishSummary,
      article.summaryZh,
      article.journal,
      ...(article.authors || []),
      ...(article.affiliations || [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (state.query && !haystack.includes(state.query)) return false;
    if (state.topic && !topics.includes(state.topic)) return false;
    if (state.studyType && !studyTypes.includes(state.studyType)) return false;
    if (state.relevance && relevance !== state.relevance) return false;
    if (state.chinaOnly && !article.isChinaResearch) return false;
    return true;
  });
}

function renderArticleList(container, articles, options = {}) {
  if (!container) return;
  if (!Array.isArray(articles) || articles.length === 0) {
    renderEmpty(container, options.emptyTitle || "暂无文献数据", options.emptyText || "更新脚本运行后会在这里显示结果。");
    return;
  }

  container.innerHTML = articles.map((article) => renderArticleCard(article, options)).join("");
}

function renderArticleCard(article, options = {}) {
  const relevance = getRelevance(article);
  const topics = getTopicTags(article);
  const studyTypes = getStudyTypeTags(article);
  const pubmedUrl = article.pubmedUrl || (article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : "");
  const title = escapeHtml(article.title || "Untitled article");
  const summary = escapeHtml(article.summaryZh || "暂无中文辅助说明。");
  const englishSummary = article.englishSummary ? `<p class="english-summary">${escapeHtml(article.englishSummary)}</p>` : "";
  const compactClass = options.compact ? " compact" : "";
  const scoreText = typeof article.score === "number" ? `<span>Score ${escapeHtml(String(article.score))}</span>` : "";

  return `
    <article class="article-card${compactClass}">
      <div class="card-topline">
        <span>${escapeHtml(article.journal || "Unknown journal")}</span>
        <span class="badge ${relevance}">${RELEVANCE_LABELS[relevance] || "待复核"}</span>
      </div>
      <h3>${pubmedUrl ? `<a href="${escapeAttribute(pubmedUrl)}" target="_blank" rel="noopener">${title}</a>` : title}</h3>
      <div class="meta-row">
        <span>${formatDate(article.publicationDate)}</span>
        <span>${escapeHtml((article.authors || []).slice(0, 3).join(", ") || "作者信息待补充")}</span>
        ${scoreText}
      </div>
      <p class="summary">${summary}</p>
      ${englishSummary}
      <div class="tag-row">
        ${topics.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        ${studyTypes.map((tag) => `<span class="tag study">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <div class="link-row">
        ${article.pmid ? `<a href="${escapeAttribute(pubmedUrl)}" target="_blank" rel="noopener">PMID ${escapeHtml(article.pmid)}</a>` : ""}
        ${article.doi ? `<a href="https://doi.org/${escapeAttribute(article.doi)}" target="_blank" rel="noopener">DOI</a>` : ""}
      </div>
    </article>
  `;
}

function renderWeeklyBrief(container, brief, options = {}) {
  if (!container) return;
  if (!brief || !Array.isArray(brief.priorityReading)) {
    renderEmpty(container, "暂无每周精选", "运行 npm run update 后会基于 PubMed 数据生成周报。");
    return;
  }

  const priority = brief.priorityReading || [];
  const china = brief.chinaHighlights || [];
  const review = brief.reviewQueue || [];
  const trends = brief.topicTrends || [];
  const counts = brief.counts || {};

  if (!priority.length && !china.length && !review.length && !trends.length) {
    renderEmpty(container, "暂无每周精选", "当前没有可用于生成周报的 PubMed 数据。");
    return;
  }

  const maxTrend = Math.max(...trends.map((item) => item.count), 1);
  const compact = options.compact;
  const priorityLimit = compact ? 3 : 6;

  container.innerHTML = `
    <div class="brief-summary">
      <div>
        <span>周期</span>
        <strong>${escapeHtml(formatBriefPeriod(brief.period))}</strong>
      </div>
      <div>
        <span>PubMed 文献</span>
        <strong>${escapeHtml(String(counts.latestResearch ?? 0))}</strong>
      </div>
      <div>
        <span>重点研究</span>
        <strong>${escapeHtml(String(counts.highImpact ?? 0))}</strong>
      </div>
      <div>
        <span>中国研究</span>
        <strong>${escapeHtml(String(counts.chinaResearch ?? 0))}</strong>
      </div>
    </div>
    <div class="brief-grid">
      <section class="brief-card">
        <div class="section-heading tight">
          <p class="eyebrow">Priority Reading</p>
          <h3>优先阅读</h3>
        </div>
        <div class="item-list compact-list">
          ${priority.slice(0, priorityLimit).map((article) => renderArticleCard(article, { compact: true })).join("")}
        </div>
      </section>
      <section class="brief-card">
        <div class="section-heading tight">
          <p class="eyebrow">Topic Trends</p>
          <h3>主题趋势</h3>
        </div>
        ${renderTopicTrends(trends, maxTrend)}
      </section>
      ${
        compact
          ? ""
          : `
            <section class="brief-card">
              <div class="section-heading tight">
                <p class="eyebrow">China Watch</p>
                <h3>中国研究</h3>
              </div>
              <div class="item-list compact-list">
                ${china.map((article) => renderArticleCard(article, { compact: true })).join("")}
              </div>
            </section>
            <section class="brief-card">
              <div class="section-heading tight">
                <p class="eyebrow">Manual Review</p>
                <h3>待复核队列</h3>
              </div>
              <div class="item-list compact-list">
                ${review.map((article) => renderArticleCard(article, { compact: true })).join("")}
              </div>
            </section>
          `
      }
    </div>
  `;
}

function renderTopicTrends(trends, maxTrend) {
  if (!trends.length) {
    return `<div class="empty-inline">暂无主题趋势。</div>`;
  }

  return `
    <div class="topic-trends">
      ${trends
        .map(
          (item) => `
            <div class="topic-meter">
              <div>
                <strong>${escapeHtml(item.tag)}</strong>
                <span>${escapeHtml(String(item.count))}</span>
              </div>
              <meter min="0" max="${escapeAttribute(String(maxTrend))}" value="${escapeAttribute(String(item.count))}"></meter>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTrialList(container, trials) {
  if (!container) return;
  if (!Array.isArray(trials) || trials.length === 0) {
    renderEmpty(container, "暂无临床试验数据", "下一阶段接入 ClinicalTrials.gov API v2 后会自动更新。");
    return;
  }

  container.innerHTML = trials
    .map((trial) => {
      const url = trial.trialUrl || `https://clinicaltrials.gov/study/${trial.nctId}`;
      return `
        <article class="trial-card">
          <div class="card-topline">
            <span>${escapeHtml(trial.status || "Unknown status")}</span>
            <span>${escapeHtml(trial.phase || "N/A")}</span>
          </div>
          <h3><a href="${escapeAttribute(url)}" target="_blank" rel="noopener">${escapeHtml(trial.title || trial.nctId)}</a></h3>
          <div class="meta-row">
            <span>${escapeHtml(trial.nctId || "")}</span>
            <span>${escapeHtml(trial.studyType || "Study type pending")}</span>
            <span>Enrollment ${escapeHtml(String(trial.enrollment ?? "N/A"))}</span>
          </div>
          <p class="summary">${escapeHtml((trial.condition || []).join("; ") || "疾病领域待补充")}</p>
          <div class="tag-row">
            ${(trial.intervention || []).slice(0, 6).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
          </div>
          <div class="link-row">
            <a href="${escapeAttribute(url)}" target="_blank" rel="noopener">ClinicalTrials.gov</a>
            <span>${escapeHtml(trial.sponsor || "Sponsor pending")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderGenericList(container, items, emptyTitle) {
  if (!Array.isArray(items) || items.length === 0) {
    renderEmpty(container, emptyTitle, "第一阶段保留数据结构和空状态，后续可接入公开来源。");
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <article class="generic-card">
          <div class="card-topline">
            <span>${escapeHtml(item.source || "Source pending")}</span>
            <span>${formatDate(item.date)}</span>
          </div>
          <h3>${item.url ? `<a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>
          <p class="summary">${escapeHtml(item.summary || "暂无摘要。")}</p>
        </article>
      `
    )
    .join("");
}

function renderStatus(container, status) {
  if (!container) return;
  if (!status || Object.keys(status).length === 0) {
    renderEmpty(container, "暂无更新状态", "运行 npm run update 后会生成数据状态。");
    return;
  }

  const sources = status.sources || [];
  const reviewItems = status.manualReview || [];
  container.innerHTML = `
    <div class="status-summary">
      <strong>最后更新时间：${escapeHtml(formatDateTime(status.lastUpdated))}</strong>
      <span>运行模式：${escapeHtml(status.mode || "unknown")}</span>
      <span>说明：${escapeHtml(status.note || "暂无说明")}</span>
    </div>
    <div class="status-grid">
      ${sources
        .map(
          (source) => `
            <article class="status-card">
              <strong>${escapeHtml(source.name || "Unknown source")}</strong>
              <span class="${statusClass(source.status)}">${escapeHtml(source.status || "unknown")}</span>
              <p>抓取数量：${escapeHtml(String(source.count ?? 0))}</p>
              <p>${escapeHtml(source.message || "无错误信息")}</p>
            </article>
          `
        )
        .join("")}
    </div>
    <article class="status-summary">
      <strong>下一步待人工复核事项</strong>
      ${
        reviewItems.length
          ? `<ul class="review-list">${reviewItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : `<p>暂无待复核事项。</p>`
      }
    </article>
  `;
}

function renderEmpty(container, title, text) {
  container.innerHTML = `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderFatalError(error) {
  const main = document.querySelector("main");
  if (!main) return;
  const container = document.createElement("section");
  container.className = "empty-state";
  container.innerHTML = `<strong>页面加载失败</strong><span>${escapeHtml(error.message)}</span>`;
  main.prepend(container);
}

function populateSelect(selector, values, label) {
  const select = document.querySelector(selector);
  if (!select) return;
  select.innerHTML = `<option value="">${escapeHtml(label)}</option>${values
    .map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
}

function collectTopicTags(articles) {
  const values = new Set();
  for (const article of articles) {
    for (const tag of getTopicTags(article)) {
      values.add(tag);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function collectStudyTypeTags(articles) {
  const values = new Set();
  for (const article of articles) {
    for (const tag of getStudyTypeTags(article)) {
      values.add(tag);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function getTopicTags(article) {
  return article.topicTags || article.tags?.topics || [];
}

function getStudyTypeTags(article) {
  return article.studyTypeTags || article.tags?.studyTypes || [];
}

function getRelevance(article) {
  if (typeof article.relevance === "string") {
    return article.relevance;
  }
  return article.relevance?.level || "review";
}

function trialMatchesQuery(trial, query) {
  if (!query) return true;
  const haystack = [
    trial.nctId,
    trial.title,
    trial.status,
    trial.phase,
    trial.studyType,
    trial.sponsor,
    ...(trial.condition || []),
    ...(trial.intervention || []),
    ...(trial.locations || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function countActiveTrials(trials) {
  const activeStatuses = new Set(["RECRUITING", "NOT_YET_RECRUITING", "ACTIVE_NOT_RECRUITING"]);
  return trials.filter((trial) => activeStatuses.has(String(trial.status || "").toUpperCase())).length;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function statusClass(status) {
  if (status === "success") return "status-ok";
  if (status === "skipped" || status === "not_run") return "status-warning";
  return "status-error";
}

function formatDate(value) {
  if (!value) return "日期待补充";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatBriefPeriod(period) {
  if (!period?.start && !period?.end) return "周期待补充";
  return `${formatDate(period.start)} - ${formatDate(period.end)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
