"use client";

import {
  CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useState
} from "react";

type TimeRange = "week" | "month";
type ImpactLevel = "高" | "中" | "低";
type Section = "overview" | "search" | "calendar" | "compare" | "analysis";
type AdminAction = "update" | "save";
type EventCategory =
  | "演出活动"
  | "体育赛事"
  | "交通出行"
  | "展会会议"
  | "教育考试"
  | "文旅节庆"
  | "其他";

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

type SavedNewsSnapshot = {
  location: string;
  timeRange: TimeRange;
  items: NewsItem[];
  savedAt: string;
};

type SavedNewsResponse = {
  saved?: SavedNewsSnapshot | null;
  error?: string;
};

type AdminAuthResponse = {
  authenticated?: boolean;
  error?: string;
};

const LOCATIONS = ["北京", "上海", "广东", "浙江", "江苏", "四川"];
const TIME_RANGE_OPTIONS: Array<{ label: string; value: TimeRange }> = [
  { label: "未来一周", value: "week" },
  { label: "未来一个月", value: "month" }
];

const NAV_ITEMS: Array<{ id: Section; label: string; icon: string }> = [
  { id: "overview", label: "首页概览", icon: "⌂" },
  { id: "search", label: "事件检索", icon: "⌕" },
  { id: "calendar", label: "事件日历", icon: "▦" },
  { id: "compare", label: "城市对比", icon: "⇄" },
  { id: "analysis", label: "AI 分析", icon: "✦" }
];

const LOADING_STAGES = [
  "正在联网检索区域相关事件",
  "筛选与人群流动相关的内容",
  "评估各事件的影响范围与等级",
  "整理分析结果，马上完成"
];

const ESTIMATED_TOTAL_SECONDS = 55;

const errorMessages: Record<number, string> = {
  400: "请求参数有误，请重新选择条件",
  429: "AI 服务暂时繁忙，请稍后重试",
  500: "服务暂时不可用，请检查线上环境变量",
  502: "AI 返回结果异常，请稍后重试",
  504: "分析超时，请缩小范围或稍后再试"
};

const impactConfig: Record<
  ImpactLevel,
  { label: string; className: string; dotClassName: string }
> = {
  高: {
    label: "高风险",
    className: "border-rose-400/20 bg-rose-500/10 text-rose-300",
    dotClassName: "bg-rose-400"
  },
  中: {
    label: "中风险",
    className: "border-amber-400/20 bg-amber-500/10 text-amber-300",
    dotClassName: "bg-amber-400"
  },
  低: {
    label: "低风险",
    className: "border-sky-400/20 bg-sky-500/10 text-sky-300",
    dotClassName: "bg-sky-400"
  }
};

const categoryConfig: Array<{
  name: EventCategory;
  color: string;
}> = [
  { name: "演出活动", color: "#7c6cff" },
  { name: "体育赛事", color: "#18c79a" },
  { name: "交通出行", color: "#ff9d42" },
  { name: "展会会议", color: "#38a7ff" },
  { name: "教育考试", color: "#f25d7a" },
  { name: "文旅节庆", color: "#e5c34e" },
  { name: "其他", color: "#667085" }
];

function getErrorMessage(status: number, fallback?: string) {
  return errorMessages[status] ?? fallback ?? "服务暂时不可用";
}

function classifyEvent(item: NewsItem): EventCategory {
  const text = `${item.title} ${item.summary} ${item.reason}`;
  if (/演唱|音乐|演出|剧场|艺人|演艺/.test(text)) return "演出活动";
  if (/体育|赛事|比赛|马拉松|球赛|联赛/.test(text)) return "体育赛事";
  if (/交通|道路|地铁|公交|高速|机场|铁路|施工|管制/.test(text)) {
    return "交通出行";
  }
  if (/展会|会议|论坛|峰会|招聘|博览|大会/.test(text)) return "展会会议";
  if (/考试|高考|开学|学校|校园|教育/.test(text)) return "教育考试";
  if (/旅游|景区|节庆|灯会|庙会|市集|节假|文旅/.test(text)) return "文旅节庆";
  return "其他";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(date)
    .replaceAll("/", "-");
}

function formatDateTime(date: string) {
  const match = date.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  return match ? match[1].replaceAll("/", "-") : date;
}

function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden className="dashboard-icon">
      {name}
    </span>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  detail,
  accent,
  icon
}: {
  label: string;
  value: number;
  suffix?: string;
  detail: string;
  accent: "violet" | "rose" | "amber" | "sky";
  icon: string;
}) {
  return (
    <article className={`dashboard-panel metric-card accent-${accent}`}>
      <div>
        <p className="metric-label">{label}</p>
        <p className="metric-value">
          {value}
          {suffix ? <span>{suffix}</span> : null}
        </p>
        <p className="metric-detail">{detail}</p>
      </div>
      <div className="metric-icon">
        <Icon name={icon} />
      </div>
    </article>
  );
}

export default function HomePage() {
  const [location, setLocation] = useState("北京");
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [impactFilter, setImpactFilter] = useState<ImpactLevel | "全部">("全部");
  const [savedSnapshot, setSavedSnapshot] = useState<SavedNewsSnapshot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<AdminAction | null>(
    null
  );
  const [managementPassword, setManagementPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

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

  useEffect(() => {
    let isMounted = true;

    async function loadSavedNews() {
      try {
        const response = await fetch("/api/saved-news", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as SavedNewsResponse;

        if (!isMounted || !response.ok || !data.saved) {
          return;
        }

        setSavedSnapshot(data.saved);
        setItems(data.saved.items);
        setLocation(data.saved.location);
        setTimeRange(data.saved.timeRange);
        setHasSearched(true);
        setSaveMessage("已加载共享保存结果");
      } catch {
        if (isMounted) {
          setSaveMessage("共享保存结果读取失败");
        }
      }
    }

    void loadSavedNews();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/admin-auth", { cache: "no-store" })
      .then((response) => response.json() as Promise<AdminAuthResponse>)
      .then((data) => {
        if (isMounted) {
          setIsAdminAuthenticated(data.authenticated === true);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  const today = useMemo(() => formatDate(new Date()), []);
  const currentRangeLabel =
    TIME_RANGE_OPTIONS.find((option) => option.value === timeRange)?.label ??
    "未来一周";
  const loadingStage =
    LOADING_STAGES[
      Math.min(Math.floor(elapsedSeconds / 6), LOADING_STAGES.length - 1)
    ];
  const loadingProgress = Math.min(
    100,
    Math.round((elapsedSeconds / ESTIMATED_TOTAL_SECONDS) * 100)
  );

  const metrics = useMemo(
    () => ({
      total: items.length,
      high: items.filter((item) => item.impactLevel === "高").length,
      medium: items.filter((item) => item.impactLevel === "中").length,
      low: items.filter((item) => item.impactLevel === "低").length
    }),
    [items]
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<EventCategory, number>();
    categoryConfig.forEach((category) => counts.set(category.name, 0));
    items.forEach((item) => {
      const category = classifyEvent(item);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return categoryConfig.map((category) => ({
      ...category,
      count: counts.get(category.name) ?? 0
    }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesImpact =
        impactFilter === "全部" || item.impactLevel === impactFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${item.title} ${item.summary} ${item.source ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesImpact && matchesQuery;
    });
  }, [impactFilter, items, query]);

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, NewsItem[]>();
    items.forEach((item) => {
      const key = formatDateTime(item.date);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const topCategory = useMemo(
    () =>
      [...categoryCounts].sort((a, b) => b.count - a.count)[0] ?? {
        name: "其他" as EventCategory,
        color: "#667085",
        count: 0
      },
    [categoryCounts]
  );

  const aiSummary = useMemo(() => {
    if (!items.length) {
      return "完成一次检索后，AI 会根据事件数量、风险等级和类型分布生成城市运行摘要。";
    }
    if (metrics.high > 0) {
      return `${location}当前识别到 ${metrics.total} 个相关事件，其中 ${metrics.high} 个高风险事件。当前以${topCategory.name}类事件最集中，建议优先核查高风险事件的时间与影响范围。`;
    }
    return `${location}当前识别到 ${metrics.total} 个相关事件，暂未发现高风险事件。当前主要关注${topCategory.name}类事件。`;
  }, [items.length, location, metrics.high, metrics.total, topCategory.name]);

  function navigate(section: Section) {
    setActiveSection(section);
    if (section === "search") {
      window.setTimeout(() => {
        document.getElementById("search-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 0);
    }
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setIsLoading(true);
    setError("");
    setSaveMessage("");
    setSavedSnapshot(null);
    setHasSearched(true);
    setActiveSection("overview");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 58000);

    try {
      const clearResponse = await fetch("/api/saved-news", { method: "DELETE" });
      if (!clearResponse.ok) {
        if (clearResponse.status === 401) {
          setIsAdminAuthenticated(false);
        }
        setItems([]);
        setError("旧保存结果清除失败，本次更新未开始");
        return;
      }

      const response = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, timeRange }),
        signal: controller.signal
      });
      const data = (await response.json().catch(() => ({}))) as ApiResponse;

      if (!response.ok) {
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
        setItems([]);
        setError(getErrorMessage(response.status, data.error));
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (requestError) {
      setItems([]);
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        setError("分析超时，请缩小范围或稍后再试");
      } else {
        setError("服务暂时不可用，请检查 API 服务是否已部署");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }

  async function handleSaveSnapshot() {
    if (items.length === 0) {
      setSaveMessage("暂无可保存的搜索结果");
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    try {
      const response = await fetch("/api/saved-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, timeRange, items })
      });
      const data = (await response.json().catch(() => ({}))) as SavedNewsResponse;

      if (!response.ok || !data.saved) {
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
        setSaveMessage(data.error ?? "保存失败，请稍后再试");
        return;
      }

      setSavedSnapshot(data.saved);
      setSaveMessage("已保存，本页面访客将看到这次结果");
    } catch {
      setSaveMessage("保存失败，请检查网络或存储配置");
    } finally {
      setIsSaving(false);
    }
  }

  function requestAdminAction(action: AdminAction, event?: FormEvent) {
    event?.preventDefault();

    if (isAdminAuthenticated) {
      if (action === "update") {
        void handleSubmit();
      } else {
        void handleSaveSnapshot();
      }
      return;
    }

    setPendingAdminAction(action);
    setManagementPassword("");
    setAuthError("");
    setIsPasswordDialogOpen(true);
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthenticating(true);
    setAuthError("");

    try {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: managementPassword })
      });
      const data = (await response.json().catch(() => ({}))) as AdminAuthResponse;

      if (!response.ok) {
        setAuthError(data.error ?? "管理密码验证失败");
        return;
      }

      const action = pendingAdminAction;
      setIsAdminAuthenticated(true);
      setIsPasswordDialogOpen(false);
      setManagementPassword("");
      setPendingAdminAction(null);

      if (action === "update") {
        await handleSubmit();
      } else if (action === "save") {
        await handleSaveSnapshot();
      }
    } catch {
      setAuthError("无法连接管理认证服务");
    } finally {
      setIsAuthenticating(false);
    }
  }

  const dashboardStyle = {
    "--dashboard-accent": "#7c6cff"
  } as CSSProperties;

  return (
    <main className="dashboard-shell" style={dashboardStyle}>
      <aside className="dashboard-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Icon name="✦" />
          </div>
          <div>
            <p className="brand-name">城市流动预警agent</p>
            <p className="brand-subtitle">AI 事件检索与预警</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <button
              className={`sidebar-nav-item ${
                activeSection === item.id ? "is-active" : ""
              }`}
              key={item.id}
              onClick={() => navigate(item.id)}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "analysis" && items.length > 0 ? (
                <span className="nav-status-dot" />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footer-label">最近一次数据检索</p>
          <div className="sidebar-footer-row">
            <span>
              {hasSearched ? `${today} · ${location}` : "尚未检索"}
            </span>
            <span className="refresh-mark">↻</span>
          </div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <p className="eyebrow">城市运行智能分析</p>
            <h1>
              {activeSection === "overview"
                ? "首页概览"
                : NAV_ITEMS.find((item) => item.id === activeSection)?.label}
            </h1>
          </div>

          <div className="topbar-actions">
            <label className="dashboard-select-wrap">
              <span>当前城市</span>
              <select
                aria-label="选择当前城市"
                className="dashboard-select"
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
            <div className="topbar-date">
              <span>数据日期</span>
              <strong>{today}</strong>
            </div>
            <button
              className="primary-action"
              disabled={isLoading}
              onClick={() => requestAdminAction("update")}
              type="button"
            >
              <Icon name={isLoading ? "…" : "⌕"} />
              {isLoading ? "分析中" : "开始检索"}
            </button>
            <button
              className="save-action"
              disabled={isLoading || isSaving || items.length === 0}
              onClick={() => requestAdminAction("save")}
              type="button"
            >
              <Icon name="▣" />
              {isSaving ? "保存中" : "保存"}
            </button>
            <div className="user-chip">
              <div className="avatar">运</div>
              <div>
                <p>wrh</p>
                <span>在线</span>
              </div>
            </div>
          </div>
        </header>

        {activeSection === "overview" || activeSection === "search" ? (
          <div className="dashboard-content">
            <section className="dashboard-hero">
              <div>
                <p className="hero-location">
                  {location} · {currentRangeLabel}
                </p>
                <h2>
                  {hasSearched
                    ? "城市事件态势已更新"
                    : "准备好查看城市事件态势了吗？"}
                </h2>
                <p className="hero-description">
                  agent会从公开新闻、活动、交通和公共事件中筛选可能影响人群流动的信号。
                </p>
                {saveMessage ? (
                  <p className="save-message">{saveMessage}</p>
                ) : null}
                {savedSnapshot ? (
                  <p className="save-meta">
                    共享保存于{" "}
                    {new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    }).format(new Date(savedSnapshot.savedAt))}
                  </p>
                ) : null}
              </div>
              <form
                className="hero-controls"
                id="search-panel"
                onSubmit={(event) => requestAdminAction("update", event)}
              >
                <label>
                  <span>时间范围</span>
                  <select
                    className="dashboard-input"
                    value={timeRange}
                    onChange={(event) =>
                      setTimeRange(event.target.value as TimeRange)
                    }
                  >
                    {TIME_RANGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-action"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading ? "正在分析..." : "更新数据"}
                </button>
                <button
                  className="save-action compact"
                  disabled={isLoading || isSaving || items.length === 0}
                  onClick={() => requestAdminAction("save")}
                  type="button"
                >
                  {isSaving ? "保存中" : "保存结果"}
                </button>
              </form>
            </section>

            {isLoading ? (
              <section className="dashboard-panel loading-panel">
                <div className="loading-copy">
                  <div className="loading-orb" />
                  <div>
                    <p>{loadingStage}</p>
                    <span>已用时 {elapsedSeconds} 秒，通常需要 20-50 秒</span>
                  </div>
                </div>
                <strong>{loadingProgress}%</strong>
                <div className="loading-track">
                  <div style={{ width: `${loadingProgress}%` }} />
                </div>
              </section>
            ) : null}

            {error && !isLoading ? (
              <section className="error-panel">{error}</section>
            ) : null}

            <section className="metrics-grid">
              <MetricCard
                accent="violet"
                detail={hasSearched ? `覆盖${currentRangeLabel}` : "完成检索后显示"}
                icon="◈"
                label="事件总数"
                suffix="个"
                value={metrics.total}
              />
              <MetricCard
                accent="rose"
                detail={
                  metrics.total
                    ? `${Math.round((metrics.high / metrics.total) * 100)}% 占比`
                    : "暂无高风险事件"
                }
                icon="!"
                label="高风险事件"
                suffix="个"
                value={metrics.high}
              />
              <MetricCard
                accent="amber"
                detail="需要重点关注"
                icon="△"
                label="中风险事件"
                suffix="个"
                value={metrics.medium}
              />
              <MetricCard
                accent="sky"
                detail="低风险及常规事件"
                icon="✓"
                label="低风险事件"
                suffix="个"
                value={metrics.low}
              />
            </section>

            <section className="charts-grid">
              <article className="dashboard-panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <h2>事件类型分布</h2>
                    <p>按当前检索结果自动归类</p>
                  </div>
                  <span className="muted-pill">{metrics.total} 个事件</span>
                </div>
                <div className="donut-layout">
                  <div
                    className="donut-chart"
                    style={
                      {
                        "--donut-background":
                          metrics.total > 0
                            ? `conic-gradient(${categoryCounts
                                .filter((category) => category.count > 0)
                                .map((category, index, visible) => {
                                  const start =
                                    visible
                                      .slice(0, index)
                                      .reduce((sum, item) => sum + item.count, 0) /
                                    metrics.total;
                                  const end =
                                    start + category.count / metrics.total;
                                  return `${category.color} ${start * 360}deg ${end * 360}deg`;
                                })
                                .join(", ")})`
                            : "conic-gradient(#1d293b 0deg 360deg)"
                      } as CSSProperties
                    }
                  >
                    <div className="donut-hole">
                      <strong>{metrics.total}</strong>
                      <span>事件总数</span>
                    </div>
                  </div>
                  <div className="legend-list">
                    {categoryCounts.map((category) => (
                      <div className="legend-row" key={category.name}>
                        <span>
                          <i style={{ backgroundColor: category.color }} />
                          {category.name}
                        </span>
                        <strong>{category.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="dashboard-panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <h2>风险等级概览</h2>
                    <p>快速判断当前城市关注重点</p>
                  </div>
                  <span className="panel-location">{location}</span>
                </div>
                <div className="risk-bars">
                  {(["高", "中", "低"] as ImpactLevel[]).map((level) => {
                    const count =
                      level === "高"
                        ? metrics.high
                        : level === "中"
                          ? metrics.medium
                          : metrics.low;
                    const percent = metrics.total
                      ? Math.round((count / metrics.total) * 100)
                      : 0;
                    return (
                      <div key={level}>
                        <div className="risk-bar-label">
                          <span>
                            <i className={impactConfig[level].dotClassName} />
                            {impactConfig[level].label}
                          </span>
                          <strong>
                            {count} / {percent}%
                          </strong>
                        </div>
                        <div className="risk-track">
                          <div
                            className={impactConfig[level].dotClassName}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="insight-box">
                  {hasSearched
                    ? aiSummary
                    : "当前还没有分析结果。点击右上角“开始检索”，生成本城市的事件画像。"}
                </div>
              </article>
            </section>

            <section className="dashboard-panel events-panel">
              <div className="panel-heading events-heading">
                <div>
                  <h2>全部事件</h2>
                  <p>
                    {hasSearched
                      ? `${location} · ${currentRangeLabel} · 共 ${items.length} 条`
                      : "完成检索后，所有相关事件会显示在这里"}
                  </p>
                </div>
                <div className="event-filters">
                  <input
                    aria-label="搜索事件"
                    className="dashboard-input"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索事件名称"
                    value={query}
                  />
                  <select
                    aria-label="筛选风险等级"
                    className="dashboard-input"
                    onChange={(event) =>
                      setImpactFilter(
                        event.target.value as ImpactLevel | "全部"
                      )
                    }
                    value={impactFilter}
                  >
                    <option value="全部">全部风险</option>
                    <option value="高">高风险</option>
                    <option value="中">中风险</option>
                    <option value="低">低风险</option>
                  </select>
                </div>
              </div>

              {filteredItems.length > 0 ? (
                <div className="table-wrap">
                  <table className="event-table">
                    <thead>
                      <tr>
                        <th>事件名称</th>
                        <th>类型</th>
                        <th>时间</th>
                        <th>影响等级</th>
                        <th>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item, index) => (
                        <tr key={`${item.title}-${item.date}-${index}`}>
                          <td className="event-title-cell">
                            {item.url ? (
                              <a
                                href={item.url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {item.title}
                              </a>
                            ) : (
                              <span>{item.title}</span>
                            )}
                            <small>{item.summary || item.reason}</small>
                          </td>
                          <td>
                            <span className="category-pill">
                              {classifyEvent(item)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-slate-400">
                            {formatDateTime(item.date)}
                          </td>
                          <td>
                            <span
                              className={`risk-pill ${impactConfig[item.impactLevel].className}`}
                            >
                              <i className={impactConfig[item.impactLevel].dotClassName} />
                              {impactConfig[item.impactLevel].label}
                            </span>
                          </td>
                          <td className="source-cell">
                            {item.source || "AI 综合检索"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <span className="empty-state-icon">⌕</span>
                  <p>{hasSearched ? "没有符合条件的事件" : "等待第一次事件检索"}</p>
                  <small>
                    {hasSearched
                      ? "可以尝试更换关键词或风险等级筛选"
                      : "选择城市和时间范围后，点击开始检索"}
                  </small>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {activeSection === "calendar" ? (
          <section className="dashboard-panel feature-panel">
            <div className="panel-heading">
              <div>
                <h2>事件日历</h2>
                <p>按发生日期查看 {location} 的事件安排</p>
              </div>
              <button
                className="secondary-action"
                onClick={() => navigate("search")}
                type="button"
              >
                先去检索
              </button>
            </div>
            {calendarGroups.length > 0 ? (
              <div className="calendar-list">
                {calendarGroups.map(([date, dateItems]) => (
                  <div className="calendar-row" key={date}>
                    <div className="calendar-date">
                      <span>{date.slice(5)}</span>
                      <small>{date.slice(0, 4)}</small>
                    </div>
                    <div className="calendar-events">
                      {dateItems.map((item, index) => (
                        <div
                          className="event-list-row"
                          key={`${item.title}-${index}`}
                        >
                          <i
                            className={impactConfig[item.impactLevel].dotClassName}
                          />
                          <span>{item.title}</span>
                          <small>{impactConfig[item.impactLevel].label}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-state-icon">▦</span>
                <p>日历暂时没有事件</p>
                <small>检索完成后，事件会按照日期自动排布</small>
              </div>
            )}
          </section>
        ) : null}

        {activeSection === "compare" ? (
          <section className="dashboard-panel feature-panel">
            <h2>城市对比</h2>
            <p className="section-caption">
              这项功能建议用于比较多个城市在同一时间范围内的事件密度和高风险占比。
            </p>
            <div className="compare-grid">
              {LOCATIONS.slice(0, 3).map((city, index) => (
                <div className="compare-card" key={city}>
                  <div className="compare-card-head">
                    <span>{city}</span>
                    <small>{index === 0 ? "当前城市" : "待检索"}</small>
                  </div>
                  <strong>
                    {index === 0 && hasSearched ? metrics.total : "--"}
                  </strong>
                  <small>事件总数</small>
                  <div className="compare-track">
                    <div
                      style={{
                        width:
                          index === 0 && hasSearched
                            ? `${Math.min(100, metrics.total * 7)}%`
                            : "0%"
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeSection === "analysis" ? (
          <section className="analysis-grid">
            <article className="dashboard-panel feature-panel">
              <div className="analysis-heading">
                <div className="analysis-badge">
                  <Icon name="✦" />
                </div>
                <div>
                  <h2>AI 智能分析</h2>
                  <p>基于当前检索结果生成运行摘要</p>
                </div>
              </div>
              <p className="analysis-summary">{aiSummary}</p>
              <div className="analysis-stats">
                <div>
                  <span>事件总数</span>
                  <strong>{metrics.total}</strong>
                </div>
                <div>
                  <span>高风险事件</span>
                  <strong className="text-rose-300">{metrics.high}</strong>
                </div>
                <div>
                  <span>主要类型</span>
                  <strong>{topCategory.name}</strong>
                </div>
              </div>
            </article>
            <article className="dashboard-panel feature-panel">
              <h2>建议的后续能力</h2>
              <div className="recommendations">
                {[
                  ["01", "风险事件订阅", "高风险事件增加时，通过邮件或企业微信提醒运营人员。"],
                  ["02", "历史趋势", "保存每次检索结果，观察城市事件密度的周环比与月环比。"],
                  ["03", "影响区域地图", "为事件补充地理坐标，在地图上展示风险聚集区域。"]
                ].map(([number, title, description]) => (
                  <div className="recommendation-row" key={number}>
                    <span>{number}</span>
                    <div>
                      <p>{title}</p>
                      <small>{description}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </section>

      {isPasswordDialogOpen ? (
        <div
          aria-modal="true"
          className="password-dialog-backdrop"
          role="dialog"
        >
          <form className="password-dialog" onSubmit={handlePasswordSubmit}>
            <div className="password-dialog-head">
              <div className="password-dialog-icon">
                <Icon name="⌕" />
              </div>
              <div>
                <h2>需要管理密码</h2>
                <p>
                  {pendingAdminAction === "save"
                    ? "保存共享结果需要管理员权限"
                    : "更新数据会清除当前保存结果，需要管理员权限"}
                </p>
              </div>
            </div>
            <label className="password-field">
              <span>管理密码</span>
              <input
                autoFocus
                onChange={(event) => setManagementPassword(event.target.value)}
                placeholder="请输入管理密码"
                type="password"
                value={managementPassword}
              />
            </label>
            {authError ? <p className="password-error">{authError}</p> : null}
            <div className="password-dialog-actions">
              <button
                className="dialog-secondary-action"
                onClick={() => {
                  setIsPasswordDialogOpen(false);
                  setPendingAdminAction(null);
                  setManagementPassword("");
                  setAuthError("");
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="primary-action"
                disabled={isAuthenticating || !managementPassword}
                type="submit"
              >
                {isAuthenticating ? "验证中" : "确认"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
