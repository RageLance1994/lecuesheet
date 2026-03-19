export const PHASES = [
  { key: "GATES_OPEN", label: "Gates Open" },
  { key: "KICK_OFF", label: "Kick Off" },
  { key: "HT_HALF_TIME", label: "HT-Half Time" },
  { key: "SECOND_HALF_KICK_OFF", label: "2nd HALF KICK OFF" },
  { key: "FULL_TIME", label: "FULL TIME" },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

export type MatchTeam = {
  name?: string | null;
  code?: string | null;
  logoUrl?: string | null;
};

export type MatchInfo = {
  matchId?: string | null;
  teamA?: MatchTeam | null;
  teamB?: MatchTeam | null;
  gatesOpen?: string | null;
  city?: string | null;
  date?: string | null;
  kickoffTime?: string | null;
  venue?: string | null;
};

export type MatchInfoDraft = {
  matchId: string;
  teamAName: string;
  teamACode: string;
  teamALogoUrl: string;
  teamBName: string;
  teamBCode: string;
  teamBLogoUrl: string;
  gatesOpen: string;
  city: string;
  date: string;
  kickoffTime: string;
  venue: string;
};

export function emptyMatchInfo(): MatchInfoDraft {
  return {
    matchId: "",
    teamAName: "",
    teamACode: "",
    teamALogoUrl: "",
    teamBName: "",
    teamBCode: "",
    teamBLogoUrl: "",
    gatesOpen: "",
    city: "",
    date: "",
    kickoffTime: "",
    venue: "",
  };
}

export type CueEvent = {
  id: string;
  rowOrder: number;
  timecode: string;
  phase: PhaseKey;
  category: string;
  cue: string;
  asset: string;
  operator: string;
  status: string;
  notes: string;
  sourceRow?: number | null;
  updatedAt: string;
  updatedBy: string;
};

export type VersionItem = {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  eventId?: string;
  details?: Record<string, unknown>;
};

export type CueSheetSnapshot = {
  metadata: {
    name: string;
    sourceFile?: string | null;
    importedAt?: string | null;
    updatedAt?: string | null;
    match?: MatchInfo | null;
  };
  events: CueEvent[];
  versions: VersionItem[];
};

async function parseResponse<T>(responsePromise: Promise<Response>): Promise<T> {
  const response = await responsePromise;
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function normalizeMatchInfoDraft(payload?: Partial<MatchInfoDraft> | null): MatchInfoDraft {
  const base = emptyMatchInfo();
  return {
    matchId: String(payload?.matchId ?? base.matchId).trim(),
    teamAName: String(payload?.teamAName ?? base.teamAName).trim(),
    teamACode: String(payload?.teamACode ?? base.teamACode).trim(),
    teamALogoUrl: String(payload?.teamALogoUrl ?? base.teamALogoUrl).trim(),
    teamBName: String(payload?.teamBName ?? base.teamBName).trim(),
    teamBCode: String(payload?.teamBCode ?? base.teamBCode).trim(),
    teamBLogoUrl: String(payload?.teamBLogoUrl ?? base.teamBLogoUrl).trim(),
    gatesOpen: String(payload?.gatesOpen ?? base.gatesOpen).trim(),
    city: String(payload?.city ?? base.city).trim(),
    date: String(payload?.date ?? base.date).trim(),
    kickoffTime: String(payload?.kickoffTime ?? base.kickoffTime).trim(),
    venue: String(payload?.venue ?? base.venue).trim(),
  };
}

export function matchInfoToDraft(match?: MatchInfo | null): MatchInfoDraft {
  return normalizeMatchInfoDraft({
    matchId: match?.matchId ?? "",
    teamAName: match?.teamA?.name ?? "",
    teamACode: match?.teamA?.code ?? "",
    teamALogoUrl: match?.teamA?.logoUrl ?? "",
    teamBName: match?.teamB?.name ?? "",
    teamBCode: match?.teamB?.code ?? "",
    teamBLogoUrl: match?.teamB?.logoUrl ?? "",
    gatesOpen: match?.gatesOpen ?? "",
    city: match?.city ?? "",
    date: match?.date ?? "",
    kickoffTime: match?.kickoffTime ?? "",
    venue: match?.venue ?? "",
  });
}

function draftToMatchPatch(draft: MatchInfoDraft): MatchInfo {
  const normalized = normalizeMatchInfoDraft(draft);
  return {
    matchId: normalized.matchId || null,
    teamA: {
      name: normalized.teamAName || null,
      code: normalized.teamACode || null,
      logoUrl: normalized.teamALogoUrl || null,
    },
    teamB: {
      name: normalized.teamBName || null,
      code: normalized.teamBCode || null,
      logoUrl: normalized.teamBLogoUrl || null,
    },
    gatesOpen: normalized.gatesOpen || null,
    city: normalized.city || null,
    date: normalized.date || null,
    kickoffTime: normalized.kickoffTime || null,
    venue: normalized.venue || null,
  };
}

export const api = {
  getCueSheet: () => parseResponse<CueSheetSnapshot>(fetch("/api/cuesheet")),
  importDefault: () =>
    parseResponse<CueSheetSnapshot>(
      fetch("/api/cuesheet/import-default", { method: "POST" }),
    ),
  addEvent: (payload: Partial<CueEvent>) =>
    parseResponse<CueSheetSnapshot>(
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updateEvent: (id: string, payload: Partial<CueEvent>) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteEvent: (id: string) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${id}`, { method: "DELETE" }),
    ),
  reorderEvents: (orderedIds: string[]) =>
    parseResponse<CueSheetSnapshot>(
      fetch("/api/events/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      }),
    ),
  saveMatchInfo: (payload: MatchInfoDraft) =>
    parseResponse<CueSheetSnapshot>(
      fetch("/api/cuesheet/match", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToMatchPatch(payload)),
      }),
    ),
  importXlsx: async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    return parseResponse<CueSheetSnapshot>(
      fetch("/api/cuesheet/import-xlsx", {
        method: "POST",
        body: data,
      }),
    );
  },
};
