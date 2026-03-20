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
  venueId?: string | null;
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
  venueId: string;
  gatesOpen: string;
  city: string;
  date: string;
  kickoffTime: string;
  venue: string;
};

export type PlannerEventSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  totalRows: number;
  sourceFile?: string | null;
  importedAt?: string | null;
  match?: MatchInfo | null;
};

export type Venue = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  tech?: {
    screens?: Array<{
      id: string;
      type: "ribbon" | "giant_screen" | "fascia";
      res: { x: number; y: number };
      framerate: number;
      codec: string;
      referencePic?: {
        name?: string | null;
        mime?: string | null;
        data?: string | null;
      } | null;
    }>;
    speakers?: Array<{
      id: string;
      name: string;
      zone?: string | null;
      notes?: string | null;
    }>;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type Activation = {
  id: string;
  name: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type CueEvent = {
  id: string;
  rowOrder: number;
  timecode: string;
  phase: PhaseKey;
  category: string;
  cue: string;
  asset: string;
  operator: string;
  audio: string;
  script: string;
  activationId?: string | null;
  screenTargets?: Array<{ screenId: string; screenLabel: string; value: string }>;
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
  event: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
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

export function emptyMatchInfo(): MatchInfoDraft {
  return {
    matchId: "",
    teamAName: "",
    teamACode: "",
    teamALogoUrl: "",
    teamBName: "",
    teamBCode: "",
    teamBLogoUrl: "",
    venueId: "",
    gatesOpen: "",
    city: "",
    date: "",
    kickoffTime: "",
    venue: "",
  };
}

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
    venueId: String(payload?.venueId ?? base.venueId).trim(),
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
    venueId: match?.venueId ?? "",
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
    venueId: normalized.venueId || null,
    gatesOpen: normalized.gatesOpen || null,
    city: normalized.city || null,
    date: normalized.date || null,
    kickoffTime: normalized.kickoffTime || null,
    venue: normalized.venue || null,
  };
}

export const api = {
  getEvents: () => parseResponse<PlannerEventSummary[]>(fetch("/api/events")),
  getActivations: () => parseResponse<Activation[]>(fetch("/api/activations")),
  createActivation: (payload: {
    name: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    durationMs?: number;
    tags?: string[];
  }) =>
    parseResponse<Activation>(
      fetch("/api/activations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updateActivation: (
    activationId: string,
    payload: {
      name?: string;
      fileName?: string | null;
      mimeType?: string | null;
      sizeBytes?: number | null;
      durationMs?: number | null;
      tags?: string[];
    },
  ) =>
    parseResponse<Activation>(
      fetch(`/api/activations/${activationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteActivation: (activationId: string) =>
    parseResponse<Activation>(
      fetch(`/api/activations/${activationId}`, {
        method: "DELETE",
      }),
    ),
  uploadActivation: async (file: File, tags: string[]) => {
    const data = new FormData();
    data.append("file", file);
    data.append("tags", tags.join(","));
    return parseResponse<Activation>(
      fetch("/api/activations/upload", {
        method: "POST",
        body: data,
      }),
    );
  },
  getVenues: () => parseResponse<Venue[]>(fetch("/api/venues")),
  createVenue: (payload: {
    name: string;
    city?: string;
    address?: string;
    tech?: {
      screens?: Array<{
        id?: string;
        type: "ribbon" | "giant_screen" | "fascia";
        res?: { x?: number; y?: number };
        framerate?: number;
        codec?: string;
        referencePic?: { name?: string; mime?: string; data?: string } | null;
      }>;
      speakers?: Array<{ id?: string; name: string; zone?: string; notes?: string }>;
    };
  }) =>
    parseResponse<Venue>(
      fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  createPlannerEvent: (payload: { name?: string; match?: MatchInfo }) =>
    parseResponse<CueSheetSnapshot>(
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updatePlannerEvent: (eventId: string, payload: { name?: string; match?: MatchInfo }) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deletePlannerEvent: (eventId: string) =>
    parseResponse<PlannerEventSummary>(
      fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      }),
    ),
  getCueSheet: (eventId: string) =>
    parseResponse<CueSheetSnapshot>(fetch(`/api/events/${eventId}/cuesheet`)),
  importDefault: (eventId: string) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}/cuesheet/import-default`, { method: "POST" }),
    ),
  addRow: (eventId: string, payload: Partial<CueEvent>) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updateRow: (eventId: string, rowId: string, payload: Partial<CueEvent>) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteRow: (eventId: string, rowId: string) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}/rows/${rowId}`, { method: "DELETE" }),
    ),
  reorderRows: (eventId: string, orderedIds: string[]) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}/rows/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      }),
    ),
  saveMatchInfo: (eventId: string, payload: MatchInfoDraft) =>
    parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToMatchPatch(payload)),
      }),
    ),
  importXlsx: async (eventId: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return parseResponse<CueSheetSnapshot>(
      fetch(`/api/events/${eventId}/cuesheet/import-xlsx`, {
        method: "POST",
        body: data,
      }),
    );
  },
};
