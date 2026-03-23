export const PHASES = [
  { key: "GATES_OPEN", label: "Gates Open", offsetMinutes: -120 },
  { key: "KICK_OFF", label: "Kick Off (Local Time)", offsetMinutes: 0 },
  { key: "HT_HALF_TIME", label: "Half Time", offsetMinutes: 45 },
  { key: "SECOND_HALF_KICK_OFF", label: "Kick Off 2nd Half (Local Time)", offsetMinutes: 60 },
  { key: "FULL_TIME", label: "Full Time", offsetMinutes: 105 },
] as const;

export type EventPhase = {
  key: string;
  label: string;
  offsetMinutes: number;
};

export type PhaseKey = string;

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
  tournamentId?: string | null;
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
  tournamentId?: string | null;
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
  tournamentId?: string | null;
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
  groupId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
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

export type Tournament = {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  federation?: string | null;
  logoUrl?: string | null;
  keyPeople: string[];
  matchesCount?: number | null;
  format?: string | null;
  teamsCount?: number | null;
  hostCountries: string[];
  eventPhases: EventPhase[];
  createdAt: string;
  updatedAt: string;
};

export type TeamPlayer = {
  id: string;
  name: string;
  number?: number | null;
  position?: string | null;
};

export type Team = {
  id: string;
  tournamentId?: string | null;
  name: string;
  country?: string | null;
  tricode?: string | null;
  logoUrl?: string | null;
  players: TeamPlayer[];
  createdAt: string;
  updatedAt: string;
};

export type PageKey =
  | "events"
  | "activations"
  | "venues"
  | "teams"
  | "tournaments"
  | "personnel"
  | "cuesheet";

export type Privileges = Record<string, Record<string, boolean>>;

export type UserAccount = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  department?: string | null;
  organization?: string | null;
  active: boolean;
  isSuperAdmin: boolean;
  privileges: Privileges;
  createdAt: string;
  updatedAt: string;
};

export type PersonnelExpense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date?: string | null;
  vendor?: string | null;
  notes?: string | null;
};

export type PersonnelFinanceData = {
  amount?: number | null;
  currency?: string | null;
  vendor?: string | null;
  documentDate?: string | null;
  summary?: string | null;
  parsedExpenses?: PersonnelExpense[];
};

export type ParsedPersonnelFinance = {
  amount: number | null;
  currency: string;
  vendor: string | null;
  documentDate: string | null;
  summary: string;
  notes?: string | null;
  expenses: PersonnelExpense[];
  source?: string;
  parserError?: string;
};

export type PersonnelDocument = {
  id: string;
  name: string;
  category: "compliance" | "finance" | "misc";
  fileName?: string | null;
  fileUrl?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedAt: string;
  notes?: string | null;
  compliance?: {
    documentType?: string | null;
    referenceCode?: string | null;
  };
  finance?: PersonnelFinanceData;
  misc?: {
    tags?: string[];
  };
};

export type PersonnelRecord = {
  id: string;
  tournamentId?: string | null;
  userId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  organization?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
  offer: {
    duration?: string | null;
    compensation?: string | null;
    benefits: string[];
  };
  role?: string | null;
  department?: string | null;
  managerUserId?: string | null;
  placeOfService?: string | null;
  expenses: PersonnelExpense[];
  documents: PersonnelDocument[];
  createdAt: string;
  updatedAt: string;
};

export type PersonnelDocumentUpsertPayload = {
  file?: File | null;
  category: "compliance" | "finance" | "misc";
  name: string;
  notes?: string;
  complianceType?: string;
  complianceReference?: string;
  financeAmount?: string;
  financeCurrency?: string;
  financeVendor?: string;
  financeDate?: string;
  financeSummary?: string;
  parsedExpenses?: PersonnelExpense[];
  miscTags?: string;
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

let currentUserId = "super-admin";

export function setApiUser(userId: string) {
  currentUserId = userId?.trim() || "super-admin";
}

function authedFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("x-user-id", currentUserId);
  return fetch(input, { ...init, headers });
}

export function hasPrivilege(
  user: UserAccount | null | undefined,
  page: string,
  action: string,
): boolean {
  if (!user) return false;
  if (user.role === "super_admin" || user.isSuperAdmin) return true;
  return Boolean(user.privileges?.[page]?.[action]);
}

function withTournamentQuery(path: string, tournamentId?: string | null) {
  if (!tournamentId?.trim()) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}tournamentId=${encodeURIComponent(tournamentId)}`;
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
  getTournaments: () => parseResponse<Tournament[]>(authedFetch("/api/tournaments")),
  createTournament: (payload: {
    name: string;
    startDate?: string | null;
    endDate?: string | null;
    federation?: string | null;
    logoUrl?: string | null;
    keyPeople?: string[];
    matchesCount?: number | null;
    format?: string | null;
    teamsCount?: number | null;
    hostCountries?: string[];
    eventPhases?: EventPhase[];
  }) =>
    parseResponse<Tournament>(
      authedFetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updateTournament: (
    tournamentId: string,
    payload: {
      name?: string;
      startDate?: string | null;
      endDate?: string | null;
      federation?: string | null;
      logoUrl?: string | null;
      keyPeople?: string[];
      matchesCount?: number | null;
      format?: string | null;
      teamsCount?: number | null;
      hostCountries?: string[];
      eventPhases?: EventPhase[];
    },
  ) =>
    parseResponse<Tournament>(
      authedFetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteTournament: (tournamentId: string) =>
    parseResponse<Tournament>(
      authedFetch(`/api/tournaments/${tournamentId}`, {
        method: "DELETE",
      }),
    ),
  getEvents: (tournamentId?: string | null) =>
    parseResponse<PlannerEventSummary[]>(authedFetch(withTournamentQuery("/api/events", tournamentId))),
  getActivations: (tournamentId?: string | null) =>
    parseResponse<Activation[]>(authedFetch(withTournamentQuery("/api/activations", tournamentId))),
  createActivation: (payload: {
    name: string;
    tournamentId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    durationMs?: number;
    tags?: string[];
  }) =>
    parseResponse<Activation>(
      authedFetch(withTournamentQuery("/api/activations", payload.tournamentId), {
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
      authedFetch(`/api/activations/${activationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteActivation: (activationId: string) =>
    parseResponse<Activation>(
      authedFetch(`/api/activations/${activationId}`, {
        method: "DELETE",
      }),
    ),
  uploadActivation: async (file: File, tags: string[], tournamentId?: string | null) => {
    const data = new FormData();
    data.append("file", file);
    data.append("tags", tags.join(","));
    return parseResponse<Activation>(
      authedFetch(withTournamentQuery("/api/activations/upload", tournamentId), {
        method: "POST",
        body: data,
      }),
    );
  },
  getVenues: (tournamentId?: string | null) =>
    parseResponse<Venue[]>(authedFetch(withTournamentQuery("/api/venues", tournamentId))),
  getTeams: (tournamentId?: string | null) =>
    parseResponse<Team[]>(authedFetch(withTournamentQuery("/api/teams", tournamentId))),
  createTeam: (payload: {
    name: string;
    tournamentId?: string;
    country?: string | null;
    tricode?: string | null;
    logoUrl?: string | null;
    players?: Array<{
      id?: string;
      name: string;
      number?: number | null;
      position?: string | null;
    }>;
  }) =>
    parseResponse<Team>(
      authedFetch(withTournamentQuery("/api/teams", payload.tournamentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updateTeam: (
    teamId: string,
    payload: Partial<{
      name: string;
      country: string | null;
      tricode: string | null;
      logoUrl: string | null;
      players: TeamPlayer[];
    }>,
  ) =>
    parseResponse<Team>(
      authedFetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteTeam: (teamId: string) =>
    parseResponse<Team>(
      authedFetch(`/api/teams/${teamId}`, {
        method: "DELETE",
      }),
    ),
  createVenue: (payload: {
    name: string;
    tournamentId?: string;
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
      authedFetch(withTournamentQuery("/api/venues", payload.tournamentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  createPlannerEvent: (payload: { name?: string; match?: MatchInfo; tournamentId?: string }) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(withTournamentQuery("/api/events", payload.tournamentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updatePlannerEvent: (
    eventId: string,
    payload: { name?: string; match?: MatchInfo; tournamentId?: string },
  ) =>
    (() => {
      const { tournamentId, ...body } = payload;
      return parseResponse<CueSheetSnapshot>(
        authedFetch(withTournamentQuery(`/api/events/${eventId}`, tournamentId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    })(),
  deletePlannerEvent: (eventId: string, tournamentId?: string | null) =>
    parseResponse<PlannerEventSummary>(
      authedFetch(withTournamentQuery(`/api/events/${eventId}`, tournamentId), {
        method: "DELETE",
      }),
    ),
  getCueSheet: (eventId: string) =>
    parseResponse<CueSheetSnapshot>(authedFetch(`/api/events/${eventId}/cuesheet`)),
  importDefault: (eventId: string) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/cuesheet/import-default`, { method: "POST" }),
    ),
  addRow: (eventId: string, payload: Partial<CueEvent>) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updateRow: (eventId: string, rowId: string, payload: Partial<CueEvent>) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteRow: (eventId: string, rowId: string) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/rows/${rowId}`, { method: "DELETE" }),
    ),
  reorderRows: (eventId: string, orderedIds: string[]) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/rows/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      }),
    ),
  restoreRows: (eventId: string, rows: CueEvent[]) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/rows/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      }),
    ),
  saveMatchInfo: (eventId: string, payload: MatchInfoDraft) =>
    parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToMatchPatch(payload)),
      }),
    ),
  importXlsx: async (eventId: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return parseResponse<CueSheetSnapshot>(
      authedFetch(`/api/events/${eventId}/cuesheet/import-xlsx`, {
        method: "POST",
        body: data,
      }),
    );
  },
  getCurrentUser: () => parseResponse<UserAccount>(authedFetch("/api/current-user")),
  getUsers: () => parseResponse<UserAccount[]>(authedFetch("/api/users")),
  createUser: (payload: {
    firstName: string;
    lastName?: string;
    email: string;
    password: string;
    role?: string;
    department?: string | null;
    organization?: string | null;
    active?: boolean;
    privileges?: Privileges;
  }) =>
    parseResponse<UserAccount>(
      authedFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updateUser: (
    userId: string,
    payload: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      role: string;
      department: string | null;
      organization: string | null;
      active: boolean;
      privileges: Privileges;
    }>,
  ) =>
    parseResponse<UserAccount>(
      authedFetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deleteUser: (userId: string) =>
    parseResponse<UserAccount>(
      authedFetch(`/api/users/${userId}`, {
        method: "DELETE",
      }),
    ),
  getPersonnel: (tournamentId?: string | null) =>
    parseResponse<PersonnelRecord[]>(authedFetch(withTournamentQuery("/api/personnel", tournamentId))),
  createPersonnel: (
    payload: Partial<PersonnelRecord> & { firstName: string; tournamentId?: string | null },
  ) =>
    parseResponse<PersonnelRecord>(
      authedFetch(withTournamentQuery("/api/personnel", payload.tournamentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  updatePersonnel: (personnelId: string, payload: Partial<PersonnelRecord>) =>
    parseResponse<PersonnelRecord>(
      authedFetch(`/api/personnel/${personnelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  deletePersonnel: (personnelId: string) =>
    parseResponse<PersonnelRecord>(
      authedFetch(`/api/personnel/${personnelId}`, {
        method: "DELETE",
      }),
    ),
  uploadPersonnelDocument: (personnelId: string, payload: PersonnelDocumentUpsertPayload) => {
    const data = new FormData();
    if (payload.file) data.append("file", payload.file);
    data.append("category", payload.category);
    data.append("name", payload.name || "");
    data.append("notes", payload.notes || "");
    data.append("complianceType", payload.complianceType || "");
    data.append("complianceReference", payload.complianceReference || "");
    data.append("financeAmount", payload.financeAmount || "");
    data.append("financeCurrency", payload.financeCurrency || "");
    data.append("financeVendor", payload.financeVendor || "");
    data.append("financeDate", payload.financeDate || "");
    data.append("financeSummary", payload.financeSummary || "");
    data.append("miscTags", payload.miscTags || "");
    data.append("parsedExpenses", JSON.stringify(Array.isArray(payload.parsedExpenses) ? payload.parsedExpenses : []));
    return parseResponse<PersonnelDocument>(
      authedFetch(`/api/personnel/${personnelId}/documents`, {
        method: "POST",
        body: data,
      }),
    );
  },
  updatePersonnelDocument: (
    personnelId: string,
    documentId: string,
    payload: PersonnelDocumentUpsertPayload,
  ) => {
    const data = new FormData();
    if (payload.file) data.append("file", payload.file);
    data.append("category", payload.category);
    data.append("name", payload.name || "");
    data.append("notes", payload.notes || "");
    data.append("complianceType", payload.complianceType || "");
    data.append("complianceReference", payload.complianceReference || "");
    data.append("financeAmount", payload.financeAmount || "");
    data.append("financeCurrency", payload.financeCurrency || "");
    data.append("financeVendor", payload.financeVendor || "");
    data.append("financeDate", payload.financeDate || "");
    data.append("financeSummary", payload.financeSummary || "");
    data.append("miscTags", payload.miscTags || "");
    data.append("parsedExpenses", JSON.stringify(Array.isArray(payload.parsedExpenses) ? payload.parsedExpenses : []));
    return parseResponse<PersonnelDocument>(
      authedFetch(`/api/personnel/${personnelId}/documents/${documentId}`, {
        method: "PATCH",
        body: data,
      }),
    );
  },
  deletePersonnelDocument: (personnelId: string, documentId: string) =>
    parseResponse<PersonnelDocument>(
      authedFetch(`/api/personnel/${personnelId}/documents/${documentId}`, {
        method: "DELETE",
      }),
    ),
  parsePersonnelExpenses: (text: string) =>
    parseResponse<PersonnelExpense[]>(
      authedFetch("/api/personnel/expenses/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }),
    ),
  parsePersonnelFinanceFromPdf: (file: File) => {
    const data = new FormData();
    data.append("file", file);
    return parseResponse<ParsedPersonnelFinance>(
      authedFetch("/api/personnel/expenses/parse-pdf", {
        method: "POST",
        body: data,
      }),
    );
  },
};

