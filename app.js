const DATA_FILES = {
  latestResearch: "latest-research.json",
  highImpactResearch: "high-impact-research.json",
  chinaResearch: "china-research.json",
  clinicalTrials: "clinical-trials.json",
  guidelines: "guidelines.json",
  deviceRegulatory: "device-regulatory.json",
  safety: "safety.json",
  researchDirections: "research-directions.json",
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
  const nav = document.querySelector(".top-nav");
  if (nav && !nav.querySelector("[data-topics-link]")) {
    const link = document.createElement("a");
    link.href = window.location.pathname.includes("/pages/") ? "topics.html" : "pages/topics.html";
    link.dataset.topicsLink = "true";
    link.textContent = "课题组专题";
    if (page === "topics" || new URLSearchParams(window.location.search).has("topic")) {
      nav.querySelector("[aria-current='page']")?.removeAttribute("aria-current");
      link.setAttribute("aria-current", "page");
    }
    nav.prepend(link);
  }

  if (page === "topics") {
    const directions = await loadJson(DATA_FILES.researchDirections, {});
    renderTopicDirectory(document.querySelector("#topic-directory"), directions);
    return;
  }

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
  try {
    const response = await fetch(`${dataBasePath()}${fileName}`, { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }
    const data = await response.json();
    if (Array.isArray(fallback) && !Array.isArray(data)) return fallback;
    return data && typeof data === "object" ? data : fallback;
  } catch (error) {
    console.warn(`Unable to load ${fileName}`, error);
    return fallback;
  }
}

async function initHome() {
  const [latest, highImpact, china, trials, guidelines, devices, safety, weeklyBrief, status, directions] = await Promise.all([
    loadJson(DATA_FILES.latestResearch),
    loadJson(DATA_FILES.highImpactResearch),
    loadJson(DATA_FILES.chinaResearch),
    loadJson(DATA_FILES.clinicalTrials),
    loadJson(DATA_FILES.guidelines),
    loadJson(DATA_FILES.deviceRegulatory),
    loadJson(DATA_FILES.safety),
    loadJson(DATA_FILES.weeklyBrief, {}),
    loadJson(DATA_FILES.updateStatus, {}),
    loadJson(DATA_FILES.researchDirections, {})
  ]);

  setText("[data-stat='latestCount']", formatNumber(latest.length));
  setText("[data-stat='highImpactCount']", formatNumber(highImpact.length));
  setText("[data-stat='chinaCount']", formatNumber(china.length));
  setText("[data-stat='activeTrialCount']", formatNumber(countActiveTrials(trials)));

  const updated = status.lastUpdated ? formatDateTime(status.lastUpdated) : "等待数据";
  setText("#home-updated", updated);
  const updateStrip = document.querySelector("#home-pubmed-update");
  if (updateStrip) updateStrip.innerHTML = renderPubMedSync(status);
  renderHomeStatus(document.querySelector("#home-status-panel"), status, {
    pubmed: latest.length,
    clinicalTrials: trials.length,
    guidelines: guidelines.length,
    devices: devices.length,
    safety: safety.length,
    weeklyBrief: countWeeklyBriefItems(weeklyBrief)
  });

  renderArticleList(document.querySelector("#home-latest-list"), latest.slice(0, 3), {
    compact: true,
    emptyTitle: "暂无最新文献"
  });
  renderArticleList(document.querySelector("#home-high-list"), highImpact.slice(0, 3), {
    compact: true,
    emptyTitle: "暂无重点研究"
  });
  renderWeeklyBrief(document.querySelector("#home-weekly-brief"), weeklyBrief, { compact: true });
  renderTopicDirectory(document.querySelector("#home-topics"), directions);
}

function renderTopicDirectory(container, data) {
  if (!container) return;
  const directions = Array.isArray(data?.directions) ? data.directions : [];
  if (!directions.length) {
    renderEmpty(container, "专题文献正在准备", "完成下一次数据同步后，将显示各研究方向的文献。"
    );
    return;
  }
  const prefix = window.location.pathname.includes("/pages/") ? "" : "pages/";
  container.innerHTML = directions.map((direction) => `
    <article class="topic-entry">
      <a class="topic-entry-link" href="${prefix}research.html?topic=${encodeURIComponent(direction.id)}">
        <div class="topic-entry-top">${renderIcon(direction.icon || "book-open")}<span>${escapeHtml(direction.lookbackDays || 30)} 天 · ${escapeHtml(formatNumber(direction.count))} 篇</span>${renderIcon("arrow-up-right")}</div>
        <h3>${escapeHtml(direction.title)}</h3>
        <p>${escapeHtml(direction.description || "")}</p>
        <small class="${statusClass(direction.status)}">${escapeHtml(statusLabel(direction.status))}</small><small>${direction.lastSuccessfulUpdate ? ` · ${escapeHtml(formatDateTime(direction.lastSuccessfulUpdate))}` : " · 暂无成功同步记录"}</small>
      </a>
    </article>`).join("");
}

function renderHomeStatus(container, status, counts) {
  if (!container) return;

  const source = (patterns) => findStatusSource(status, patterns);
  const pubmedSource = source(["PubMed"]);
  const trialSource = source(["ClinicalTrials.gov"]);
  const guidelineDeviceSource = source(["Guidelines and device regulatory"]);
  const safetySource = source(["Safety"]);
  const weeklySource = source(["Weekly Brief"]);

  const cards = [
    {
      label: "PubMed",
      source: pubmedSource,
      count: sourceCount(pubmedSource, counts.pubmed),
      time: status.pubmed?.lastSuccessfulUpdate || pubmedSource?.lastSuccessfulUpdate || pubmedSource?.finishedAt || status.lastUpdated
    },
    {
      label: "ClinicalTrials.gov",
      source: trialSource,
      count: sourceCount(trialSource, counts.clinicalTrials),
      time: trialSource?.finishedAt || status.lastUpdated
    },
    {
      label: "Guidelines",
      source: guidelineDeviceSource,
      count: counts.guidelines,
      time: guidelineDeviceSource?.finishedAt || status.lastUpdated,
      emptyText: "待人工维护"
    },
    {
      label: "Devices / Regulatory",
      source: guidelineDeviceSource,
      count: counts.devices,
      time: guidelineDeviceSource?.finishedAt || status.lastUpdated,
      emptyText: "待人工维护"
    },
    {
      label: "Safety",
      source: safetySource,
      count: sourceCount(safetySource, counts.safety),
      time: safetySource?.finishedAt || status.lastUpdated
    },
    {
      label: "Weekly Brief",
      source: weeklySource,
      count: sourceCount(weeklySource, counts.weeklyBrief),
      time: weeklySource?.finishedAt || status.lastUpdated
    }
  ];

  container.innerHTML = cards.map(renderHomeStatusCard).join("");
}

function renderHomeStatusCard(card) {
  const status = card.source?.status || (card.count > 0 ? "success" : "not_run");
  const countText = card.count > 0 ? String(card.count) : card.emptyText || "暂无数据";
  const updatedText = card.time ? formatDateTime(card.time) : "暂无更新时间";

  return `
    <article class="home-source-card">
      <div>
        <strong>${escapeHtml(card.label)}</strong>
        <span>${escapeHtml(countText)}</span>
      </div>
      <p><span class="${statusClass(status)}">${escapeHtml(statusLabel(status))}</span> · ${escapeHtml(updatedText)}</p>
    </article>
  `;
}

function renderPubMedSync(status) {
  const meta = status?.pubmed || {};
  const source = findStatusSource(status, ["PubMed"]);
  if (!source) return "暂无文献同步记录";
  if (source.status !== "success") {
    return `<span class="status-warning">本次 PubMed 未刷新</span><span>保留上次数据 ${escapeHtml(formatNumber(source.count || 0))} 篇</span><span>上次成功：${escapeHtml(formatDateTime(meta.lastSuccessfulUpdate))}</span>`;
  }
  if (!meta.retrieval?.complete) return `<span>当前收录 ${escapeHtml(formatNumber(source.count || 0))} 篇；等待下一次完整同步。</span>`;
  const result = `<strong>PubMed 近 ${escapeHtml(String(meta.lookbackDays || 7))} 天</strong><span>命中 ${escapeHtml(formatNumber(meta.retrieval.matchedCount))} / 入库 ${escapeHtml(formatNumber(meta.retrieval.fetchedCount))} 篇</span>`;
  const changes = meta.changes;
  if (!changes?.comparable) return `${result}<span>本次已建立完整基线，下次起显示新增与变更</span>`;
  return `${result}<span class="update-counts"><span>本次新入库 <strong>${escapeHtml(formatNumber(changes.added))}</strong></span><span>内容变更 <strong>${escapeHtml(formatNumber(changes.updated))}</strong></span><span>移出窗口 ${escapeHtml(formatNumber(changes.removedFromWindow))}</span></span>`;
}

function findStatusSource(status, patterns) {
  const sources = Array.isArray(status?.sources) ? status.sources : [];
  return sources.find((source) =>
    patterns.some((pattern) => String(source.name || "").toLowerCase().includes(pattern.toLowerCase()))
  );
}

function sourceCount(source, fallback) {
  if (typeof source?.count === "number") return source.count;
  return typeof fallback === "number" ? fallback : 0;
}

async function initResearchPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedDataset = params.get("dataset");
  const requestedTopic = params.get("topic");
  let direction = null;
  if (requestedTopic) {
    const directory = await loadJson(DATA_FILES.researchDirections, {});
    direction = (directory.directions || []).find((item) => item.id === requestedTopic);
    if (!direction) {
      setText("#research-page-title", "专题暂未就绪");
      renderEmpty(document.querySelector("#research-list"), "暂无此专题数据", "请从课题组专题目录选择研究方向，或等待下一次同步。");
      return;
    }
  }
  const bodyDataset = document.body.dataset.dataset || "latest-research";
  const datasetKey = requestedDataset === "high-impact" ? "high-impact-research" : bodyDataset;
  const title = direction?.title || (datasetKey === "high-impact-research" ? "重点研究" : datasetKey === "china-research" ? "中国研究" : "最新文献");
  setText("#research-page-title", title);

  if (direction) {
    setText(".page-title .eyebrow", "Research Group / 课题组专题");
    setText(".page-title p:not(.eyebrow)", direction.description);
    const titleElement = document.querySelector("#research-page-title");
    if (titleElement) document.title = `${direction.title} | 血管外科情报中枢`;
  }
  const fileName = direction?.fileName || `${datasetKey}.json`;
  const [articles, status] = await Promise.all([loadJson(fileName), loadJson(DATA_FILES.updateStatus, {})]);
  const list = document.querySelector("#research-list");
  const meta = document.querySelector("#result-meta");
  const state = {
    articles,
    page: 1,
    pageSize: 20,
    query: "",
    topic: "",
    studyType: "",
    relevance: "",
    chinaOnly: document.body.dataset.forceChina === "true"
  };
  const pager = createPagination(list);
  const windowNote = document.createElement("p");
  windowNote.className = "research-window-note";
  windowNote.textContent = `近 ${direction?.lookbackDays || status.pubmed?.lookbackDays || 7} 天按 PubMed 记录更新日期纳入；下方日期为论文发表日期。${direction ? "优先展示专题匹配度较高的研究，包含动物、体外与跨学科证据。" : ""}`;
  document.querySelector(".page-title")?.append(windowNote);
  if (direction) {
    const freshness = document.createElement("p");
    freshness.className = "research-window-note";
    freshness.textContent = direction.status === "success"
      ? `最近同步：${formatDateTime(direction.lastSuccessfulUpdate)} · 实际命中 ${formatNumber(direction.matchedCount)} 篇，完整入库 ${formatNumber(direction.count)} 篇。`
      : `本次未刷新，保留上次数据。${direction.error || ""}`;
    document.querySelector(".page-title")?.append(freshness);
  }

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
    const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * state.pageSize;
    if (meta) {
      meta.textContent = `共 ${formatNumber(articles.length)} 篇 · 匹配 ${formatNumber(filtered.length)} 篇 · 当前 ${filtered.length ? start + 1 : 0}–${Math.min(start + state.pageSize, filtered.length)}`;
    }
    renderArticleList(list, filtered.slice(start, start + state.pageSize), {
      emptyTitle: "暂无匹配文献",
      emptyText: "可以调整关键词或筛选条件。"
    });
    renderPagination(pager, state, pageCount, filtered.length, (page, pageSize) => {
      state.page = page;
      state.pageSize = pageSize;
      render();
      meta?.scrollIntoView({ block: "start" });
    });
  };

  searchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.page = 1;
    render();
  });
  topicFilter?.addEventListener("change", (event) => {
    state.topic = event.target.value;
    state.page = 1;
    render();
  });
  studyTypeFilter?.addEventListener("change", (event) => {
    state.studyType = event.target.value;
    state.page = 1;
    render();
  });
  relevanceFilter?.addEventListener("change", (event) => {
    state.relevance = event.target.value;
    state.page = 1;
    render();
  });
  chinaFilter?.addEventListener("change", (event) => {
    state.chinaOnly = event.target.checked;
    state.page = 1;
    render();
  });

  render();
}

async function initTrialsPage() {
  const trials = await loadJson(DATA_FILES.clinicalTrials);
  const list = document.querySelector("#trial-list");
  const meta = document.querySelector("#result-meta");
  const searchInput = document.querySelector("#search-input");
  const state = { page: 1, pageSize: 20 };
  const pager = createPagination(list);

  const render = () => {
    const query = searchInput?.value.trim().toLowerCase() || "";
    const filtered = trials.filter((trial) => trialMatchesQuery(trial, query));
    const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * state.pageSize;
    if (meta) {
      meta.textContent = `共 ${formatNumber(trials.length)} 项试验 · 匹配 ${formatNumber(filtered.length)} 项 · 当前 ${filtered.length ? start + 1 : 0}–${Math.min(start + state.pageSize, filtered.length)}`;
    }
    renderTrialList(list, filtered.slice(start, start + state.pageSize));
    renderPagination(pager, state, pageCount, filtered.length, (page, pageSize) => {
      state.page = page;
      state.pageSize = pageSize;
      render();
      meta?.scrollIntoView({ block: "start" });
    });
  };

  searchInput?.addEventListener("input", () => { state.page = 1; render(); });
  render();
}

function createPagination(list) {
  const pager = document.createElement("nav");
  pager.className = "pagination";
  pager.setAttribute("aria-label", "结果分页");
  list?.after(pager);
  return pager;
}

function renderPagination(container, state, pageCount, total, onChange) {
  container.innerHTML = `
    <label class="page-size">每页 <select aria-label="每页条数">${[20, 50, 100].map((size) => `<option value="${size}"${state.pageSize === size ? " selected" : ""}>${size}</option>`).join("")}</select><span>共 ${escapeHtml(formatNumber(total))} 条</span></label>
    <div class="page-controls">
      <button type="button" data-direction="previous" aria-label="上一页" title="上一页"${state.page <= 1 ? " disabled" : ""}>${renderIcon("chevron-left")}</button>
      <span>第 ${state.page} / ${pageCount} 页</span>
      <button type="button" data-direction="next" aria-label="下一页" title="下一页"${state.page >= pageCount ? " disabled" : ""}>${renderIcon("chevron-right")}</button>
    </div>`;
  container.querySelector("select").addEventListener("change", (event) => onChange(1, Number(event.target.value)));
  container.querySelector("[data-direction='previous']").addEventListener("click", () => onChange(state.page - 1, state.pageSize));
  container.querySelector("[data-direction='next']").addEventListener("click", () => onChange(state.page + 1, state.pageSize));
}

function renderIcon(name) {
  const prefix = window.location.pathname.includes("/pages/") ? "../" : "";
  return `<svg class="icon" aria-hidden="true"><use href="${prefix}assets/icons.svg#${name}"></use></svg>`;
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
  const abstract = article.abstract || article.englishSummary;
  const englishSummary = abstract && !options.compact ? `<details class="article-abstract"><summary>查看原文摘要</summary><p class="english-summary">${escapeHtml(abstract)}</p></details>` : "";
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
  if (!brief || typeof brief !== "object" || !Array.isArray(brief.priorityReading)) {
    renderEmpty(container, "暂无每周精选", "运行 npm run update 后会基于 PubMed 和 ClinicalTrials.gov 数据生成周报。");
    return;
  }

  const priority = brief.priorityReading || [];
  const china = brief.chinaHighlights || [];
  const trials = brief.trialHighlights || brief.clinicalTrials || [];
  const review = brief.manualReview || brief.reviewQueue || [];
  const trends = brief.topicTrends || [];
  const counts = brief.counts || {};

  if (!priority.length && !china.length && !trials.length && !review.length && !trends.length) {
    renderEmpty(container, "暂无每周精选", "当前没有可用于生成周报的文献、临床试验或复核提醒。");
    return;
  }

  const maxTrend = Math.max(...trends.map((item) => item.count), 1);
  const compact = options.compact;
  if (compact) {
    container.innerHTML = `
      <div class="weekly-digest-meta"><p>精选 ${priority.length} 篇文献 · ${china.length} 篇中国研究 · ${trials.length} 项试验</p><span>${escapeHtml(formatBriefPeriod(brief.period))}</span></div>
      <div class="brief-grid">
        <section class="brief-card"><div class="section-heading tight"><h3>优先阅读</h3></div>${renderBriefSection(priority.slice(0, 1), "暂无重点文献", "等待下一次数据更新。")}</section>
        <section class="brief-card"><div class="section-heading tight"><h3>试验追踪</h3></div>${renderBriefSection(trials.slice(0, 1), "暂无重点试验", "等待下一次数据更新。")}</section>
      </div>`;
    return;
  }
  const priorityLimit = compact ? 3 : 10;
  const trialLimit = compact ? 2 : 10;

  container.innerHTML = `
    <div class="brief-summary">
      <div>
        <span>周期</span>
        <strong>${escapeHtml(formatBriefPeriod(brief.period))}</strong>
      </div>
      <div>
        <span>重点文献</span>
        <strong>${escapeHtml(String(priority.length))}</strong>
      </div>
      <div>
        <span>临床试验</span>
        <strong>${escapeHtml(String(trials.length))}</strong>
      </div>
      <div>
        <span>简报条目</span>
        <strong>${escapeHtml(String(counts.totalBriefItems ?? priority.length + china.length + trials.length + review.length))}</strong>
      </div>
    </div>
    <article class="brief-overview">
      <strong>本周重点速览</strong>
      <p>${escapeHtml(brief.overviewZh || "规则生成的血管外科情报简报。")}</p>
      <span>数据更新时间：${escapeHtml(formatDateTime(brief.dataUpdatedAt || brief.generatedAt))}</span>
    </article>
    <div class="brief-grid">
      <section class="brief-card">
        <div class="section-heading tight">
          <p class="eyebrow">Priority Research</p>
          <h3>重点文献</h3>
        </div>
        ${renderBriefSection(priority.slice(0, priorityLimit), "暂无重点文献", "当前没有符合优先级规则的 PubMed 文献。")}
      </section>
      <section class="brief-card">
        <div class="section-heading tight">
          <p class="eyebrow">Trial Watch</p>
          <h3>临床试验</h3>
        </div>
        ${renderBriefSection(trials.slice(0, trialLimit), "暂无重点临床试验", "当前没有可进入周报的招募中或进行中试验。")}
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
              ${renderBriefSection(china, "暂无中国研究", "当前没有符合优先级规则的中国机构研究。")}
            </section>
            <section class="brief-card">
              <div class="section-heading tight">
                <p class="eyebrow">Manual Review</p>
                <h3>待人工复核</h3>
              </div>
              ${renderBriefSection(review, "暂无待复核提醒", "当前没有指南、器械、安全性或热点复核提醒。")}
            </section>
            <section class="brief-card">
              <div class="section-heading tight">
                <p class="eyebrow">Topic Trends</p>
                <h3>主题趋势</h3>
              </div>
              ${renderTopicTrends(trends, maxTrend)}
            </section>
            <section class="brief-card">
              <div class="section-heading tight">
                <p class="eyebrow">Source Status</p>
                <h3>数据源更新时间</h3>
              </div>
              ${renderBriefSourceUpdates(brief.sourceUpdates || [])}
            </section>
          `
      }
    </div>
  `;
}

function renderBriefSection(items, emptyTitle, emptyText) {
  if (!items.length) {
    return `<div class="empty-inline"><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyText)}</span></div>`;
  }

  return `<div class="brief-item-list">${items.map(renderBriefItem).join("")}</div>`;
}

function renderBriefItem(item) {
  const url = item.url || item.pubmedUrl || (item.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/` : "");
  const tags = item.topicTags || [];
  const date = item.date || item.publicationDate || item.lastUpdatePostDate || "";

  return `
    <article class="brief-item">
      <div class="card-topline">
        <span>${escapeHtml(item.source || item.journal || "Source pending")}</span>
        <span>${escapeHtml(formatDate(date))}</span>
      </div>
      <h4>${url ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener">${escapeHtml(item.title || "Untitled item")}</a>` : escapeHtml(item.title || "Untitled item")}</h4>
      <p class="brief-reason">${escapeHtml(item.reason || item.summaryZh || "入选理由待补充。")}</p>
      <div class="tag-row">
        ${tags.slice(0, 6).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderBriefSourceUpdates(sources) {
  if (!sources.length) {
    return `<div class="empty-inline"><strong>暂无数据源状态</strong><span>运行更新脚本后会显示来源更新时间。</span></div>`;
  }

  return `
    <div class="brief-source-list">
      ${sources
        .map(
          (source) => `
            <div>
              <strong>${escapeHtml(source.name || "Unknown source")}</strong>
              <span>${escapeHtml(source.status || "unknown")} · ${escapeHtml(String(source.count ?? 0))} · ${escapeHtml(formatDateTime(source.updatedAt))}</span>
            </div>
          `
        )
        .join("")}
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
    <section class="pubmed-detail" aria-label="PubMed 完整性与更新统计">
      <strong>PubMed 完整性与更新统计</strong>
      <div class="update-strip">${renderPubMedSync(status)}</div>
      <p>最后成功同步：${escapeHtml(formatDateTime(status.pubmed?.lastSuccessfulUpdate))}</p>
      <p>${escapeHtml(status.pubmed?.changes?.note || "新入库和内容变更按相邻两次完整同步比较，近 7 天总数并非每日新增数。")}</p>
    </section>
    <div class="status-grid">
      ${sources
        .map(
          (source) => `
            <article class="status-card">
              <strong>${escapeHtml(source.name || "Unknown source")}</strong>
              <span class="${statusClass(source.status)}">${escapeHtml(source.status || "unknown")}</span>
              <p>抓取数量：${escapeHtml(String(source.count ?? 0))}</p>
              <p>更新时间：${escapeHtml(formatDateTime(source.finishedAt || source.dataTimestamp || status.lastUpdated))}</p>
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

function countWeeklyBriefItems(brief) {
  if (!brief || typeof brief !== "object") return 0;
  if (typeof brief.counts?.totalBriefItems === "number") return brief.counts.totalBriefItems;
  return (
    (brief.priorityReading || []).length +
    (brief.chinaHighlights || []).length +
    (brief.trialHighlights || brief.clinicalTrials || []).length +
    (brief.manualReview || brief.reviewQueue || []).length
  );
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

function statusLabel(status) {
  return { success: "已更新", skipped: "已跳过", not_run: "待维护", error: "更新失败" }[status] || status || "暂无状态";
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
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
    timeZone: "Asia/Shanghai",
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
