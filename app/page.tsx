"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TimeRange = "week" | "month";
type ImpactLevel = "高" | "中" | "低";

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

const LOCATIONS = ["江苏", "北京", "上海", "广东", "浙江", "四川"];

const TIME_RANGE_OPTIONS: Array<{ label: string; value: TimeRange }> = [
  { label: "未来一周", value: "week" },
  { label: "未来一个月", value: "month" }
];

const LOADING_STAGES = [
  "正在联网检索区域相关新闻...",
  "筛选与人群流动相关的事件...",
  "评估各事件的影响范围与等级...",
  "整理分析结果，即将完成..."
];

const ESTIMATED_TOTAL_SECONDS = 55;

const errorMessages: Record<number, string> = {
  400: "请求参数有误，请重新选择条件",
  429: "AI 服务暂时繁忙，请稍后重试",
  500: "服务暂时不可用",
  502: "AI 返回结果异常，请稍后重试",
  504: "分析超时，请缩小范围或稍后再试"
};

const impactStyles: Record<ImpactLevel, string> = {
  高: "border-red-200 bg-red-50 text-red-700",
  中: "border-amber-200 bg-amber-50 text-amber-700",
  低: "border-slate-200 bg-slate-100 text-slate-700"
};

function getErrorMessage(status: number, fallback?: string) {
  return errorMessages[status] ?? fallback ?? "服务暂时不可用";
}

export default function HomePage() {
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [isLoading]);

  const loadingStage = useMemo(() => {
    const stageIndex = Math.min(
      Math.floor(elapsedSeconds / 6),
      LOADING_STAGES.length - 1
    );
    return LOADING_STAGES[stageIndex];
  }, [elapsedSeconds]);

  const loadingProgress = useMemo(
    () => Math.min(100, Math.round((elapsedSeconds / ESTIMATED_TOTAL_SECONDS) * 100)),
    [elapsedSeconds]
  );

  const currentRangeLabel = useMemo(
    () =>
      TIME_RANGE_OPTIONS.find((option) => option.value === timeRange)?.label ??
      "未来一周",
    [timeRange]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setHasSearched(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 58000);

    try {
      const response = await fetch("/api/news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ location, timeRange }),
        signal: controller.signal
      });

      const data = (await response.json().catch(() => ({}))) as ApiResponse;

      if (!response.ok) {
        setItems([]);
        setError(getErrorMessage(response.status, data.error));
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (requestError) {
      setItems([]);
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setError("分析超时，请缩小范围或稍后再试");
      } else {
        setError("服务暂时不可用");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
          <p className="text-sm font-medium text-teal-700">城市运行智能分析</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            AI 区域人群流动预警系统
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            选择地区和时间范围后，系统会分析近期及未来可能影响客流的活动、交通、旅游和公共事件。
          </p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
            onSubmit={handleSubmit}
          >
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">地区</span>
              <select
                className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              >
                {LOCATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">时间维度</span>
              <select
                className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                value={timeRange}
                onChange={(event) => setTimeRange(event.target.value as TimeRange)}
              >
                {TIME_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="h-11 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 md:min-w-32"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? "分析中..." : "搜索"}
            </button>
          </form>
        </section>

        <section className="min-h-52">
          {!hasSearched && !isLoading && !error ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-600">
              请选择地区和时间范围，开始识别可能影响人群流动的事件。
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-8 shadow-sm">
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 text-slate-700">
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600"
                  />
                  <span className="text-sm font-medium">{loadingStage}</span>
                </div>

                <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-600 transition-[width] duration-200 ease-linear"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>

                <p className="text-xs text-slate-500">
                  已用时 {elapsedSeconds} 秒 · 通常需要 20-50 秒，请耐心等待
                </p>
              </div>
            </div>
          ) : null}

          {error && !isLoading ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {hasSearched && !isLoading && !error && items.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-10 text-center text-slate-600 shadow-sm">
              未发现明显影响人群流动的事件
            </div>
          ) : null}

          {!isLoading && !error && items.length > 0 ? (
            <div className="grid gap-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-lg font-semibold text-slate-950">分析结果</h2>
                <p className="text-sm text-slate-500">
                  {location} · {currentRangeLabel}
                </p>
              </div>

              {items.map((item, index) => (
                <article
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                  key={`${item.title}-${item.date}-${index}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold leading-6 text-slate-950">
                        {item.url ? (
                          <a
                            className="underline decoration-slate-300 underline-offset-4 hover:text-teal-700"
                            href={item.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.date}
                        {item.source ? ` · ${item.source}` : ""}
                      </p>
                    </div>

                    <span
                      className={`inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1 text-sm font-semibold ${impactStyles[item.impactLevel]}`}
                    >
                      {item.impactLevel}影响
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-700">{item.summary}</p>
                  <div className="mt-4 rounded-md bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                    <span className="font-medium text-slate-800">影响原因：</span>
                    {item.reason}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
