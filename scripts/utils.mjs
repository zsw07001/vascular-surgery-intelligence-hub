import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

export async function readJsonFile(filePath, fallback = null) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function loadDotEnv(rootDir) {
  const envPath = join(rootDir, ".env");
  let raw = "";

  try {
    raw = await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { loaded: false, path: envPath };
    }
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return { loaded: true, path: envPath };
}

export function summarizeWithRules(article) {
  const abstract = String(article.abstract || "");
  const englishSummary = abstract
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  const topics = article.topicTags || article.tags?.topics || [];
  const studyTypes = article.studyTypeTags || article.tags?.studyTypes || [];
  const notes = [];

  if (studyTypes.includes("RCT") || studyTypes.includes("Clinical Trial")) {
    notes.push("该研究为临床试验相关证据，建议重点关注研究设计和终点。");
  }
  if (topics.includes("PAD / CLTI")) {
    notes.push("该研究与下肢动脉疾病/CLTI 相关，可能涉及治疗或预后证据。");
  }
  if (topics.includes("Aortic Disease")) {
    notes.push("该研究与主动脉疾病相关，建议关注治疗方式、影像随访和结局指标。");
  }
  if (topics.includes("Carotid Disease")) {
    notes.push("该研究与颈动脉疾病相关，建议关注卒中、再狭窄和围手术期风险。");
  }
  if (topics.includes("Venous Disease")) {
    notes.push("该研究与静脉疾病相关，建议关注抗栓、再干预和症状改善证据。");
  }
  if (studyTypes.includes("Systematic Review") || studyTypes.includes("Meta-analysis")) {
    notes.push("该研究为系统综述或 Meta 分析，适合优先阅读。");
  }
  if (article.isChinaResearch) {
    notes.push("该研究来自中国机构，建议纳入中国研究追踪。");
  }

  return {
    englishSummary,
    summaryZh: notes.slice(0, 2).join(" ") || "该研究与血管外科主题相关，建议结合原文摘要和研究设计进行人工复核。"
  };
}

export async function summarizeWithAI() {
  return null;
}
