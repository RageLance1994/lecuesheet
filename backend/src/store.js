import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "cuesheet.json");

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
    city: null,
    date: null,
    gatesOpen: null,
    kickoffTime: null,
    venue: null,
  };
}

export const PHASES = [
  { key: "GATES_OPEN", label: "Gates Open", start: "13:00:00" },
  { key: "KICK_OFF", label: "Kick Off", start: "15:00:00" },
  { key: "HT_HALF_TIME", label: "HT-Half Time", start: "15:45:00" },
  { key: "SECOND_HALF_KICK_OFF", label: "2nd Half Kick Off", start: "16:00:00" },
  { key: "FULL_TIME", label: "Full Time", start: "16:45:00" },
];

const PHASE_ORDER = PHASES.map((phase) => phase.key);

const DEFAULT_STATE = {
  metadata: {
    name: "Live Engine Cue Sheet",
    sourceFile: null,
    importedAt: null,
    updatedAt: null,
    match: createDefaultMatchInfo(),
  },
  events: [],
  versions: [],
};

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
}

function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sanitizeOptionalText(value) {
  const text = sanitizeText(value);
  return text || null;
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
    ...DEFAULT_STATE.metadata,
    ...source,
    match: normalizeMatchInfo(source.match),
  };
}

function phaseFromCue(cue) {
  const text = sanitizeText(cue).toUpperCase();
  if (!text) return "GATES_OPEN";
  if (text.includes("FULL TIME")) return "FULL_TIME";
  if (text.includes("2ND HALF") || text.includes("SECOND HALF")) {
    return "SECOND_HALF_KICK_OFF";
  }
  if (text.includes("HALF TIME") || text.includes("HT")) return "HT_HALF_TIME";
  if (text.includes("KICK OFF")) return "KICK_OFF";
  return "GATES_OPEN";
}

function phaseStartSeconds(phaseKey) {
  const phase = PHASES.find((item) => item.key === phaseKey) ?? PHASES[0];
  const [h, m, s] = phase.start.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function formatSeconds(totalSeconds) {
  const normalized = Math.max(0, totalSeconds);
  const h = String(Math.floor(normalized / 3600)).padStart(2, "0");
  const m = String(Math.floor((normalized % 3600) / 60)).padStart(2, "0");
  const s = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function rebuildTimeline(events) {
  const counters = new Map(PHASE_ORDER.map((key) => [key, 0]));
  return events.map((event, index) => {
    const phase = PHASE_ORDER.includes(event.phase) ? event.phase : phaseFromCue(event.cue);
    const offset = counters.get(phase) ?? 0;
    counters.set(phase, offset + 1);
    return {
      ...event,
      phase,
      rowOrder: index,
      timecode: formatSeconds(phaseStartSeconds(phase) + offset * 30),
    };
  });
}

function normalizeEvent(event, actor, rowOrder) {
  const phase = PHASE_ORDER.includes(event.phase) ? event.phase : phaseFromCue(event.cue);
  return {
    id: event.id ?? randomUUID(),
    rowOrder,
    timecode: sanitizeText(event.timecode),
    phase,
    category: sanitizeText(event.category),
    cue: sanitizeText(event.cue),
    asset: sanitizeText(event.asset),
    operator: sanitizeText(event.operator),
    status: sanitizeText(event.status) || "pending",
    notes: sanitizeText(event.notes),
    sourceRow: event.sourceRow ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || "system",
    raw: event.raw ?? {},
  };
}

function readState() {
  ensureStorage();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      metadata: normalizeMetadata(parsed.metadata),
      events: Array.isArray(parsed.events) ? parsed.events : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function writeState(state) {
  const normalizedState = {
    ...state,
    metadata: normalizeMetadata(state.metadata),
    events: Array.isArray(state.events) ? state.events : [],
    versions: Array.isArray(state.versions) ? state.versions : [],
  };
  const nextState = {
    ...normalizedState,
    metadata: {
      ...normalizedState.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(nextState, null, 2), "utf-8");
  return nextState;
}

function pushVersion(state, entry) {
  const versionEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  state.versions = [versionEntry, ...state.versions].slice(0, 2000);
}

export function getCuesheet() {
  return readState();
}

export function replaceCuesheet({ events, sourceFile, actor }) {
  const state = readState();
  const normalizedEvents = rebuildTimeline(
    (events ?? []).map((event, index) => normalizeEvent(event, actor, index)),
  ).map((event) => ({ ...event, updatedAt: new Date().toISOString() }));

  const next = {
    metadata: {
      ...state.metadata,
      sourceFile: sourceFile ?? state.metadata.sourceFile ?? null,
      importedAt: new Date().toISOString(),
    },
    events: normalizedEvents,
    versions: state.versions,
  };

  pushVersion(next, {
    action: "import_replace",
    actor: actor || "system",
    details: {
      sourceFile: next.metadata.sourceFile,
      totalEvents: normalizedEvents.length,
    },
  });

  return writeState(next);
}

export function updateMatchInfo(patch, actor) {
  const state = readState();
  const current = normalizeMatchInfo(state.metadata.match);
  const nextMatch = {
    ...current,
    ...patch,
    teamA: patch.teamA ? { ...current.teamA, ...patch.teamA } : current.teamA,
    teamB: patch.teamB ? { ...current.teamB, ...patch.teamB } : current.teamB,
  };

  const next = {
    ...state,
    metadata: {
      ...state.metadata,
      match: normalizeMatchInfo(nextMatch),
    },
  };

  pushVersion(next, {
    action: "match_update",
    actor: actor || "system",
    details: {
      matchId: next.metadata.match.matchId,
      venue: next.metadata.match.venue,
      city: next.metadata.match.city,
    },
  });

  return writeState(next);
}

export function createEvent(payload, actor) {
  const state = readState();
  const event = normalizeEvent(
    {
      ...payload,
      id: randomUUID(),
      sourceRow: null,
      raw: {},
    },
    actor || "user",
    state.events.length,
  );
  state.events.push(event);
  state.events = rebuildTimeline(state.events);
  pushVersion(state, {
    action: "event_create",
    actor: actor || "user",
    eventId: event.id,
    after: event,
  });
  return writeState(state);
}

export function updateEvent(id, payload, actor) {
  const state = readState();
  const index = state.events.findIndex((event) => event.id === id);
  if (index === -1) return null;

  const before = state.events[index];
  const allowedKeys = [
    "phase",
    "category",
    "cue",
    "asset",
    "operator",
    "status",
    "notes",
  ];
  const patch = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => allowedKeys.includes(key))
      .map(([key, value]) => [key, sanitizeText(value)]),
  );

  const after = {
    ...before,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || "user",
  };

  state.events[index] = after;
  state.events = rebuildTimeline(state.events).map((event) =>
    event.id === id ? { ...event, updatedAt: new Date().toISOString(), updatedBy: actor || "user" } : event,
  );
  pushVersion(state, {
    action: "event_update",
    actor: actor || "user",
    eventId: id,
    before,
    after: state.events.find((event) => event.id === id),
  });
  return writeState(state);
}

export function deleteEvent(id, actor) {
  const state = readState();
  const index = state.events.findIndex((event) => event.id === id);
  if (index === -1) return null;
  const [removed] = state.events.splice(index, 1);
  state.events = rebuildTimeline(state.events).map((event) => ({
    ...event,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || "user",
  }));
  pushVersion(state, {
    action: "event_delete",
    actor: actor || "user",
    eventId: id,
    before: removed,
  });
  return writeState(state);
}

export function reorderEvents(orderedIds, actor) {
  const state = readState();
  const map = new Map(state.events.map((event) => [event.id, event]));
  const reordered = orderedIds
    .map((id) => map.get(id))
    .filter(Boolean)
    .concat(state.events.filter((event) => !orderedIds.includes(event.id)));
  state.events = rebuildTimeline(reordered).map((event) => ({
    ...event,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || "user",
  }));
  pushVersion(state, {
    action: "events_reorder",
    actor: actor || "user",
    details: { total: state.events.length },
  });
  return writeState(state);
}
