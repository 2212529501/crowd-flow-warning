import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type TimeRange = "week" | "month";
type ImpactLevel = "高" | "中" | "低";

type NewsRequest = {
  location?: unknown;
  timeRange?: unknown;
};

type NewsItem = {
  title: string;
  date: string;
  impactLevel: ImpactLevel;
  summary: string;
  reason: string;
  source?: string;
  url?: string;
};

type ApiResponse = {
  items?: NewsItem[];
  error?: string;
};

const SYSTEM_PROMPT = `你是一名城市运行数据分析师，擅长从新闻、活动、政策和公共事件中判断其对区域人群流动的影响。

你的任务：
1. 只保留可能引起明显人员流动的新闻或事件。
2. 过滤掉与人群流动无关的普通新闻、企业宣传、泛娱乐资讯和低相关内容。
3. 重点关注以下事件类型：
   - 大型演唱会、音乐节、体育赛事
   - 会展、论坛、会议、招聘会
   - 景区活动、旅游政策、节假日客流
   - 交通管制、重大施工、枢纽客流变化
   - 学校开学、考试、公共安全事件
4. 对每条事件评估人群流动影响等级：
   - 高：可能造成跨城/跨区显著客流增长、交通拥堵或住宿需求上涨
   - 中：可能造成局部区域客流增加
   - 低：影响范围有限，仅需关注
5. 时间维度：
   - 优先返回当前日期及之后即将发生、或仍在进行中的事件
   - 也可以返回近期已发生但同类活动可能重复举办的事件（如周末市集、月度展会、季节性赛事等）
   - 也可以返回与近期客流相关的持续性政策、施工、交通调整等
   - date 字段请尽量使用 YYYY-MM-DD 格式，日期范围请填写结束日期
6. 数量要求：
   - 尽可能返回 10-15 条相关事件，宁可适度降低相关度门槛，也要保证结果数量充足
   - 如果某类事件较少，可以扩展到周边地区或同省份的关联活动
7. 输出必须是 JSON，不要输出 Markdown，不要输出解释性文字。`;

const ALLOWED_TIME_RANGES = new Set<TimeRange>(["week", "month"]);
const ALLOWED_IMPACT_LEVELS = new Set<ImpactLevel>(["高", "中", "低"]);
const REQUEST_TIMEOUT_MS = 55000;

function jsonResponse(body: ApiResponse, status: number) {
  return NextResponse.json(body, { status });
}

function isTimeRange(value: unknown): value is TimeRange {
  return typeof value === "string" && ALLOWED_TIME_RANGES.has(value as TimeRange);
}

function getTimeRangeLabel(timeRange: TimeRange) {
  return timeRange === "week" ? "未来一周" : "未来一个月";
}

function getTodayInChina() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(new Date())
    .replaceAll("/", "-");
}

function buildSearchQueries(location: string, timeRangeLabel: string) {
  const keywords = [
    "演唱会 音乐节 演出",
    "体育赛事 马拉松",
    "会议 论坛 展会 招聘会",
    "旅游政策 景区客流 节假日",
    "交通管制 道路施工 地铁调整",
    "学校开学 大型考试",
    "市集 庙会 灯会 文化活动",
    "商圈促销 新店开业",
    "重大政策 城市规划 公共安全",
    "人群流动 客流预警"
  ];

  return keywords.map((keyword) => `${location} ${timeRangeLabel} ${keyword}`);
}

function buildUserPrompt(location: string, timeRange: TimeRange) {
  const timeRangeLabel = getTimeRangeLabel(timeRange);
  const searchQueries = buildSearchQueries(location, timeRangeLabel)
    .map((query) => `- ${query}`)
    .join("\n");

  return `地区：${location}
时间范围：${timeRangeLabel}
当前日期：${getTodayInChina()}

搜索意图：
${searchQueries}

请根据候选新闻或事件，筛选出可能影响人群流动的内容，并返回结构化 JSON。

返回格式：
{
  "items": [
    {
      "title": "string",
      "date": "YYYY-MM-DD 或可读日期",
      "impactLevel": "高 | 中 | 低",
      "summary": "不超过 80 字的摘要",
      "reason": "不超过 80 字，说明为什么会影响人群流动",
      "source": "string，可选",
      "url": "string，可选"
    }
  ]
}`;
}

function createQwenPayload(location: string, timeRange: TimeRange) {
  return {
    model: process.env.NEWS_SEARCH_MODEL ?? "qwen-plus",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: buildUserPrompt(location, timeRange)
      }
    ],
    enable_search: true,
    response_format: {
      type: "json_object"
    },
    temperature: 0.2,
    stream: false
  };
}

function extractModelContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const response = payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
    output?: {
      text?: unknown;
      choices?: Array<{ message?: { content?: unknown } }>;
    };
  };

  const openAiCompatibleContent = response.choices?.[0]?.message?.content;
  if (typeof openAiCompatibleContent === "string") {
    return openAiCompatibleContent;
  }

  const dashScopeContent = response.output?.choices?.[0]?.message?.content;
  if (typeof dashScopeContent === "string") {
    return dashScopeContent;
  }

  if (typeof response.output?.text === "string") {
    return response.output.text;
  }

  return null;
}

function parseAiJson(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error("AI_JSON_PARSE_FAILED");
    }

    return JSON.parse(objectMatch[0]) as unknown;
  }
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractLatestDateString(dateStr: string): string | null {
  const candidates: string[] = [];

  const fullDateRegex = /(\d{4})[-\/年.](\d{1,2})[-\/月.](\d{1,2})/g;
  const fullMatches = Array.from(dateStr.matchAll(fullDateRegex));
  for (const match of fullMatches) {
    const year = match[1];
    const month = match[2].padStart(2, "0");
    const day = match[3].padStart(2, "0");
    candidates.push(`${year}-${month}-${day}`);
  }

  if (candidates.length === 0) {
    const currentYear = getTodayInChina().slice(0, 4);
    const noYearRegex = /(?<!\d)(\d{1,2})[-\/月.](\d{1,2})/g;
    const noYearMatches = Array.from(dateStr.matchAll(noYearRegex));
    for (const match of noYearMatches) {
      const month = match[1].padStart(2, "0");
      const day = match[2].padStart(2, "0");
      candidates.push(`${currentYear}-${month}-${day}`);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort().pop()!;
}

function isPastEvent(dateStr: string, todayChina: string): boolean {
  const latest = extractLatestDateString(dateStr);
  if (!latest) {
    return false;
  }
  return latest < todayChina;
}

function normalizeItems(value: unknown): NewsItem[] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as { items?: unknown };
  if (!Array.isArray(parsed.items)) {
    return null;
  }

  const todayChina = getTodayInChina();

  return parsed.items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const impactLevel = ALLOWED_IMPACT_LEVELS.has(item.impactLevel as ImpactLevel)
        ? (item.impactLevel as ImpactLevel)
        : "低";

      return {
        title: String(item.title ?? "未命名事件"),
        date: String(item.date ?? "日期待确认"),
        impactLevel,
        summary: String(item.summary ?? "").slice(0, 120),
        reason: String(item.reason ?? "").slice(0, 120),
        source: toOptionalString(item.source),
        url: toOptionalString(item.url)
      };
    })
    .filter((item) => !isPastEvent(item.date, todayChina));
}

async function callQwen(location: string, timeRange: TimeRange) {
  const apiKey = process.env.NEWS_SEARCH_API_KEY;
  const endpoint = process.env.NEWS_SEARCH_ENDPOINT;

  if (!apiKey || !endpoint) {
    return {
      status: 500,
      body: { error: "AI 服务配置缺失" }
    } as const;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(createQwenPayload(location, timeRange)),
      signal: controller.signal
    });

    if (response.status === 429) {
      return {
        status: 429,
        body: { error: "AI 服务暂时繁忙，请稍后重试" }
      } as const;
    }

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "[news-api] DashScope error",
        response.status,
        responseText.slice(0, 500)
      );
      return {
        status: 500,
        body: { error: "服务暂时不可用" }
      } as const;
    }

    let upstreamPayload: unknown;
    try {
      upstreamPayload = JSON.parse(responseText) as unknown;
    } catch {
      return {
        status: 502,
        body: { error: "AI 返回格式异常" }
      } as const;
    }

    const content = extractModelContent(upstreamPayload);
    if (!content) {
      return {
        status: 502,
        body: { error: "AI 返回格式异常" }
      } as const;
    }

    let aiJson: unknown;
    try {
      aiJson = parseAiJson(content);
    } catch {
      return {
        status: 502,
        body: { error: "AI 返回格式异常" }
      } as const;
    }

    const items = normalizeItems(aiJson);
    if (!items) {
      return {
        status: 502,
        body: { error: "AI 返回格式异常" }
      } as const;
    }

    return {
      status: 200,
      body: { items }
    } as const;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        status: 504,
        body: { error: "分析超时，请缩小范围或稍后再试" }
      } as const;
    }

    console.error("[news-api] unexpected fetch error", error);
    return {
      status: 500,
      body: { error: "服务暂时不可用" }
    } as const;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  let payload: NewsRequest;

  try {
    payload = (await request.json()) as NewsRequest;
  } catch {
    return jsonResponse({ error: "请求参数有误，请重新选择条件" }, 400);
  }

  const location =
    typeof payload.location === "string" ? payload.location.trim() : "";

  if (!location || !isTimeRange(payload.timeRange)) {
    return jsonResponse({ error: "请求参数有误，请重新选择条件" }, 400);
  }

  const result = await callQwen(location, payload.timeRange);
  return jsonResponse(result.body, result.status);
}
