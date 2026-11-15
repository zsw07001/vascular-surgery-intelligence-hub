import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, writeJsonFile } from "./utils.mjs";
import { normalizeAbstract } from "../lib/abstract-content.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export function abstractSourceHash(article) {
  return createHash("sha256").update(`${normalizeAbstract(article.title)}\n${normalizeAbstract(article.abstract)}`).digest("hex");
}

export async function updateDetailedAbstracts(options = {}) {
  const dataDir = options.dataDir || join(rootDir, "data");
  const notes = await readJsonFile(join(dataDir, "abstract-notes.json"), { notes: {} });
  const digest = await readJsonFile(join(dataDir, "reading-digest.json"), {});
  const candidates = await readJsonFile(join(dataDir, "reading-candidates.json"), {});
  const articles = new Map();
  for (const file of new Set(["latest-research.json", ...((digest.groups || []).map((group) => group.fileName).filter(Boolean))])) {
    for (const article of await readJsonFile(join(dataDir, file), [])) if (article?.pmid) articles.set(article.pmid, article);
  }
  for (const source of candidates.sources || []) for (const article of source.articles || []) if (article?.pmid) articles.set(article.pmid, article);
  const selected = [...new Map((digest.groups || []).flatMap((group) => group.periods?.[30]?.articles || []).map((article) => [article.pmid, article])).values()];
  for (const article of selected) if (!articles.has(article.pmid)) articles.set(article.pmid, article);
  const records = {};
  const staleNotes = [];
  for (const [pmid, note] of Object.entries(notes.notes || {})) {
    const article = articles.get(pmid);
    if (!article?.abstract || !article.abstract.trim()) continue;
    if (note.sourceHash !== abstractSourceHash(article)) { staleNotes.push(pmid); continue; }
    const sections = ["objective", "methods", "results", "limitations"].map((key, index) => ({ heading: ["研究目的", "研究方法", "主要结果", "结论与局限"][index], text: note[key] }));
    if (sections.some((section) => typeof section.text !== "string" || !section.text.trim())) throw new Error(`中文详读 ${pmid} 缺少必要章节，保留上次数据。`);
    records[pmid] = { pmid, sourceTitle: article.title, sourceAbstract: article.abstract, sourceHash: note.sourceHash, sourceUrl: article.pubmedUrl, sections, preparedAt: note.preparedAt || notes.preparedAt, preparation: "AI辅助整理，未经医学审校", isVerbatimTranslation: false };
  }
  const pending = selected.filter((article) => !records[article.pmid]).map((article) => ({ pmid: article.pmid, title: article.title, reason: staleNotes.includes(article.pmid) ? "原文摘要已变化，中文稿待重新核对" : "中文详读待整理，保留完整英文摘要" }));
  const result = {
    generatedAt: new Date().toISOString(), records,
    counts: { available: Object.keys(records).length, selected: selected.length, readySelected: selected.length - pending.length, pendingSelected: pending.length },
    pending, staleNotes,
    note: "中文详读根据PubMed摘要整理为目的、方法、结果与局限，不是逐句全文翻译，未经医学审校。原文变化即停用旧稿。新增文献未整理中文稿时显示完整英文摘要；不自动调用翻译或付费AI服务。"
  };
  await writeJsonFile(join(dataDir, "detailed-abstracts.json"), result);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) updateDetailedAbstracts().then((result) => console.log(result.counts)).catch((error) => { console.error(error.message); process.exitCode = 1; });
