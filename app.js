const DATA_FILES = {
  latestResearch: "latest-research.json",
  highImpactResearch: "high-impact-research.json",
  chinaResearch: "china-research.json",
  clinicalTrials: "clinical-trials.json",
  guidelines: "guidelines.json",
  deviceRegulatory: "device-regulatory.json",
  safety: "safety.json",
  researchDirections: "research-directions.json",
  readingDigest: "reading-digest.json",
  readingCandidates: "reading-candidates.json",
  journalMetrics: "journal-metrics.json",
  weeklyBrief: "weekly-brief.json",
  updateStatus: "update-status.json"
};

let journalRegistry = {};
let resolveJournalMetrics = () => ({ impactFactor: null, cas: null });

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
  if (["home", "research", "topics", "weekly"].includes(page)) {
    journalRegistry = await loadJson(DATA_FILES.journalMetrics, {});
    const metricsModule = await import("./lib/journal-metrics.js?v=20261101-jcr");
    const cache = new Map();
    resolveJournalMetrics = (article) => {
      const key = `${article.journal || ""}|${(article.journalIssns || []).join(",")}`;
      if (!cache.has(key)) cache.set(key, metricsModule.resolveJournalMetrics(article, journalRegistry));
      return cache.get(key);
    };
  }
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
    const [directions, digest] = await Promise.all([loadJson(DATA_FILES.researchDirections, {}), loadJson(DATA_FILES.readingDigest, {})]);
    renderTopicDirectory(document.querySelector("#topic-directory"), directions, digest);
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
  const [weeklyBrief, status, directions, digest] = await Promise.all([
    loadJson(DATA_FILES.weeklyBrief, {}),
    loadJson(DATA_FILES.updateStatus, {}),
    loadJson(DATA_FILES.researchDirections, {}),
    loadJson(DATA_FILES.readingDigest, {})
  ]);
  const briefCounts = weeklyBrief.counts || {};
  const latestCount = status.pubmed?.counts?.total ?? findStatusSource(status, ["PubMed"])?.count ?? briefCounts.latestResearch ?? 0;
  const chinaCount = status.pubmed?.chinaResearchCount ?? status.pubmed?.counts?.china ?? briefCounts.chinaResearch ?? 0;
  const trialSource = findStatusSource(status, ["ClinicalTrials.gov"]);
  const trialCount = trialSource?.count ?? briefCounts.clinicalTrials ?? 0;
  const derived = findStatusSource(status, ["Guidelines and device regulatory"])?.counts || {};
  setText("[data-stat='latestCount']", formatNumber(latestCount));
  setText("[data-stat='highImpactCount']", formatNumber(digest.groups?.find((group) => group.id === "vascular")?.periods?.[30]?.stats?.eligible || 0));
  setText("[data-stat='chinaCount']", formatNumber(chinaCount));
  setText("[data-stat='activeTrialCount']", formatNumber(trialSource?.activeCount ?? trialCount));

  const updated = status.lastUpdated ? formatDateTime(status.lastUpdated) : "等待数据";
  setText("#home-updated", updated);
  const updateStrip = document.querySelector("#home-pubmed-update");
  if (updateStrip) updateStrip.innerHTML = renderPubMedSync(status);
  renderHomeStatus(document.querySelector("#home-status-panel"), status, {
    pubmed: latestCount,
    clinicalTrials: trialCount,
    guidelines: derived.guidelines ?? briefCounts.guidelines ?? 0,
    devices: derived.devices ?? briefCounts.devices ?? 0,
    safety: findStatusSource(status, ["Safety"])?.count ?? briefCounts.safety ?? 0,
    weeklyBrief: countWeeklyBriefItems(weeklyBrief)
  });

  renderReadingDigest(document.querySelector("#home-reading-digest"), digest);
  initHomeReadingViews(digest, directions);
  renderWeeklyBrief(document.querySelector("#home-weekly-brief"), weeklyBrief, { compact: true });
  renderTopicDirectory(document.querySelector("#home-topics"), directions, digest);
}

function initHomeReadingViews(digest, directions) {
  const tabs = [...document.querySelectorAll("[data-reading-view]")];
  const selectedPanel = document.querySelector("#home-reading-digest");
  const fullPanel = document.querySelector("#home-full-library");
  let fullPromise;
  const show = async (view) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.readingView === view;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    selectedPanel.hidden = view !== "selected";
    fullPanel.hidden = view !== "all";
    if (view === "all" && !fullPromise) {
      fullPanel.innerHTML = '<p class="status-loading">正在加载完整文献库...</p>';
      fullPromise = initHomeLibrary(fullPanel, digest, directions).catch(() => renderEmpty(fullPanel, "文献库暂时无法加载", "请稍后刷新；精选速览仍可查阅。"));
    }
    if (view === "all") await fullPromise;
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => show(tab.dataset.readingView));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      show(tabs[next].dataset.readingView);
    });
  });
}

async function initHomeLibrary(container, digest, directions) {
  const definitions = digest.groups?.length ? digest.groups : [{ id: "vascular", title: "血管外科", fileName: DATA_FILES.latestResearch }, ...(directions.directions || [])];
  const results = await Promise.all(definitions.map((group) => loadJson(group.fileName)));
  const candidates = await loadJson(DATA_FILES.readingCandidates, {});
  const buckets = definitions.map((group, index) => {
    const recent = candidates.sources?.find((source) => source.id === group.id)?.articles || [];
    return { ...group, articles: [...new Map([...results[index], ...recent].filter((article) => article?.pmid).map((article) => [article.pmid, article])).values()] };
  });
  const merged = new Map();
  for (const group of buckets) {
    for (const article of group.articles) {
      const old = merged.get(article.pmid);
      const levels = { high: 4, medium: 3, low: 2, review: 1 };
      const preferred = !old || levels[getRelevance(article)] > levels[getRelevance(old)] ? article : old;
      merged.set(article.pmid, { ...preferred, matchedDirections: [...new Set([...(old?.matchedDirections || []), group.title])] });
    }
  }
  const all = [...merged.values()];
  const state = { articles: all, page: 1, pageSize: 20, query: "", topic: "", studyType: "", relevance: "", jcr: "", chinaOnly: false, publicationDays: 30, hideReviews: false, sort: "date" };
  container.innerHTML = `
    <div class="reading-heading"><div><p class="eyebrow">Research Library</p><h2>全部文献</h2><p class="reading-caption">血管外科与课题组专题 · PMID 去重 ${formatNumber(all.length)} 篇</p></div></div>
    <section class="toolbar home-library-toolbar" aria-label="首页完整文献筛选">
      <label class="search-field"><span>搜索</span><input id="home-library-search" type="search" placeholder="标题、摘要、期刊、作者" autocomplete="off"></label>
      <label><span>研究方向</span><select id="home-library-scope"><option value="all">全部方向</option>${buckets.map((group) => `<option value="${escapeAttribute(group.id)}">${escapeHtml(group.title)}</option>`).join("")}</select></label>
      <label><span>发表时间</span><select id="home-library-days"><option value="30">近30天</option><option value="7">近7天</option><option value="0">全部发表日期</option></select></label>
    </section>
    <details class="library-advanced"><summary>更多筛选</summary><section class="toolbar home-library-advanced" aria-label="文献高级筛选">
      <label><span>主题</span><select id="home-library-topic"></select></label>
      <label><span>研究类型</span><select id="home-library-type"></select></label>
      <label><span>相关性</span><select id="home-library-relevance"><option value="">全部相关性</option><option value="high">高相关</option><option value="medium">中相关</option><option value="low">低相关</option><option value="review">待复核</option></select></label>
      <label><span>JCR 分区</span><select id="home-library-jcr"><option value="">全部期刊</option><option value="Q1">JCR Q1</option><option value="pending">分区 / IF 待核实</option></select></label>
      <label><span>排序</span><select id="home-library-sort"><option value="date">发表日期从新到旧</option><option value="impact">影响因子从高到低</option><option value="relevance">相关性优先</option></select></label>
      <label class="check-row"><input id="home-library-china" type="checkbox"><span>仅中国研究</span></label>
      <label class="check-row"><input id="home-library-reviews" type="checkbox"><span>隐藏综述</span></label>
    </section></details>
    <p class="research-window-note">完整结果包含血管外科与专题记录更新窗口及近期发表补检；上方“发表时间”按论文日期筛选。相关性为各方向的自动匹配分级，不代表证据质量。</p>
    <div class="result-meta" id="home-library-meta" aria-live="polite"></div><div class="item-list" id="home-library-list"></div>`;
  const list = container.querySelector("#home-library-list");
  const meta = container.querySelector("#home-library-meta");
  const pager = createPagination(list);
  const updateOptions = () => {
    populateSelect("#home-library-topic", collectTopicTags(state.articles), "全部主题");
    populateSelect("#home-library-type", collectStudyTypeTags(state.articles), "全部类型");
  };
  updateOptions();
  const render = () => {
    const filtered = filterArticles(state).sort((a, b) => state.sort === "impact"
      ? (resolveJournalMetrics(b).impactFactor?.value ?? -1) - (resolveJournalMetrics(a).impactFactor?.value ?? -1) || String(b.publicationDate).localeCompare(String(a.publicationDate))
      : state.sort === "relevance" ? ({ high: 4, medium: 3, low: 2, review: 1 }[getRelevance(b)] || 0) - ({ high: 4, medium: 3, low: 2, review: 1 }[getRelevance(a)] || 0) || String(b.publicationDate).localeCompare(String(a.publicationDate))
      : String(b.publicationDate).localeCompare(String(a.publicationDate)));
    const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * state.pageSize;
    meta.textContent = `当前方向 ${formatNumber(state.articles.length)} 篇 · 筛选匹配 ${formatNumber(filtered.length)} 篇 · 显示 ${filtered.length ? start + 1 : 0}–${Math.min(start + state.pageSize, filtered.length)}`;
    renderArticleList(list, filtered.slice(start, start + state.pageSize), { emptyTitle: "暂无匹配文献", emptyText: "可以调整研究方向、发表时间或其他筛选条件。" });
    renderPagination(pager, state, pageCount, filtered.length, (page, pageSize) => { state.page = page; state.pageSize = pageSize; render(); meta.scrollIntoView({ block: "start" }); });
  };
  const bind = (id, key, transform = (value) => value) => container.querySelector(id).addEventListener("change", (event) => { state[key] = transform(event.target.type === "checkbox" ? event.target.checked : event.target.value); state.page = 1; render(); });
  container.querySelector("#home-library-search").addEventListener("input", (event) => { state.query = event.target.value.trim().toLowerCase(); state.page = 1; render(); });
  container.querySelector("#home-library-scope").addEventListener("change", (event) => { state.articles = event.target.value === "all" ? all : buckets.find((group) => group.id === event.target.value)?.articles || []; state.topic = ""; state.studyType = ""; state.page = 1; updateOptions(); render(); });
  bind("#home-library-days", "publicationDays", Number);
  bind("#home-library-topic", "topic"); bind("#home-library-type", "studyType"); bind("#home-library-relevance", "relevance"); bind("#home-library-jcr", "jcr"); bind("#home-library-sort", "sort"); bind("#home-library-china", "chinaOnly"); bind("#home-library-reviews", "hideReviews");
  render();
}

function renderTopicDirectory(container, data, digest = {}) {
  if (!container) return;
  const directions = Array.isArray(data?.directions) ? data.directions : [];
  if (!directions.length) {
    renderEmpty(container, "专题文献正在准备", "完成下一次数据同步后，将显示各研究方向的文献。"
    );
    return;
  }
  const prefix = window.location.pathname.includes("/pages/") ? "" : "pages/";
  container.innerHTML = directions.map((direction) => {
    const group = (digest.groups || []).find((item) => item.id === direction.id);
    const selected = group?.periods?.[30]?.articles || [];
    const href = `${prefix}research.html?topic=${encodeURIComponent(direction.id)}`;
    return `
    <article class="topic-entry">
      <a class="topic-entry-link" href="${href}">
        <div class="topic-entry-top">${renderIcon(direction.icon || "book-open")}<span>30 天 · JCR Q1 精选 ${selected.length} 篇</span>${renderIcon("arrow-up-right")}</div>
        <h3>${escapeHtml(direction.title)}</h3>
        <p>${escapeHtml(direction.description || "")}</p>
        <small>${selected.length ? "近期发表 · 高相关 · 原始研究优先" : "暂无满足严格条件的精选，不用旧文凑数"}</small>
      </a>
      <div class="topic-library-link"><a href="${href}&view=all">完整检索 ${escapeHtml(formatNumber(direction.count))} 篇 ${renderIcon("arrow-up-right")}</a></div>
    </article>`;
  }).join("");
}

function renderJournalMetrics(article) {
  const { impactFactor: impact, jcr } = resolveJournalMetrics(article, journalRegistry);
  return `<span class="journal-metrics">${impact
    ? `<a href="${escapeAttribute(impact.sourceUrl)}" target="_blank" rel="noopener" title="${escapeAttribute(impact.sourceLabel)}">IF ${escapeHtml(impact.value.toFixed(1))} <small>(${impact.year})</small></a>`
    : `<span class="metric-pending">IF 待核实</span>`}
    ${jcr ? `<a class="jcr-zone${jcr.quartile === "Q1" ? " jcr-one" : ""}" href="${escapeAttribute(jcr.sourceUrl)}" target="_blank" rel="noopener" title="${escapeAttribute(jcr.sourceLabel)}">JCR ${escapeHtml(jcr.quartile)} <small>(${jcr.year})</small></a>` : `<span class="metric-pending">JCR 分区待核实</span>`}</span>`;
}

function renderReadingDigest(container, digest, options = {}) {
  if (!container) return;
  if (!Array.isArray(digest.groups) || !digest.groups.length) {
    renderEmpty(container, "精选暂未生成", "完整检索结果仍可查阅；待期刊分区、影响因子与发表日期核实后纳入精选。");
    return;
  }
  let days = Number(new URLSearchParams(window.location.search).get("days")) === 7 ? 7 : 30;
  let groupId = options.groupId || "all";
  let visibleLimit = digest.defaultVisibleItems || 10;
  const render = () => {
    const group = digest.groups.find((item) => item.id === groupId);
    const section = (group || digest).periods?.[days] || {};
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
    const available = (options.chinaOnly ? section.chinaArticles || [] : section.articles || []).filter((article) => article.publicationDate >= cutoff && article.publicationDate <= today);
    const articles = available.slice(0, visibleLimit);
    container.innerHTML = `
      <div class="reading-heading">
        <div><p class="eyebrow">Essential Reading</p><h2>JCR Q1 论文速览</h2><p class="reading-caption">近 ${days} 天发表 · 展示 ${articles.length} / ${available.length} 篇精选 · 原始研究优先</p></div>
        <div class="reading-controls">
          ${!options.groupId ? `<label class="reading-scope"><span class="sr-only">研究方向</span><select aria-label="研究方向" data-reading-scope><option value="all">全部方向</option>${digest.groups.map((item) => `<option value="${escapeAttribute(item.id)}"${groupId === item.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></label>` : ""}
          <label class="reading-limit"><span class="sr-only">精选篇数</span><select aria-label="精选篇数" data-reading-limit>${(digest.visibleItemOptions || [5, 10, 20]).map((value) => `<option value="${value}"${visibleLimit === value ? " selected" : ""}>${value} 篇</option>`).join("")}</select></label>
          <fieldset class="segmented"><legend class="sr-only">发表时间</legend>${[7, 30].map((value) => `<label><input type="radio" name="${container.id}-window" value="${value}"${days === value ? " checked" : ""}><span>近 ${value} 天</span></label>`).join("")}</fieldset>
        </div>
      </div>
      <p class="reading-provenance">JCR ${escapeHtml(digest.jcrYear || "已核实")} Q1 · IF 与分区均标明数据年份 · 精选生成 ${escapeHtml(formatDateTime(digest.generatedAt))}</p>
      ${group?.sourceStatus === "error" || (groupId === "all" && digest.errors?.length) ? `<p class="status-warning reading-note">近期检索未能完全刷新，以下为保留数据中仍符合日期的条目；详情见数据状态。</p>` : ""}
      ${articles.length ? `<ol class="reading-list">${articles.map((article, index) => `
        <li class="reading-item"><span class="reading-number">${String(index + 1).padStart(2, "0")}</span><div>
          <div class="reading-item-meta"><time>${escapeHtml(article.publicationDate)}</time><span>${escapeHtml(article.digestKind || "研究论文")}</span>${!options.groupId ? `<span>${escapeHtml(digest.groups.find((item) => item.id === article.digestGroup)?.title || "")}</span>` : ""}</div>
          <h3><a href="${escapeAttribute(article.pubmedUrl)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></h3>
          <div class="reading-journal"><strong>${escapeHtml(article.journal)}</strong>${renderJournalMetrics(article)}</div>
          <p class="reading-reason">入选理由：${escapeHtml(article.selectionReason || article.summaryZh || "高相关近期研究，建议回到原文复核。")}</p>
        </div><a class="reading-source" href="${escapeAttribute(article.pubmedUrl)}" target="_blank" rel="noopener" aria-label="打开 PubMed：${escapeAttribute(article.title)}" title="打开 PubMed">${renderIcon("arrow-up-right")}</a></li>`).join("")}</ol>`
        : `<div class="reading-empty"><strong>近 ${days} 天暂无满足条件的 JCR Q1 精选</strong><p>完整结果仍可查阅；未用旧文或低相关条目凑数。${section.stats?.metricsPending ? `有 ${section.stats.metricsPending} 篇高相关近期候选的期刊指标待核实。` : ""}</p></div>`}
      <details class="reading-method"><summary>筛选口径与覆盖范围</summary><p>${escapeHtml(digest.note || "")}</p><p>当前核对 ${escapeHtml(digest.metrics?.journalCount || 0)} 本期刊，其中 ${escapeHtml(digest.metrics?.verifiedJcrOneCount || 0)} 本在来源表中为 JCR Q1。指标缺失不代表非Q1；普通综述不入选，人工确认的优质综述每组最多1篇。影响因子是期刊指标，不是单篇论文质量评分。</p></details>`;
    container.querySelector("[data-reading-scope]")?.addEventListener("change", (event) => { groupId = event.target.value; render(); });
    container.querySelector("[data-reading-limit]")?.addEventListener("change", (event) => { visibleLimit = Number(event.target.value); render(); });
    container.querySelectorAll("input[type='radio']").forEach((input) => input.addEventListener("change", (event) => { days = Number(event.target.value); render(); }));
  };
  render();
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
  setText(".page-title h1", title);

  if (direction) {
    setText(".page-title .eyebrow", "Research Group / 课题组专题");
    setText(".page-title p:not(.eyebrow)", direction.description);
    const titleElement = document.querySelector("#research-page-title");
    if (titleElement) document.title = `${direction.title} | 血管外科情报中枢`;
  }
  const allResults = params.get("view") === "all";
  const viewNav = document.createElement("nav");
  viewNav.className = "research-view-nav";
  viewNav.setAttribute("aria-label", "文献视图");
  const briefParams = new URLSearchParams(params);
  briefParams.delete("view");
  const allParams = new URLSearchParams(params);
  allParams.set("view", "all");
  viewNav.innerHTML = `<a href="?${escapeAttribute(briefParams.toString())}"${!allResults ? ' aria-current="page"' : ""}>精选速览</a><a href="?${escapeAttribute(allParams.toString())}"${allResults ? ' aria-current="page"' : ""}>全部检索结果</a>`;
  document.querySelector(".page-title")?.after(viewNav);
  if (!allResults) {
    document.querySelector(".toolbar")?.setAttribute("hidden", "");
    document.querySelector("#result-meta")?.setAttribute("hidden", "");
    const panel = document.querySelector("#research-list");
    panel.className = "reading-digest-panel";
    const digest = await loadJson(DATA_FILES.readingDigest, {});
    renderReadingDigest(panel, digest, { groupId: direction?.id || "vascular", chinaOnly: document.body.dataset.forceChina === "true" });
    return;
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
    jcr: "",
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
  const jcrLabel = document.createElement("label");
  jcrLabel.innerHTML = `<span>JCR 分区 / 指标</span><select id="journal-filter"><option value="">全部期刊</option><option value="Q1">JCR ${escapeHtml(journalRegistry.jcrYear || "已核实")} Q1</option><option value="pending">指标待核实</option></select>`;
  document.querySelector(".toolbar")?.append(jcrLabel);
  document.querySelector("#journal-filter")?.addEventListener("change", (event) => { state.jcr = event.target.value; state.page = 1; render(); });

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
    const metrics = resolveJournalMetrics(article, journalRegistry);
    if (state.jcr === "Q1" && !(metrics.jcr?.quartile === "Q1" && metrics.jcr.year === journalRegistry.jcrYear)) return false;
    if (state.jcr === "pending" && metrics.jcr && metrics.impactFactor) return false;
    if (state.publicationDays) {
      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - (state.publicationDays - 1) * 86400000).toISOString().slice(0, 10);
      if (article.publicationDatePrecision !== "day" || article.publicationDate < cutoff || article.publicationDate > today) return false;
    }
    if (state.hideReviews && ((article.publicationTypes || []).some((type) => /review|meta.analysis/i.test(type)) || /\b(?:review|meta.analysis)\b/i.test(article.title || ""))) return false;
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
      <div class="article-journal-metrics">${renderJournalMetrics(article)}</div>
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
      ${item.journal ? `<div class="reading-journal"><strong>${escapeHtml(item.journal)}</strong>${renderJournalMetrics(item)}</div>` : ""}
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
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code) => {
      const point = code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
    })
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
