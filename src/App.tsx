import { useCallback, useEffect, useMemo, useState } from "react";
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

  const barWidths = useMemo(() => {
    if (!data) return null;
    const { easy, medium, hard } = data.stats;
    const sum = easy + medium + hard;
    if (sum === 0) return { easy: 0, medium: 0, hard: 33.34 };
    return {
      easy: (easy / sum) * 100,
      medium: (medium / sum) * 100,
      hard: (hard / sum) * 100,
    };
  }, [data]);

  return (
    <div className="app">
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
        </form>
      </header>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      {loading && <div className="banner banner-loading">Pulling from LeetCode…</div>}

      {data && !loading && (
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
              <p className="card-hint">
                UTC days with at least one submission. Uses your recent submission feeds (about
                20 entries each) and, when LeetCode exposes a daily activity calendar, that too.
              </p>
            </article>

            <article className="card card-breakdown">
              <h2 className="card-label">By difficulty</h2>
              {barWidths && (
                <div className="dist-bar" aria-hidden>
                  <span
                    className="dist-seg dist-easy"
                    style={{ width: `${barWidths.easy}%` }}
                  />
                  <span
                    className="dist-seg dist-medium"
                    style={{ width: `${barWidths.medium}%` }}
                  />
                  <span
                    className="dist-seg dist-hard"
                    style={{ width: `${barWidths.hard}%` }}
                  />
                </div>
              )}
              <ul className="dist-legend">
                <li>
                  <span className="dot easy" /> Easy{" "}
                  <strong>{data.stats.easy}</strong>
                </li>
                <li>
                  <span className="dot medium" /> Medium{" "}
                  <strong>{data.stats.medium}</strong>
                </li>
                <li>
                  <span className="dot hard" /> Hard <strong>{data.stats.hard}</strong>
                </li>
              </ul>
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
