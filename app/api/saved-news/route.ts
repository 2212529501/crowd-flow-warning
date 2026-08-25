import { NextResponse } from "next/server";
import { isAdminRequest } from "../../lib/admin-auth";
import {
  clearSavedNews,
  readSavedNews,
  saveNewsSnapshot,
  SavedNewsItem,
  TimeRange
} from "../../lib/saved-news-store";

export const runtime = "nodejs";

const ALLOWED_TIME_RANGES = new Set<TimeRange>(["week", "month"]);
const ALLOWED_IMPACT_LEVELS = new Set(["高", "中", "低"]);

type SaveRequest = {
  location?: unknown;
  timeRange?: unknown;
  items?: unknown;
};

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

function isNewsItem(value: unknown): value is SavedNewsItem {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;
  return (
    typeof item.title === "string" &&
    typeof item.date === "string" &&
    typeof item.summary === "string" &&
    typeof item.reason === "string" &&
    typeof item.impactLevel === "string" &&
    ALLOWED_IMPACT_LEVELS.has(item.impactLevel) &&
    (item.source === undefined || typeof item.source === "string") &&
    (item.url === undefined || typeof item.url === "string")
  );
}

export async function GET() {
  try {
    const saved = await readSavedNews();
    return jsonResponse({ saved }, 200);
  } catch (error) {
    console.error("[saved-news-api] read failed", error);
    return jsonResponse({ error: "读取保存结果失败" }, 500);
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return jsonResponse({ error: "请先输入管理密码" }, 401);
  }

  let payload: SaveRequest;

  try {
    payload = (await request.json()) as SaveRequest;
  } catch {
    return jsonResponse({ error: "保存参数有误" }, 400);
  }

  const location =
    typeof payload.location === "string" ? payload.location.trim() : "";
  const timeRange = payload.timeRange;

  if (
    !location ||
    typeof timeRange !== "string" ||
    !ALLOWED_TIME_RANGES.has(timeRange as TimeRange) ||
    !Array.isArray(payload.items) ||
    payload.items.length === 0 ||
    !payload.items.every(isNewsItem)
  ) {
    return jsonResponse({ error: "保存参数有误" }, 400);
  }

  const snapshot = {
    location,
    timeRange: timeRange as TimeRange,
    items: payload.items,
    savedAt: new Date().toISOString()
  };

  try {
    await saveNewsSnapshot(snapshot);
    return jsonResponse({ saved: snapshot }, 200);
  } catch (error) {
    console.error("[saved-news-api] save failed", error);
    return jsonResponse({ error: "保存结果失败，请检查存储配置" }, 500);
  }
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) {
    return jsonResponse({ error: "请先输入管理密码" }, 401);
  }

  try {
    await clearSavedNews();
    return jsonResponse({ saved: null }, 200);
  } catch (error) {
    console.error("[saved-news-api] clear failed", error);
    return jsonResponse({ error: "清除保存结果失败" }, 500);
  }
}
