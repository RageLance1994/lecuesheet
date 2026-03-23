import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "cuesheet.json");
const DEFAULT_TOURNAMENT_ID = "test-tournament";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB || "ATSMainBKP";
const MONGODB_COLLECTION = "planner_state";
const MONGODB_STATE_ID = "primary";
let mongoClientPromise = null;

function createDefaultMatchTeam() {
  return {
    name: null,
    code: null,
    logoUrl: null,
  };
}

function createDefaultMatchInfo() {
  return {
    matchId: null,
    teamA: createDefaultMatchTeam(),
    teamB: createDefaultMatchTeam(),
    venueId: null,
    city: null,
    date: null,
    gatesOpen: null,
    kickoffTime: null,
    venue: null,
  };
}

export const PHASES = [
  { key: "GATES_OPEN", label: "Gates Open", offsetMinutes: -120 },
  { key: "KICK_OFF", label: "Kick Off (Local Time)", offsetMinutes: 0 },
  { key: "HT_HALF_TIME", label: "Half Time", offsetMinutes: 45 },
  { key: "SECOND_HALF_KICK_OFF", label: "Kick Off 2nd Half (Local Time)", offsetMinutes: 60 },
  { key: "FULL_TIME", label: "Full Time", offsetMinutes: 105 },
];
const DEFAULT_EVENT_PHASES = PHASES;
const DEFAULT_KICKOFF_SECONDS = 15 * 3600;

const DEFAULT_METADATA = {
  name: "Live Engine Cue Sheet",
  sourceFile: null,
  importedAt: null,
  updatedAt: null,
  match: createDefaultMatchInfo(),
};

const DEFAULT_STATE = {
  events: [],
  venues: [],
  activations: [],
  teams: [],
  tournaments: [],
  users: [],
  personnel: [],
};

const PAGE_ACTIONS = {
  events: ["view", "create", "edit", "delete", "import"],
  activations: ["view", "create", "edit", "delete", "upload"],
  venues: ["view", "create", "edit", "delete"],
  teams: ["view", "create", "edit", "delete"],
  tournaments: ["view", "create", "edit", "delete"],
  personnel: ["view", "create", "edit", "delete", "manageUsers", "managePrivileges"],
  cuesheet: ["view", "edit", "import", "reorder"],
};

function getMongoClient() {
  if (!mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    mongoClientPromise = client.connect().then(() => client);
  }
  return mongoClientPromise;
}

async function getStateCollection() {
  const client = await getMongoClient();
  return client.db(MONGODB_DB).collection(MONGODB_COLLECTION);
}

async function ensureStorage() {
  const collection = await getStateCollection();
  const existing = await collection.findOne({ _id: MONGODB_STATE_ID });
  if (existing?.state) return;

  let seededState = structuredClone(DEFAULT_STATE);
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      seededState = normalizeState(JSON.parse(raw));
    } catch {
      seededState = structuredClone(DEFAULT_STATE);
    }
  }

  await collection.updateOne(
    { _id: MONGODB_STATE_ID },
    { $set: { state: seededState, updatedAt: nowIso() } },
    { upsert: true },
  );
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sanitizeOptionalText(value) {
  const text = sanitizeText(value);
  return text || null;
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

function normalizePhaseKey(value, index) {
  const text = sanitizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || `PHASE_${index + 1}`;
}

function parseClockToSeconds(value) {
  const text = sanitizeText(value);
  if (/^\d{2}:\d{2}$/.test(text)) {
    const [h, m] = text.split(":").map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 3600 + m * 60;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    const [h, m, s] = text.split(":").map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59) return h * 3600 + m * 60 + s;
  }
  return null;
}

function normalizeEventPhase(item, index) {
  const source = item && typeof item === "object" ? item : {};
  const fallbackOffset = Number(DEFAULT_EVENT_PHASES[index]?.offsetMinutes ?? 0);
  const key = normalizePhaseKey(source.key ?? source.label, index);
  const label = sanitizeText(source.label) || key.replaceAll("_", " ");
  const explicitOffset = Number(source.offsetMinutes);
  const legacyStartSeconds = parseClockToSeconds(source.start);
  const legacyKickoffSeconds = parseClockToSeconds(source.kickoffStart);
  const kickoffReference = legacyKickoffSeconds ?? DEFAULT_KICKOFF_SECONDS;
  const derivedOffset = legacyStartSeconds === null
    ? null
    : Math.round((legacyStartSeconds - kickoffReference) / 60);
  return {
    key,
    label,
    offsetMinutes: Number.isFinite(explicitOffset)
      ? Math.round(explicitOffset)
      : (derivedOffset ?? fallbackOffset),
  };
}

function normalizeEventPhases(phases) {
  const source = Array.isArray(phases) && phases.length > 0 ? phases : DEFAULT_EVENT_PHASES;
  const dedupe = new Set();
  const normalized = [];
  for (let index = 0; index < source.length; index += 1) {
    const phase = normalizeEventPhase(source[index], index);
    if (dedupe.has(phase.key)) continue;
    dedupe.add(phase.key);
    normalized.push(phase);
  }
  return normalized.length > 0 ? normalized : structuredClone(DEFAULT_EVENT_PHASES);
}

function phaseOrderFromPhases(eventPhases) {
  return normalizeEventPhases(eventPhases).map((phase) => phase.key);
}

function kickoffBaseSecondsFromPhases(eventPhases, kickoffTime = null) {
  const parsedKickoff = parseClockToSeconds(kickoffTime);
  if (parsedKickoff !== null) return parsedKickoff;
  const kickoffPhase = findPhaseByKeywords(eventPhases, ["KICK OFF", "KICKOFF", "TIP OFF", "TIPOFF"]);
  const kickoffOffset = Number(kickoffPhase?.offsetMinutes ?? 0);
  return DEFAULT_KICKOFF_SECONDS - kickoffOffset * 60;
}

function findPhaseByKeywords(eventPhases, keywords) {
  const phases = normalizeEventPhases(eventPhases);
  return phases.find((phase) => {
    const haystack = `${phase.key} ${phase.label}`.toUpperCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

function normalizeMatchTeam(team) {
  const source = team && typeof team === "object" ? team : {};
  return {
    name: sanitizeOptionalText(source.name),
    code: sanitizeOptionalText(source.code),
    logoUrl: sanitizeOptionalText(source.logoUrl),
  };
}

function normalizeMatchInfo(match) {
  const source = match && typeof match === "object" ? match : {};
  return {
    matchId: sanitizeOptionalText(source.matchId),
    teamA: normalizeMatchTeam(source.teamA),
    teamB: normalizeMatchTeam(source.teamB),
    venueId: sanitizeOptionalText(source.venueId),
    city: sanitizeOptionalText(source.city),
    date: sanitizeOptionalText(source.date),
    gatesOpen: sanitizeOptionalText(source.gatesOpen),
    kickoffTime: sanitizeOptionalText(source.kickoffTime),
    venue: sanitizeOptionalText(source.venue),
  };
}

function normalizeMetadata(metadata) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  return {
    ...DEFAULT_METADATA,
    ...source,
    match: normalizeMatchInfo(source.match),
  };
}

function createDefaultVenueTech() {
  return {
    screens: [],
    speakers: [],
  };
}

const ALLOWED_SCREEN_TYPES = new Set(["ribbon", "giant_screen", "fascia"]);

function normalizeReferencePic(referencePic) {
  const source = referencePic && typeof referencePic === "object" ? referencePic : {};
  return {
    name: sanitizeOptionalText(source.name),
    mime: sanitizeOptionalText(source.mime),
    data: sanitizeOptionalText(source.data),
  };
}

function normalizeScreen(screen) {
  const source = screen && typeof screen === "object" ? screen : {};
  const type = sanitizeText(source.type).toLowerCase();
  const resSource = source.res && typeof source.res === "object" ? source.res : {};
  const x = Number(resSource.x);
  const y = Number(resSource.y);
  const framerate = Number(source.framerate);

  return {
    id: sanitizeText(source.id) || randomUUID(),
    type: ALLOWED_SCREEN_TYPES.has(type) ? type : "giant_screen",
    res: {
      x: Number.isFinite(x) && x > 0 ? Math.round(x) : 1920,
      y: Number.isFinite(y) && y > 0 ? Math.round(y) : 1080,
    },
    framerate: Number.isFinite(framerate) && framerate > 0 ? Math.round(framerate) : 60,
    codec: sanitizeText(source.codec) || ".mov",
    referencePic: normalizeReferencePic(source.referencePic),
  };
}

function normalizeSpeaker(speaker) {
  const source = speaker && typeof speaker === "object" ? speaker : {};
  return {
    id: sanitizeText(source.id) || randomUUID(),
    name: sanitizeText(source.name) || "Speaker",
    zone: sanitizeOptionalText(source.zone),
    notes: sanitizeOptionalText(source.notes),
  };
}

function normalizeVenueTech(tech) {
  const source = tech && typeof tech === "object" ? tech : {};
  const legacyAudio = Array.isArray(source.audio) ? source.audio : [];
  return {
    screens: Array.isArray(source.screens)
      ? source.screens.map((item) => normalizeScreen(item))
      : [],
    speakers: Array.isArray(source.speakers)
      ? source.speakers.map((item) => normalizeSpeaker(item))
      : legacyAudio.map((item) => normalizeSpeaker({ name: sanitizeText(item) || "Speaker" })),
  };
}

function normalizeVenue(venue) {
  const source = venue && typeof venue === "object" ? venue : {};
  return {
    id: sanitizeText(source.id) || randomUUID(),
    tournamentId: sanitizeOptionalText(source.tournamentId),
    name: sanitizeText(source.name) || "Untitled Venue",
    city: sanitizeOptionalText(source.city),
    address: sanitizeOptionalText(source.address),
    tech: normalizeVenueTech(source.tech ?? createDefaultVenueTech()),
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso(),
  };
}

function normalizeActivation(activation) {
  const source = activation && typeof activation === "object" ? activation : {};
  const tags = Array.isArray(source.tags)
    ? source.tags.map((item) => sanitizeText(item)).filter(Boolean)
    : [];
  return {
    id: sanitizeText(source.id) || randomUUID(),
    tournamentId: sanitizeOptionalText(source.tournamentId),
    name: sanitizeText(source.name) || "Untitled Activation",
    fileName: sanitizeOptionalText(source.fileName),
    mimeType: sanitizeOptionalText(source.mimeType),
    sizeBytes: Number.isFinite(Number(source.sizeBytes)) ? Number(source.sizeBytes) : null,
    durationMs: Number.isFinite(Number(source.durationMs)) ? Number(source.durationMs) : null,
    tags,
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso(),
  };
}

function normalizeScreenTarget(item) {
  const source = item && typeof item === "object" ? item : {};
  return {
    screenId: sanitizeText(source.screenId) || randomUUID(),
    screenLabel: sanitizeText(source.screenLabel) || "Screen",
    value: sanitizeText(source.value),
  };
}

function phaseFromCue(cue, eventPhases = DEFAULT_EVENT_PHASES) {
  const text = sanitizeText(cue).toUpperCase();
  const phases = normalizeEventPhases(eventPhases);
  const fallback = phases[0]?.key || "GATES_OPEN";
  if (!text) return fallback;

  if (text.includes("FULL TIME") || text.includes("FINAL") || text.includes("END OF GAME")) {
    return findPhaseByKeywords(phases, ["FULL TIME", "FINAL", "END OF GAME"])?.key || fallback;
  }
  if (text.includes("2ND HALF") || text.includes("SECOND HALF") || text.includes("Q3") || text.includes("3RD QUARTER")) {
    return findPhaseByKeywords(phases, ["2ND HALF", "SECOND HALF", "Q3", "3RD QUARTER"])?.key || fallback;
  }
  if (text.includes("HALF TIME") || text.includes("HALFTIME") || text.includes("HT") || text.includes("INTERVAL")) {
    return findPhaseByKeywords(phases, ["HALF TIME", "HALFTIME", "HT", "INTERVAL"])?.key || fallback;
  }
  if (text.includes("KICK OFF") || text.includes("KICKOFF") || text.includes("TIP OFF") || text.includes("TIPOFF")) {
    return findPhaseByKeywords(phases, ["KICK OFF", "KICKOFF", "TIP OFF", "TIPOFF", "START"])?.key || fallback;
  }
  if (text.includes("GATES OPEN") || text.includes("DOORS OPEN") || text.includes("PREGAME") || text.includes("PRE GAME")) {
    return findPhaseByKeywords(phases, ["GATES OPEN", "DOORS OPEN", "PREGAME", "PRE GAME"])?.key || fallback;
  }

  return fallback;
}

function phaseStartSeconds(phaseKey, eventPhases = DEFAULT_EVENT_PHASES, kickoffBaseSeconds = DEFAULT_KICKOFF_SECONDS) {
  const phases = normalizeEventPhases(eventPhases);
  const phase = phases.find((item) => item.key === phaseKey) ?? phases[0];
  const offsetMinutes = Number(phase?.offsetMinutes ?? 0);
  return kickoffBaseSeconds + Math.round(offsetMinutes) * 60;
}

function formatSeconds(totalSeconds) {
  const normalized = Math.max(0, totalSeconds);
  const h = String(Math.floor(normalized / 3600)).padStart(2, "0");
  const m = String(Math.floor((normalized % 3600) / 60)).padStart(2, "0");
  const s = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function normalizeRow(event, actor, rowOrder, eventPhases = DEFAULT_EVENT_PHASES) {
  const phaseOrder = phaseOrderFromPhases(eventPhases);
  const phase = phaseOrder.includes(event.phase) ? event.phase : phaseFromCue(event.cue, eventPhases);
  return {
    id: event.id ?? randomUUID(),
    rowOrder,
    timecode: sanitizeText(event.timecode),
    phase,
    category: sanitizeText(event.category),
    cue: sanitizeText(event.cue),
    asset: sanitizeText(event.asset),
    operator: sanitizeText(event.operator),
    audio: sanitizeText(event.audio),
    script: sanitizeText(event.script),
    activationId: sanitizeOptionalText(event.activationId),
    screenTargets: Array.isArray(event.screenTargets)
      ? event.screenTargets.map((item) => normalizeScreenTarget(item))
      : [],
    status: sanitizeText(event.status) || "pending",
    notes: sanitizeText(event.notes),
    sourceRow: event.sourceRow ?? null,
    updatedAt: nowIso(),
    updatedBy: actor || "system",
    raw: event.raw ?? {},
  };
}

function rebuildTimeline(rows, eventPhases = DEFAULT_EVENT_PHASES, kickoffTime = null) {
  const phaseOrder = phaseOrderFromPhases(eventPhases);
  const kickoffBaseSeconds = kickoffBaseSecondsFromPhases(eventPhases, kickoffTime);
  const counters = new Map(phaseOrder.map((key) => [key, 0]));
  return rows.map((row, index) => {
    const phase = phaseOrder.includes(row.phase) ? row.phase : phaseFromCue(row.cue, eventPhases);
    const offset = counters.get(phase) ?? 0;
    counters.set(phase, offset + 1);
    return {
      ...row,
      phase,
      rowOrder: index,
      timecode: formatSeconds(phaseStartSeconds(phase, eventPhases, kickoffBaseSeconds) + offset * 30),
    };
  });
}

function pushVersion(record, entry) {
  const versionEntry = {
    id: randomUUID(),
    timestamp: nowIso(),
    ...entry,
  };
  record.versions = [versionEntry, ...(record.versions ?? [])].slice(0, 2000);
}

function createEventRecord({
  id,
  tournamentId,
  name,
  metadata,
  rows,
  versions,
  createdAt,
  updatedAt,
  eventPhases,
}) {
  const safeMetadata = normalizeMetadata(metadata);
  const safeEventPhases = normalizeEventPhases(eventPhases);
  const normalizedRows = rebuildTimeline(
    (rows ?? []).map((row, index) => normalizeRow(row, "system", index, safeEventPhases)),
    safeEventPhases,
    safeMetadata.match?.kickoffTime ?? null,
  );
  return {
    id: id || randomUUID(),
    tournamentId: sanitizeOptionalText(tournamentId),
    name: sanitizeText(name) || safeMetadata.match.matchId || "Untitled Event",
    createdAt: createdAt || nowIso(),
    updatedAt: updatedAt || nowIso(),
    metadata: safeMetadata,
    rows: normalizedRows,
    versions: Array.isArray(versions) ? versions : [],
  };
}

function normalizeEventRecord(record, eventPhases = DEFAULT_EVENT_PHASES) {
  if (!record || typeof record !== "object") {
    return createEventRecord({ eventPhases });
  }
  return createEventRecord({
    id: record.id,
    tournamentId: record.tournamentId,
    name: record.name,
    metadata: record.metadata,
    rows: record.rows,
    versions: record.versions,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    eventPhases,
  });
}

function normalizeTournament(tournament) {
  const source = tournament && typeof tournament === "object" ? tournament : {};
  const rawFormat = sanitizeOptionalText(source.format);
  const normalizedFormat = rawFormat === "Eliminazione diretta" ? "Single elimination" : rawFormat;
  return {
    id: sanitizeText(source.id) || randomUUID(),
    name: sanitizeText(source.name) || "Untitled Tournament",
    startDate: sanitizeOptionalText(source.startDate),
    endDate: sanitizeOptionalText(source.endDate),
    federation: sanitizeOptionalText(source.federation),
    logoUrl: sanitizeOptionalText(source.logoUrl),
    keyPeople: sanitizeStringArray(source.keyPeople),
    matchesCount: Number.isFinite(Number(source.matchesCount)) ? Number(source.matchesCount) : null,
    format: normalizedFormat,
    teamsCount: Number.isFinite(Number(source.teamsCount)) ? Number(source.teamsCount) : null,
    hostCountries: sanitizeStringArray(source.hostCountries),
    eventPhases: normalizeEventPhases(source.eventPhases),
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso(),
  };
}

function createFullPrivileges() {
  return Object.fromEntries(
    Object.entries(PAGE_ACTIONS).map(([page, actions]) => [
      page,
      Object.fromEntries(actions.map((action) => [action, true])),
    ]),
  );
}

function normalizePrivileges(privileges, role = "staff") {
  if (role === "super_admin") return createFullPrivileges();
  const source = privileges && typeof privileges === "object" ? privileges : {};
  return Object.fromEntries(
    Object.entries(PAGE_ACTIONS).map(([page, actions]) => {
      const pageSource = source[page] && typeof source[page] === "object" ? source[page] : {};
      return [page, Object.fromEntries(actions.map((action) => [action, Boolean(pageSource[action])]))];
    }),
  );
}

function normalizeUser(user) {
  const source = user && typeof user === "object" ? user : {};
  const role = sanitizeText(source.role) || "staff";
  const isSuperAdmin = role === "super_admin";
  return {
    id: sanitizeText(source.id) || randomUUID(),
    firstName: sanitizeText(source.firstName),
    lastName: sanitizeText(source.lastName),
    email: sanitizeText(source.email).toLowerCase() || `user-${randomUUID()}@local`,
    password: sanitizeText(source.password) || "ChangeMe!123",
    role,
    department: sanitizeOptionalText(source.department),
    organization: sanitizeOptionalText(source.organization),
    active: source.active === undefined ? true : Boolean(source.active),
    privileges: normalizePrivileges(source.privileges, role),
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso(),
    isSuperAdmin,
  };
}

function createDefaultSuperAdmin() {
  return normalizeUser({
    id: "super-admin",
    firstName: "Super",
    lastName: "Admin",
    email: "admin@liveengine.local",
    password: "ChangeMe!123",
    role: "super_admin",
    department: "Operations",
    organization: "Live Engine",
    active: true,
  });
}

function ensureUserList(users) {
  if (!Array.isArray(users) || users.length === 0) {
    return [createDefaultSuperAdmin()];
  }
  const normalized = users.map((item) => normalizeUser(item));
  if (!normalized.some((user) => user.role === "super_admin")) {
    normalized.unshift(createDefaultSuperAdmin());
  }
  return normalized;
}

function normalizeExpenseItem(item) {
  const source = item && typeof item === "object" ? item : {};
  return {
    id: sanitizeText(source.id) || randomUUID(),
    category: sanitizeText(source.category) || "other",
    description: sanitizeText(source.description),
    amount: Number.isFinite(Number(source.amount)) ? Number(source.amount) : 0,
    currency: sanitizeText(source.currency) || "EUR",
    date: sanitizeOptionalText(source.date),
    vendor: sanitizeOptionalText(source.vendor),
    notes: sanitizeOptionalText(source.notes),
  };
}

function normalizePersonnelFinanceData(value) {
  const source = value && typeof value === "object" ? value : {};
  const amount = Number(source.amount);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: sanitizeOptionalText(source.currency),
    vendor: sanitizeOptionalText(source.vendor),
    documentDate: sanitizeOptionalText(source.documentDate),
    summary: sanitizeOptionalText(source.summary),
    parsedExpenses: Array.isArray(source.parsedExpenses)
      ? source.parsedExpenses.map((item) => normalizeExpenseItem(item))
      : [],
  };
}

function normalizePersonnelDocument(item) {
  const source = item && typeof item === "object" ? item : {};
  const categoryRaw = sanitizeText(source.category).toLowerCase();
  const category = ["compliance", "finance", "misc"].includes(categoryRaw)
    ? categoryRaw
    : "misc";
  return {
    id: sanitizeText(source.id) || randomUUID(),
    name: sanitizeText(source.name) || sanitizeText(source.fileName) || "Document",
    category,
    fileName: sanitizeOptionalText(source.fileName),
    fileUrl: sanitizeOptionalText(source.fileUrl),
    filePath: sanitizeOptionalText(source.filePath),
    mimeType: sanitizeOptionalText(source.mimeType),
    sizeBytes: Number.isFinite(Number(source.sizeBytes)) ? Number(source.sizeBytes) : null,
    uploadedAt: sanitizeText(source.uploadedAt) || nowIso(),
    notes: sanitizeOptionalText(source.notes),
    compliance: {
      documentType: sanitizeOptionalText(source.compliance?.documentType),
      referenceCode: sanitizeOptionalText(source.compliance?.referenceCode),
    },
    finance: normalizePersonnelFinanceData(source.finance),
    misc: {
      tags: sanitizeStringArray(source.misc?.tags),
    },
  };
}

function normalizePersonnelEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    id: sanitizeText(source.id) || randomUUID(),
    tournamentId: sanitizeOptionalText(source.tournamentId),
    userId: sanitizeOptionalText(source.userId),
    firstName: sanitizeText(source.firstName),
    lastName: sanitizeText(source.lastName),
    email: sanitizeOptionalText(source.email),
    organization: sanitizeOptionalText(source.organization),
    arrivalDate: sanitizeOptionalText(source.arrivalDate),
    departureDate: sanitizeOptionalText(source.departureDate),
    offer: {
      duration: sanitizeOptionalText(source.offer?.duration),
      compensation: sanitizeOptionalText(source.offer?.compensation),
      benefits: sanitizeStringArray(source.offer?.benefits),
    },
    role: sanitizeOptionalText(source.role),
    department: sanitizeOptionalText(source.department),
    managerUserId: sanitizeOptionalText(source.managerUserId),
    placeOfService: sanitizeOptionalText(source.placeOfService),
    expenses: Array.isArray(source.expenses)
      ? source.expenses.map((item) => normalizeExpenseItem(item))
      : [],
    documents: Array.isArray(source.documents)
      ? source.documents.map((item) => normalizePersonnelDocument(item))
      : [],
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso(),
  };
}

function normalizeTeamPlayer(player) {
  const source = player && typeof player === "object" ? player : {};
  const number = Number(source.number);
  return {
    id: sanitizeText(source.id) || randomUUID(),
    name: sanitizeText(source.name) || "Player",
    number: Number.isFinite(number) && number >= 0 ? Math.round(number) : null,
    position: sanitizeOptionalText(source.position),
  };
}

function normalizeTeam(team) {
  const source = team && typeof team === "object" ? team : {};
  return {
    id: sanitizeText(source.id) || randomUUID(),
    tournamentId: sanitizeOptionalText(source.tournamentId),
    name: sanitizeText(source.name) || "Untitled Team",
    country: sanitizeOptionalText(source.country),
    tricode: sanitizeOptionalText(source.tricode)?.toUpperCase() ?? null,
    logoUrl: sanitizeOptionalText(source.logoUrl),
    players: Array.isArray(source.players)
      ? source.players.map((item) => normalizeTeamPlayer(item))
      : [],
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso(),
  };
}

function createDefaultTournament() {
  return normalizeTournament({
    id: DEFAULT_TOURNAMENT_ID,
    name: "Test Tournament",
    format: "Single elimination",
  });
}

function ensureTournamentList(tournaments) {
  if (!Array.isArray(tournaments) || tournaments.length === 0) {
    return [createDefaultTournament()];
  }
  return tournaments.map((item) => normalizeTournament(item));
}

function resolveTournamentId(state, requestedTournamentId = null) {
  const tournaments = ensureTournamentList(state.tournaments);
  const requested = sanitizeText(requestedTournamentId);
  if (requested && tournaments.some((item) => item.id === requested)) {
    return requested;
  }
  return tournaments[0]?.id ?? DEFAULT_TOURNAMENT_ID;
}

function getTournamentById(state, tournamentId = null) {
  const tournaments = ensureTournamentList(state.tournaments);
  const selectedTournamentId = resolveTournamentId(state, tournamentId);
  return tournaments.find((item) => item.id === selectedTournamentId) ?? tournaments[0] ?? createDefaultTournament();
}

function getEventPhasesForTournament(state, tournamentId = null) {
  return normalizeEventPhases(getTournamentById(state, tournamentId)?.eventPhases);
}

function resolveTournamentIdForList(state, requestedTournamentId = null) {
  const tournaments = ensureTournamentList(state.tournaments);
  const requested = sanitizeText(requestedTournamentId);
  if (!requested) {
    return tournaments[0]?.id ?? DEFAULT_TOURNAMENT_ID;
  }
  if (!tournaments.some((item) => item.id === requested)) {
    return null;
  }
  return requested;
}

function withTournamentFallback(itemTournamentId, fallbackTournamentId) {
  return sanitizeText(itemTournamentId) || fallbackTournamentId;
}

function migrateLegacyState(parsed) {
  const metadata = normalizeMetadata(parsed?.metadata);
  const rows = Array.isArray(parsed?.events) ? parsed.events : [];
  const versions = Array.isArray(parsed?.versions) ? parsed.versions : [];
  const legacyId = sanitizeText(parsed?.legacyEventId) || "legacy-default-event";
  const record = createEventRecord({
    id: legacyId,
    tournamentId: DEFAULT_TOURNAMENT_ID,
    name: metadata.match.matchId || metadata.name,
    metadata,
    rows,
    versions,
  });
  return {
    events: [record],
    venues: [],
    activations: [],
    teams: [],
    tournaments: [createDefaultTournament()],
    users: [createDefaultSuperAdmin()],
    personnel: [],
  };
}

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return structuredClone(DEFAULT_STATE);
  }

  if (Array.isArray(parsed.events) && parsed.events.length > 0 && parsed.events[0]?.rows) {
    const tournaments = ensureTournamentList(parsed.tournaments);
    const tournamentMap = new Map(tournaments.map((item) => [item.id, item]));
    return {
      events: parsed.events.map((eventRecord) => {
        const tid = sanitizeText(eventRecord?.tournamentId);
        const phases = tournamentMap.get(tid)?.eventPhases ?? DEFAULT_EVENT_PHASES;
        return normalizeEventRecord(eventRecord, phases);
      }),
      venues: Array.isArray(parsed.venues) ? parsed.venues.map((venue) => normalizeVenue(venue)) : [],
      activations: Array.isArray(parsed.activations)
        ? parsed.activations.map((activation) => normalizeActivation(activation))
        : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams.map((team) => normalizeTeam(team)) : [],
      tournaments,
      users: ensureUserList(parsed.users),
      personnel: Array.isArray(parsed.personnel)
        ? parsed.personnel.map((entry) => normalizePersonnelEntry(entry))
        : [],
    };
  }

  if (Array.isArray(parsed.events) && parsed.events.length === 0 && !parsed.metadata) {
    const tournaments = ensureTournamentList(parsed.tournaments);
    return {
      events: [],
      venues: Array.isArray(parsed.venues) ? parsed.venues.map((venue) => normalizeVenue(venue)) : [],
      activations: Array.isArray(parsed.activations)
        ? parsed.activations.map((activation) => normalizeActivation(activation))
        : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams.map((team) => normalizeTeam(team)) : [],
      tournaments,
      users: ensureUserList(parsed.users),
      personnel: Array.isArray(parsed.personnel)
        ? parsed.personnel.map((entry) => normalizePersonnelEntry(entry))
        : [],
    };
  }

  return migrateLegacyState(parsed);
}

async function readState() {
  await ensureStorage();
  const collection = await getStateCollection();
  const doc = await collection.findOne({ _id: MONGODB_STATE_ID });
  return normalizeState(doc?.state ?? DEFAULT_STATE);
}

async function writeState(state) {
  const normalized = normalizeState(state);
  const collection = await getStateCollection();
  await collection.updateOne(
    { _id: MONGODB_STATE_ID },
    { $set: { state: normalized, updatedAt: nowIso() } },
    { upsert: true },
  );
  return normalized;
}

function findEventRecord(state, eventId) {
  return state.events.find((item) => item.id === eventId) ?? null;
}

function snapshotFromRecord(record) {
  return {
    event: {
      id: record.id,
      tournamentId: sanitizeOptionalText(record.tournamentId),
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    metadata: record.metadata,
    events: record.rows,
    versions: record.versions,
  };
}

function plannerEventSummaryFromRecord(record) {
  return {
    id: record.id,
    tournamentId: sanitizeOptionalText(record.tournamentId),
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    totalRows: record.rows.length,
    sourceFile: record.metadata.sourceFile,
    importedAt: record.metadata.importedAt,
    match: record.metadata.match,
  };
}

export async function listPlannerEvents(tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentIdForList(state, tournamentId);
  if (!selectedTournamentId) return [];
  const fallbackTournamentId = resolveTournamentId(state, null);
  return state.events
    .filter(
      (record) =>
        withTournamentFallback(record.tournamentId, fallbackTournamentId) === selectedTournamentId,
    )
    .map((record) => plannerEventSummaryFromRecord(record))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function listVenues(tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentIdForList(state, tournamentId);
  if (!selectedTournamentId) return [];
  const fallbackTournamentId = resolveTournamentId(state, null);
  return (state.venues ?? [])
    .filter(
      (venue) => withTournamentFallback(venue.tournamentId, fallbackTournamentId) === selectedTournamentId,
    )
    .map((venue) => normalizeVenue(venue))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function createVenue(payload, actor, tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentId(state, tournamentId);
  const next = normalizeVenue({ ...payload, tournamentId: selectedTournamentId });
  next.updatedAt = nowIso();
  next.createdAt = next.createdAt || next.updatedAt;
  state.venues = [...(state.venues ?? []), next];
  await writeState(state);
  return next;
}

export async function listTeams(tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentIdForList(state, tournamentId);
  if (!selectedTournamentId) return [];
  const fallbackTournamentId = resolveTournamentId(state, null);
  return (state.teams ?? [])
    .filter(
      (team) => withTournamentFallback(team.tournamentId, fallbackTournamentId) === selectedTournamentId,
    )
    .map((team) => normalizeTeam(team))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function createTeam(payload, actor, tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentId(state, tournamentId);
  const next = normalizeTeam({ ...payload, tournamentId: selectedTournamentId });
  next.updatedAt = nowIso();
  next.createdAt = next.createdAt || next.updatedAt;
  state.teams = [...(state.teams ?? []), next];
  await writeState(state);
  return next;
}

export async function updateTeam(teamId, payload, actor) {
  const state = await readState();
  const index = (state.teams ?? []).findIndex((team) => team.id === teamId);
  if (index === -1) return null;

  const current = normalizeTeam(state.teams[index]);
  const merged = normalizeTeam({
    ...current,
    ...payload,
    id: current.id,
    createdAt: current.createdAt,
  });
  merged.updatedAt = nowIso();

  state.teams[index] = merged;
  await writeState(state);
  return merged;
}

export async function deleteTeam(teamId) {
  const state = await readState();
  const index = (state.teams ?? []).findIndex((team) => team.id === teamId);
  if (index === -1) return null;
  const [removed] = state.teams.splice(index, 1);
  await writeState(state);
  return normalizeTeam(removed);
}

export async function listActivations(tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentIdForList(state, tournamentId);
  if (!selectedTournamentId) return [];
  const fallbackTournamentId = resolveTournamentId(state, null);
  return (state.activations ?? [])
    .filter(
      (activation) =>
        withTournamentFallback(activation.tournamentId, fallbackTournamentId) === selectedTournamentId,
    )
    .map((activation) => normalizeActivation(activation))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function createActivation(payload, actor, tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentId(state, tournamentId);
  const next = normalizeActivation({ ...payload, tournamentId: selectedTournamentId });
  next.updatedAt = nowIso();
  next.createdAt = next.createdAt || next.updatedAt;
  state.activations = [...(state.activations ?? []), next];
  await writeState(state);
  return next;
}

export async function updateActivation(activationId, payload, actor) {
  const state = await readState();
  const index = (state.activations ?? []).findIndex((activation) => activation.id === activationId);
  if (index === -1) return null;

  const current = normalizeActivation(state.activations[index]);
  const merged = normalizeActivation({
    ...current,
    ...payload,
    id: current.id,
    createdAt: current.createdAt,
  });
  merged.updatedAt = nowIso();

  state.activations[index] = merged;
  await writeState(state);
  return merged;
}

export async function deleteActivation(activationId) {
  const state = await readState();
  const index = (state.activations ?? []).findIndex((activation) => activation.id === activationId);
  if (index === -1) return null;
  const [removed] = state.activations.splice(index, 1);
  await writeState(state);
  return normalizeActivation(removed);
}

export async function getPlannerEventSnapshot(eventId) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  return snapshotFromRecord(record);
}

export async function createPlannerEvent(payload, actor) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentId(state, payload?.tournamentId ?? null);
  const eventPhases = getEventPhasesForTournament(state, selectedTournamentId);
  const baseName = sanitizeText(payload?.name);
  const metadata = normalizeMetadata({
    name: "Live Engine Cue Sheet",
    match: payload?.match ?? {},
  });
  const record = createEventRecord({
    tournamentId: selectedTournamentId,
    name: baseName || metadata.match.matchId || `Event ${state.events.length + 1}`,
    metadata,
    rows: [],
    versions: [],
    eventPhases,
  });

  pushVersion(record, {
    action: "planner_event_create",
    actor: actor || "system",
    details: { name: record.name },
  });

  state.events.push(record);
  await writeState(state);
  return snapshotFromRecord(record);
}

export async function updatePlannerEvent(eventId, payload, actor) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;

  const patchName = sanitizeText(payload?.name);
  const hasMatchPatch = payload?.match && typeof payload.match === "object";

  if (hasMatchPatch) {
    record.metadata = {
      ...record.metadata,
      match: normalizeMatchInfo(payload.match),
      updatedAt: nowIso(),
    };
  }

  record.name =
    patchName ||
    sanitizeText(record.name) ||
    sanitizeText(record.metadata?.match?.matchId) ||
    "Untitled Event";
  record.updatedAt = nowIso();

  pushVersion(record, {
    action: "planner_event_update",
    actor: actor || "system",
    details: {
      name: record.name,
      matchId: record.metadata.match?.matchId ?? null,
      venue: record.metadata.match?.venue ?? null,
    },
  });

  await writeState(state);
  return snapshotFromRecord(record);
}

export async function deletePlannerEvent(eventId, actor) {
  const state = await readState();
  const index = state.events.findIndex((eventRecord) => eventRecord.id === eventId);
  if (index === -1) return null;
  const [removed] = state.events.splice(index, 1);
  await writeState(state);
  return plannerEventSummaryFromRecord(removed);
}

export async function listTournaments() {
  const state = await readState();
  return ensureTournamentList(state.tournaments).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function createTournament(payload, actor) {
  const state = await readState();
  const next = normalizeTournament(payload);
  next.updatedAt = nowIso();
  next.createdAt = next.createdAt || next.updatedAt;
  state.tournaments = [...ensureTournamentList(state.tournaments), next];
  await writeState(state);
  return next;
}

export async function updateTournament(tournamentId, payload, actor) {
  const state = await readState();
  const tournaments = ensureTournamentList(state.tournaments);
  const index = tournaments.findIndex((item) => item.id === tournamentId);
  if (index === -1) return null;

  const current = tournaments[index];
  const merged = normalizeTournament({
    ...current,
    ...payload,
    id: current.id,
    createdAt: current.createdAt,
  });
  merged.updatedAt = nowIso();

  tournaments[index] = merged;
  state.tournaments = tournaments;
  await writeState(state);
  return merged;
}

export async function deleteTournament(tournamentId, actor) {
  const state = await readState();
  const tournaments = ensureTournamentList(state.tournaments);
  const fallbackTournamentId = resolveTournamentId({ ...state, tournaments }, null);
  const index = tournaments.findIndex((item) => item.id === tournamentId);
  if (index === -1) return null;

  const [removed] = tournaments.splice(index, 1);
  state.events = state.events.filter(
    (record) => withTournamentFallback(record.tournamentId, fallbackTournamentId) !== tournamentId,
  );
  state.venues = state.venues.filter(
    (item) => withTournamentFallback(item.tournamentId, fallbackTournamentId) !== tournamentId,
  );
  state.activations = state.activations.filter(
    (item) => withTournamentFallback(item.tournamentId, fallbackTournamentId) !== tournamentId,
  );
  state.teams = state.teams.filter(
    (item) => withTournamentFallback(item.tournamentId, fallbackTournamentId) !== tournamentId,
  );
  state.tournaments = tournaments.length > 0 ? tournaments : [createDefaultTournament()];
  await writeState(state);
  return removed;
}

export async function replaceCuesheet(eventId, { rows, sourceFile, actor }) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const eventPhases = getEventPhasesForTournament(state, record.tournamentId);

  const normalizedRows = rebuildTimeline(
    (rows ?? []).map((row, index) => normalizeRow(row, actor, index, eventPhases)),
    eventPhases,
    record.metadata?.match?.kickoffTime ?? null,
  ).map((row) => ({ ...row, updatedAt: nowIso(), updatedBy: actor || "system" }));

  record.rows = normalizedRows;
  record.metadata = {
    ...record.metadata,
    sourceFile: sourceFile ?? record.metadata.sourceFile ?? null,
    importedAt: nowIso(),
    updatedAt: nowIso(),
  };
  record.updatedAt = nowIso();

  pushVersion(record, {
    action: "import_replace",
    actor: actor || "system",
    details: {
      sourceFile: record.metadata.sourceFile,
      totalEvents: normalizedRows.length,
    },
  });

  await writeState(state);
  return snapshotFromRecord(record);
}

export async function updateMatchInfo(eventId, patch, actor) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const eventPhases = getEventPhasesForTournament(state, record.tournamentId);

  const current = normalizeMatchInfo(record.metadata.match);
  const nextMatch = {
    ...current,
    ...patch,
    teamA: patch.teamA ? { ...current.teamA, ...patch.teamA } : current.teamA,
    teamB: patch.teamB ? { ...current.teamB, ...patch.teamB } : current.teamB,
  };

  record.metadata = {
    ...record.metadata,
    match: normalizeMatchInfo(nextMatch),
    updatedAt: nowIso(),
  };
  record.rows = rebuildTimeline(record.rows, eventPhases, record.metadata.match?.kickoffTime ?? null).map((row) => ({
    ...row,
    updatedAt: nowIso(),
    updatedBy: actor || "system",
  }));
  record.name = sanitizeText(record.name) || record.metadata.match.matchId || "Untitled Event";
  record.updatedAt = nowIso();

  pushVersion(record, {
    action: "match_update",
    actor: actor || "system",
    details: {
      matchId: record.metadata.match.matchId,
      venue: record.metadata.match.venue,
      city: record.metadata.match.city,
    },
  });

  await writeState(state);
  return snapshotFromRecord(record);
}

export async function createRow(eventId, payload, actor) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const eventPhases = getEventPhasesForTournament(state, record.tournamentId);

  const row = normalizeRow(
    {
      ...payload,
      id: randomUUID(),
      sourceRow: null,
      raw: {},
    },
    actor || "user",
    record.rows.length,
    eventPhases,
  );

  record.rows.push(row);
  record.rows = rebuildTimeline(record.rows, eventPhases, record.metadata?.match?.kickoffTime ?? null).map((item) => ({
    ...item,
    updatedAt: nowIso(),
    updatedBy: actor || "user",
  }));
  record.updatedAt = nowIso();

  pushVersion(record, {
    action: "row_create",
    actor: actor || "user",
    eventId: row.id,
    after: row,
  });

  await writeState(state);
  return snapshotFromRecord(record);
}

export async function updateRow(eventId, rowId, payload, actor) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const eventPhases = getEventPhasesForTournament(state, record.tournamentId);

  const index = record.rows.findIndex((row) => row.id === rowId);
  if (index === -1) return null;

  const before = record.rows[index];
  const allowedKeys = [
    "phase",
    "category",
    "cue",
    "asset",
    "operator",
    "audio",
    "script",
    "activationId",
    "status",
    "notes",
  ];

  const patch = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => allowedKeys.includes(key))
      .map(([key, value]) => [key, sanitizeText(value)]),
  );

  if (Array.isArray(payload.screenTargets)) {
    patch.screenTargets = payload.screenTargets.map((item) => normalizeScreenTarget(item));
  }

  record.rows[index] = {
    ...before,
    ...patch,
    updatedAt: nowIso(),
    updatedBy: actor || "user",
  };

  record.rows = rebuildTimeline(record.rows, eventPhases, record.metadata?.match?.kickoffTime ?? null).map((row) =>
    row.id === rowId ? { ...row, updatedAt: nowIso(), updatedBy: actor || "user" } : row,
  );
  record.updatedAt = nowIso();

  pushVersion(record, {
    action: "row_update",
    actor: actor || "user",
    eventId: rowId,
    before,
    after: record.rows.find((row) => row.id === rowId),
  });

  await writeState(state);
  return snapshotFromRecord(record);
}

export async function deleteRow(eventId, rowId, actor) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const eventPhases = getEventPhasesForTournament(state, record.tournamentId);

  const index = record.rows.findIndex((row) => row.id === rowId);
  if (index === -1) return null;

  const [removed] = record.rows.splice(index, 1);
  record.rows = rebuildTimeline(record.rows, eventPhases, record.metadata?.match?.kickoffTime ?? null).map((row) => ({
    ...row,
    updatedAt: nowIso(),
    updatedBy: actor || "user",
  }));
  record.updatedAt = nowIso();

  pushVersion(record, {
    action: "row_delete",
    actor: actor || "user",
    eventId: rowId,
    before: removed,
  });

  await writeState(state);
  return snapshotFromRecord(record);
}

export async function reorderRows(eventId, orderedIds, actor) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const eventPhases = getEventPhasesForTournament(state, record.tournamentId);

  const map = new Map(record.rows.map((row) => [row.id, row]));
  const reordered = orderedIds
    .map((id) => map.get(id))
    .filter(Boolean)
    .concat(record.rows.filter((row) => !orderedIds.includes(row.id)));

  record.rows = rebuildTimeline(reordered, eventPhases, record.metadata?.match?.kickoffTime ?? null).map((row) => ({
    ...row,
    updatedAt: nowIso(),
    updatedBy: actor || "user",
  }));
  record.updatedAt = nowIso();

  pushVersion(record, {
    action: "rows_reorder",
    actor: actor || "user",
    details: { total: record.rows.length },
  });

  await writeState(state);
  return snapshotFromRecord(record);
}

export async function getVersions(eventId, limit = 100) {
  const state = await readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return record.versions.slice(0, safeLimit);
}

export async function listUsers() {
  const state = await readState();
  return ensureUserList(state.users).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getUserById(userId) {
  const state = await readState();
  const users = ensureUserList(state.users);
  return users.find((user) => user.id === sanitizeText(userId)) ?? null;
}

export async function createUser(payload) {
  const state = await readState();
  const users = ensureUserList(state.users);
  const next = normalizeUser(payload);
  next.createdAt = nowIso();
  next.updatedAt = next.createdAt;
  users.push(next);
  state.users = users;
  await writeState(state);
  return next;
}

export async function updateUser(userId, payload) {
  const state = await readState();
  const users = ensureUserList(state.users);
  const index = users.findIndex((item) => item.id === sanitizeText(userId));
  if (index === -1) return null;
  const current = users[index];
  const merged = normalizeUser({
    ...current,
    ...payload,
    id: current.id,
    createdAt: current.createdAt,
  });
  merged.updatedAt = nowIso();
  users[index] = merged;
  state.users = users;
  await writeState(state);
  return merged;
}

export async function deleteUser(userId) {
  const state = await readState();
  const users = ensureUserList(state.users);
  const index = users.findIndex((item) => item.id === sanitizeText(userId));
  if (index === -1) return null;
  if (users[index].role === "super_admin") return null;
  const [removed] = users.splice(index, 1);
  state.users = users;
  state.personnel = (state.personnel ?? []).map((entry) => {
    const normalized = normalizePersonnelEntry(entry);
    return normalized.userId === removed.id
      ? { ...normalized, userId: null, managerUserId: normalized.managerUserId === removed.id ? null : normalized.managerUserId }
      : normalized;
  });
  await writeState(state);
  return removed;
}

export async function listPersonnel(tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentIdForList(state, tournamentId);
  if (!selectedTournamentId) return [];
  const fallbackTournamentId = resolveTournamentId(state, null);
  return (state.personnel ?? [])
    .map((entry) => normalizePersonnelEntry(entry))
    .filter(
      (entry) => withTournamentFallback(entry.tournamentId, fallbackTournamentId) === selectedTournamentId,
    )
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getPersonnelById(personnelId) {
  const state = await readState();
  const entries = (state.personnel ?? []).map((entry) => normalizePersonnelEntry(entry));
  return entries.find((item) => item.id === sanitizeText(personnelId)) ?? null;
}

export async function createPersonnel(payload, tournamentId = null) {
  const state = await readState();
  const selectedTournamentId = resolveTournamentId(state, tournamentId ?? payload?.tournamentId ?? null);
  const next = normalizePersonnelEntry({ ...payload, tournamentId: selectedTournamentId });
  next.createdAt = nowIso();
  next.updatedAt = next.createdAt;
  state.personnel = [...(state.personnel ?? []), next];
  await writeState(state);
  return next;
}

export async function updatePersonnel(personnelId, payload) {
  const state = await readState();
  const entries = (state.personnel ?? []).map((entry) => normalizePersonnelEntry(entry));
  const index = entries.findIndex((item) => item.id === sanitizeText(personnelId));
  if (index === -1) return null;
  const current = entries[index];
  const merged = normalizePersonnelEntry({
    ...current,
    ...payload,
    id: current.id,
    createdAt: current.createdAt,
  });
  merged.updatedAt = nowIso();
  entries[index] = merged;
  state.personnel = entries;
  await writeState(state);
  return merged;
}

export async function deletePersonnel(personnelId) {
  const state = await readState();
  const entries = (state.personnel ?? []).map((entry) => normalizePersonnelEntry(entry));
  const index = entries.findIndex((item) => item.id === sanitizeText(personnelId));
  if (index === -1) return null;
  const [removed] = entries.splice(index, 1);
  state.personnel = entries;
  await writeState(state);
  return removed;
}

export function parseExpenseText(input) {
  const lines = String(input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => {
    const amountMatch = line.match(/([-+]?\d+(?:[.,]\d{1,2})?)/);
    const amount = amountMatch ? Number(amountMatch[1].replace(",", ".")) : 0;
    const upper = line.toUpperCase();
    let category = "other";
    if (upper.includes("FLIGHT") || upper.includes("AIR")) category = "flight";
    else if (upper.includes("HOTEL") || upper.includes("ACCOMMODATION")) category = "accommodation";
    else if (upper.includes("MEAL") || upper.includes("FOOD") || upper.includes("DINNER")) category = "meals";
    else if (upper.includes("TAXI") || upper.includes("TRAIN") || upper.includes("TRANSPORT")) category = "transport";
    const currencyMatch = line.match(/\b(EUR|USD|GBP|AED|SAR)\b/i);
    return normalizeExpenseItem({
      category,
      description: line,
      amount,
      currency: currencyMatch ? currencyMatch[1].toUpperCase() : "EUR",
    });
  });
  return parsed;
}

export async function ensurePlannerEvent(actor, payload = {}) {
  const existing = await listPlannerEvents(payload?.tournamentId ?? null);
  if (existing.length > 0) return existing[0].id;
  const created = await createPlannerEvent(payload, actor);
  return created.event.id;
}

