const headings = {
  BACKGROUND: "研究背景", "BACKGROUND AND PURPOSE": "背景与目的", "BACKGROUND AND AIMS": "背景与目的", "BACKGROUND/OBJECTIVES": "背景与目的", INTRODUCTION: "研究背景",
  OBJECTIVE: "研究目的", OBJECTIVES: "研究目的", PURPOSE: "研究目的", AIM: "研究目的", AIMS: "研究目的",
  METHODS: "研究方法", "MATERIALS AND METHODS": "研究方法", "PATIENTS AND METHODS": "研究方法", "METHODS AND RESULTS": "方法与结果", DESIGN: "研究设计",
  RESULTS: "研究结果", FINDINGS: "研究结果", CONCLUSION: "研究结论", CONCLUSIONS: "研究结论", INTERPRETATION: "结果解读",
  LIMITATIONS: "研究局限", FUNDING: "资金来源", "TRIAL REGISTRATION": "试验登记"
};

export function normalizeAbstract(value) {
  return String(value || "").replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
    const number = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : " ";
  }).replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }[entity])).replace(/\s+/g, " ").trim();
}

export function getAbstractSections(article = {}) {
  const value = normalizeAbstract(article?.abstract || article?.englishSummary);
  if (!value) return [];
  const pattern = new RegExp(`\\b(${Object.keys(headings).sort((a, b) => b.length - a.length).join("|")}):\\s*`, "gi");
  const markers = [...value.matchAll(pattern)];
  if (!markers.length) return [{ heading: "摘要原文", text: value }];
  const result = [];
  if (markers[0].index) result.push({ heading: "摘要原文", text: value.slice(0, markers[0].index).trim() });
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const text = value.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? value.length).trim();
    if (text) result.push({ heading: headings[marker[1].toUpperCase()], text });
  }
  return result.length ? result : [{ heading: "摘要原文", text: value }];
}

export function resolveDetailedAbstract(article = {}, registry = {}) {
  const record = registry.records?.[article?.pmid];
  if (!record || !article?.abstract || !Array.isArray(record.sections) || record.sections.length !== 4) return null;
  if (normalizeAbstract(record.sourceTitle) !== normalizeAbstract(article.title) || normalizeAbstract(record.sourceAbstract) !== normalizeAbstract(article.abstract)) return null;
  if (record.sections.some((section) => typeof section.heading !== "string" || !section.heading.trim() || typeof section.text !== "string" || !section.text.trim())) return null;
  return record;
}
