import { del, get, put } from "@vercel/blob";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

export type TimeRange = "week" | "month";
export type ImpactLevel = "高" | "中" | "低";

export type SavedNewsItem = {
  title: string;
  date: string;
  impactLevel: ImpactLevel;
  summary: string;
  reason: string;
  source?: string;
  url?: string;
};

export type SavedNewsSnapshot = {
  location: string;
  timeRange: TimeRange;
  items: SavedNewsItem[];
  savedAt: string;
};

const BLOB_PATHNAME = "crowd-flow-warning/saved-news.json";
const LOCAL_DATA_PATH = path.join(
  process.cwd(),
  "data",
  "saved-news.json"
);

function shouldUseBlobStore() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL === "1" && process.env.BLOB_STORE_ID)
  );
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

export async function readSavedNews() {
  if (shouldUseBlobStore()) {
    const result = await get(BLOB_PATHNAME, {
      access: "private",
      useCache: false
    });

    if (!result || result.statusCode !== 200) {
      return null;
    }

    return JSON.parse(await streamToText(result.stream)) as SavedNewsSnapshot;
  }

  try {
    return JSON.parse(
      await readFile(LOCAL_DATA_PATH, "utf8")
    ) as SavedNewsSnapshot;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function saveNewsSnapshot(snapshot: SavedNewsSnapshot) {
  if (shouldUseBlobStore()) {
    await put(BLOB_PATHNAME, JSON.stringify(snapshot), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60
    });
    return;
  }

  await mkdir(path.dirname(LOCAL_DATA_PATH), { recursive: true });
  await writeFile(LOCAL_DATA_PATH, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function clearSavedNews() {
  if (shouldUseBlobStore()) {
    try {
      await del(BLOB_PATHNAME);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("not found")) {
        throw error;
      }
    }
    return;
  }

  await rm(LOCAL_DATA_PATH, { force: true });
}
