import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  fetchDashboard,
  type ActivityRow,
  type DashboardData,
  type DifficultyBucket,
} from "./leetcode";
import "./App.css";

const STORAGE_KEY = "lc-tracker-username";

function difficultyClass(d: DifficultyBucket | null): string {
  if (d === "Easy") return "diff-easy";
  if (d === "Medium") return "diff-medium";
  if (d === "Hard") return "diff-hard";
  return "diff-unknown";
}

function formatDate(tsSec: number): string {
  return new Date(tsSec * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("accept")) return "status-ok";
  if (s.includes("wrong") || s.includes("error") || s.includes("limit"))
    return "status-bad";
  return "status-warn";
}

type PieSlice = {
  key: string;
  label: string;
  count: number;
  pct: number;
  className: string;
};

function DifficultyPie({ sum, slices }: { sum: number; slices: PieSlice[] }) {
  const cx = 50;
  const cy = 50;
  const r = 38;

  if (sum === 0) {
    return (
      <div className="pie-wrap">
        <svg
          viewBox="0 0 100 100"
          className="pie-svg"
          role="img"
          aria-label="No solved problems by difficulty yet"
        >
          <circle cx={cx} cy={cy} r={r} className="pie-empty" />
        </svg>
        <ul className="pie-legend">
          {slices.map((s) => (
            <li key={s.key}>
              <span
                className={`pie-dot pie-dot-${s.key}`}
                aria-hidden
              />
              <span className="pie-legend-label">{s.label}</span>
              <span className="pie-legend-stats">
                <strong>{s.count}</strong>
                <span className="pie-pct"> —</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const paths: ReactElement[] = [];
  for (const s of slices) {
    const sliceAngle = (s.count / sum) * 2 * Math.PI;
    if (sliceAngle <= 0) continue;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sliceAngle;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    paths.push(<path key={s.key} d={d} className={s.className} />);
  }

  const ariaLabel = slices
    .filter((s) => s.count > 0)
    .map((s) => `${s.label} ${s.pct.toFixed(1)} percent`)
    .join(", ");

  return (
    <div className="pie-wrap">
      <svg
        viewBox="0 0 100 100"
        className="pie-svg"
        role="img"
        aria-label={`Difficulty split: ${ariaLabel}`}
      >
        {paths}
      </svg>
      <ul className="pie-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <span className={`pie-dot pie-dot-${s.key}`} aria-hidden />
            <span className="pie-legend-label">{s.label}</span>
            <span className="pie-legend-stats">
              <strong>{s.count}</strong>
              <span className="pie-pct">
                {" "}
                ({s.pct.toFixed(1)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function App() {
  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [activeUser, setActiveUser] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    } catch {
      return "";
    }
  });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (username: string, soft?: boolean) => {
    const u = username.trim();
    if (!u) {
      setError("Enter a LeetCode username.");
      return;
    }
    setLoading(true);
    setError(null);
    if (!soft) setData(null);
    try {
      const d = await fetchDashboard(u);
      setData(d);
      try {
        localStorage.setItem(STORAGE_KEY, u);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeUser) void load(activeUser);
  }, [activeUser, load]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveUser(input.trim());
  };

  const onRefresh = () => {
    if (activeUser) void load(activeUser, true);
  };

  const pieSegments = useMemo(() => {
    if (!data) return null;
    const { easy, medium, hard } = data.stats;
    const sum = easy + medium + hard;
    const slices: PieSlice[] = [
      { key: "easy", label: "Easy", count: easy, pct: 0, className: "pie-fill-easy" },
      { key: "medium", label: "Medium", count: medium, pct: 0, className: "pie-fill-medium" },
      { key: "hard", label: "Hard", count: hard, pct: 0, className: "pie-fill-hard" },
    ];
    if (sum === 0) {
      return { sum: 0, slices };
    }
    for (const s of slices) {
      s.pct = (s.count / sum) * 100;
    }
    return { sum, slices };
  }, [data]);

  const showSkeleton = loading && !data;

  return (
    <div className="app">
      {loading && <div className="top-loading-bar" aria-hidden />}

      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1 className="title">LC Tracker</h1>
            <p className="tagline">LeetCode progress · auto-synced</p>
          </div>
        </div>

        <form className="user-form" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="lc-user">
            LeetCode username
          </label>
          <input
            id="lc-user"
            className="user-input"
            placeholder="username"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Track
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onRefresh}
            disabled={loading || !activeUser}
          >
            Refresh
          </button>
          {loading && <span className="fetching-indicator">Fetching data…</span>}
        </form>
      </header>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      {showSkeleton && (
        <main className="main" aria-busy="true">
          <section className="grid-top">
            <article className="card card-total">
              <h2 className="card-label">Solved</h2>
              <div className="skeleton sk-value" />
              <div className="skeleton sk-line" />
            </article>

            <article className="card card-streak">
              <h2 className="card-label">Streak</h2>
              <div className="skeleton sk-value sk-value-sm" />
            </article>

            <article className="card card-breakdown">
              <h2 className="card-label">By difficulty</h2>
              <div className="skeleton sk-pie" />
              <div className="skeleton sk-line" />
              <div className="skeleton sk-line sk-line-short" />
              <div className="skeleton sk-line sk-line-shorter" />
            </article>
          </section>

          <section className="card card-activity">
            <div className="activity-head">
              <h2 className="card-label">Recent activity</h2>
              <span className="user-pill skeleton sk-pill" aria-hidden />
            </div>
            <div className="activity-skeleton">
              <div className="skeleton sk-row" />
              <div className="skeleton sk-row" />
              <div className="skeleton sk-row" />
              <div className="skeleton sk-row" />
            </div>
          </section>
        </main>
      )}

      {data && !showSkeleton && (
        <main className="main">
          <section className="grid-top">
            <article className="card card-total">
              <h2 className="card-label">Solved</h2>
              <p className="total-value">{data.stats.total}</p>
              <p className="card-hint">unique problems accepted</p>
            </article>

            <article className="card card-streak">
              <h2 className="card-label">Streak</h2>
              <p className="streak-value">
                {data.streak} <span className="streak-unit">day{data.streak === 1 ? "" : "s"}</span>
              </p>
            </article>

            <article className="card card-breakdown">
              <h2 className="card-label">By difficulty</h2>
              {pieSegments && (
                <DifficultyPie sum={pieSegments.sum} slices={pieSegments.slices} />
              )}
            </article>
          </section>

          <section className="card card-activity">
            <div className="activity-head">
              <h2 className="card-label">Recent activity</h2>
              <span className="user-pill">{data.username}</span>
            </div>
            <ActivityTable rows={data.activity} />
          </section>
        </main>
      )}

      {!data && !loading && !error && !activeUser && (
        <p className="empty-hint">Enter a username to load your dashboard.</p>
      )}

      <footer className="footer">
        Data from LeetCode GraphQL via <code>/api/graphql</code> (server-side proxy)
      </footer>
    </div>
  );
}

function ActivityTable({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-activity">No recent submissions returned.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="activity-table">
        <thead>
          <tr>
            <th>Problem</th>
            <th>Difficulty</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.titleSlug}-${r.timestamp}-${r.statusDisplay}`}>
              <td>
                <a
                  className="prob-link"
                  href={`https://leetcode.com/problems/${r.titleSlug}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {r.title}
                </a>
                <span className="lang-tag">{r.lang}</span>
              </td>
              <td>
                <span className={`pill ${difficultyClass(r.difficulty)}`}>
                  {r.difficulty ?? "—"}
                </span>
              </td>
              <td>
                <span className={`pill ${statusClass(r.statusDisplay)}`}>
                  {r.statusDisplay}
                </span>
              </td>
              <td className="time-cell">{formatDate(r.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
