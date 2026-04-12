const GRAPHQL_PATH = "/api/graphql";

type GqlError = { message: string };

async function leetcodeFetch<T>(body: object): Promise<T> {
  const res = await fetch(GRAPHQL_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as { data?: T; errors?: GqlError[] };

  if (!res.ok) {
    throw new Error(`LeetCode request failed (${res.status})`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Empty response from LeetCode");
  }
  return json.data;
}

const DASHBOARD_QUERY = `
  query LcTrackerDashboard($username: String!) {
    matchedUser(username: $username) {
      username
      submissionCalendar
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
    recentSubmissionList(username: $username, limit: 20) {
      title
      titleSlug
      statusDisplay
      timestamp
      lang
    }
    recentAcSubmissionList(username: $username, limit: 20) {
      timestamp
    }
  }
`;

export type DifficultyBucket = "Easy" | "Medium" | "Hard";

export type AcStats = {
  total: number;
  easy: number;
  medium: number;
  hard: number;
};

export type ActivityRow = {
  title: string;
  titleSlug: string;
  difficulty: DifficultyBucket | null;
  statusDisplay: string;
  timestamp: number;
  lang: string;
};

export type DashboardData = {
  username: string;
  stats: AcStats;
  activity: ActivityRow[];
  streak: number;
};

function parseAcStats(
  rows: { difficulty: string; count: number }[] | null | undefined
): AcStats {
  const by = new Map<string, number>();
  for (const r of rows ?? []) {
    by.set(r.difficulty, r.count);
  }
  return {
    total: by.get("All") ?? 0,
    easy: by.get("Easy") ?? 0,
    medium: by.get("Medium") ?? 0,
    hard: by.get("Hard") ?? 0,
  };
}

function utcDayKey(sec: number): string {
  const d = new Date(sec * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * If the calendar uses ~daily bucket keys (unix day start), return those UTC dates.
 * LeetCode often uses weekly buckets; those are ignored so streak is not inflated.
 */
function calendarDayKeys(jsonStr: string | null | undefined): string[] | null {
  if (!jsonStr) return null;
  let obj: Record<string, number>;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  const keys = Object.keys(obj)
    .map((k) => Number(k))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (keys.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < keys.length; i++) gaps.push(keys[i] - keys[i - 1]);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] ?? 0;
  const isDaily = median >= 86400 * 0.85 && median <= 86400 * 1.25;
  if (!isDaily) return null;
  const out: string[] = [];
  for (const k of keys) {
    if ((obj[String(k)] ?? 0) > 0) out.push(utcDayKey(k));
  }
  return out;
}

/** Consecutive UTC days with at least one submission (matches common “coding streak” UX). */
export function computeStreakFromDays(days: Set<string>): number {
  if (days.size === 0) return 0;

  const today = new Date();
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  let cursor = start.getTime();
  const step = 86400000;

  if (!days.has(utcDayKey(cursor / 1000))) {
    cursor -= step;
  }

  let streak = 0;
  while (days.has(utcDayKey(cursor / 1000))) {
    streak += 1;
    cursor -= step;
  }
  return streak;
}

async function fetchDifficulties(
  slugs: string[]
): Promise<Map<string, DifficultyBucket>> {
  const unique = [...new Set(slugs)].filter(Boolean);
  const out = new Map<string, DifficultyBucket>();
  const chunkSize = 15;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const parts: string[] = [];
    const varDefs: string[] = [];
    const variables: Record<string, string> = {};

    chunk.forEach((slug, j) => {
      const name = `s${j}`;
      varDefs.push(`$${name}: String!`);
      parts.push(`  ${name}: question(titleSlug: $${name}) { difficulty }`);
      variables[name] = slug;
    });

    const query = `query DiffBatch(${varDefs.join(", ")}) {\n${parts.join("\n")}\n}`;
    const data = await leetcodeFetch<Record<string, { difficulty: string } | null>>(
      { query, variables }
    );

    for (let j = 0; j < chunk.length; j++) {
      const slug = chunk[j];
      const node = data[`s${j}`];
      const d = node?.difficulty;
      if (d === "Easy" || d === "Medium" || d === "Hard") {
        out.set(slug, d);
      }
    }
  }

  return out;
}

type DashboardGql = {
  matchedUser: {
    username: string;
    submissionCalendar: string | null;
    submitStatsGlobal: {
      acSubmissionNum: { difficulty: string; count: number }[];
    } | null;
  } | null;
  recentSubmissionList: {
    title: string;
    titleSlug: string;
    statusDisplay: string;
    timestamp: string;
    lang: string;
  }[];
  recentAcSubmissionList: { timestamp: string }[];
};

export async function fetchDashboard(username: string): Promise<DashboardData> {
  const u = username.trim();
  if (!u) throw new Error("Username is required");

  const data = await leetcodeFetch<DashboardGql>({
    query: DASHBOARD_QUERY,
    variables: { username: u },
  });

  const matched = data.matchedUser;
  if (!matched) {
    throw new Error(`User "${u}" was not found on LeetCode`);
  }

  const stats = parseAcStats(matched.submitStatsGlobal?.acSubmissionNum);
  const recent = data.recentSubmissionList ?? [];

  const slugList = recent.map((r) => r.titleSlug);
  const diffMap = await fetchDifficulties(slugList);

  const activity: ActivityRow[] = recent.map((r) => ({
    title: r.title,
    titleSlug: r.titleSlug,
    difficulty: diffMap.get(r.titleSlug) ?? null,
    statusDisplay: r.statusDisplay,
    timestamp: Number(r.timestamp),
    lang: r.lang,
  }));

  const streakTs: number[] = [
    ...recent.map((r) => Number(r.timestamp)),
    ...(data.recentAcSubmissionList ?? []).map((r) => Number(r.timestamp)),
  ];

  const streakDays = new Set<string>();
  for (const t of streakTs) streakDays.add(utcDayKey(t));
  const calExtra = calendarDayKeys(matched.submissionCalendar);
  if (calExtra) for (const d of calExtra) streakDays.add(d);

  return {
    username: matched.username,
    stats,
    activity,
    streak: computeStreakFromDays(streakDays),
  };
}
