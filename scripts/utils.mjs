import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { summarizeArticle } from "../lib/article-overview.js";

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
  return summarizeArticle(article);
}

export async function summarizeWithAI() {
  return null;
}
