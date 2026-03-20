import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");
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
    venueId: null,
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
};

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
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

function normalizeRow(event, actor, rowOrder) {
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

function rebuildTimeline(rows) {
  const counters = new Map(PHASE_ORDER.map((key) => [key, 0]));
  return rows.map((row, index) => {
    const phase = PHASE_ORDER.includes(row.phase) ? row.phase : phaseFromCue(row.cue);
    const offset = counters.get(phase) ?? 0;
    counters.set(phase, offset + 1);
    return {
      ...row,
      phase,
      rowOrder: index,
      timecode: formatSeconds(phaseStartSeconds(phase) + offset * 30),
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
  name,
  metadata,
  rows,
  versions,
  createdAt,
  updatedAt,
}) {
  const safeMetadata = normalizeMetadata(metadata);
  const normalizedRows = rebuildTimeline(
    (rows ?? []).map((row, index) => normalizeRow(row, "system", index)),
  );
  return {
    id: id || randomUUID(),
    name: sanitizeText(name) || safeMetadata.match.matchId || "Untitled Event",
    createdAt: createdAt || nowIso(),
    updatedAt: updatedAt || nowIso(),
    metadata: safeMetadata,
    rows: normalizedRows,
    versions: Array.isArray(versions) ? versions : [],
  };
}

function normalizeEventRecord(record) {
  if (!record || typeof record !== "object") {
    return createEventRecord({});
  }
  return createEventRecord({
    id: record.id,
    name: record.name,
    metadata: record.metadata,
    rows: record.rows,
    versions: record.versions,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function migrateLegacyState(parsed) {
  const metadata = normalizeMetadata(parsed?.metadata);
  const rows = Array.isArray(parsed?.events) ? parsed.events : [];
  const versions = Array.isArray(parsed?.versions) ? parsed.versions : [];
  const legacyId = sanitizeText(parsed?.legacyEventId) || "legacy-default-event";
  const record = createEventRecord({
    id: legacyId,
    name: metadata.match.matchId || metadata.name,
    metadata,
    rows,
    versions,
  });
  return { events: [record], venues: [], activations: [] };
}

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return structuredClone(DEFAULT_STATE);
  }

  if (Array.isArray(parsed.events) && parsed.events.length > 0 && parsed.events[0]?.rows) {
    return {
      events: parsed.events.map((eventRecord) => normalizeEventRecord(eventRecord)),
      venues: Array.isArray(parsed.venues) ? parsed.venues.map((venue) => normalizeVenue(venue)) : [],
      activations: Array.isArray(parsed.activations)
        ? parsed.activations.map((activation) => normalizeActivation(activation))
        : [],
    };
  }

  if (Array.isArray(parsed.events) && parsed.events.length === 0 && !parsed.metadata) {
    return {
      events: [],
      venues: Array.isArray(parsed.venues) ? parsed.venues.map((venue) => normalizeVenue(venue)) : [],
      activations: Array.isArray(parsed.activations)
        ? parsed.activations.map((activation) => normalizeActivation(activation))
        : [],
    };
  }

  return migrateLegacyState(parsed);
}

function readState() {
  ensureStorage();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function writeState(state) {
  const normalized = normalizeState(state);
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

function findEventRecord(state, eventId) {
  return state.events.find((item) => item.id === eventId) ?? null;
}

function snapshotFromRecord(record) {
  return {
    event: {
      id: record.id,
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
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    totalRows: record.rows.length,
    sourceFile: record.metadata.sourceFile,
    importedAt: record.metadata.importedAt,
    match: record.metadata.match,
  };
}

export function listPlannerEvents() {
  const state = readState();
  return state.events
    .map((record) => plannerEventSummaryFromRecord(record))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function listVenues() {
  const state = readState();
  return (state.venues ?? [])
    .map((venue) => normalizeVenue(venue))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function createVenue(payload, actor) {
  const state = readState();
  const next = normalizeVenue(payload);
  next.updatedAt = nowIso();
  next.createdAt = next.createdAt || next.updatedAt;
  state.venues = [...(state.venues ?? []), next];
  writeState(state);
  return next;
}

export function listActivations() {
  const state = readState();
  return (state.activations ?? [])
    .map((activation) => normalizeActivation(activation))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function createActivation(payload, actor) {
  const state = readState();
  const next = normalizeActivation(payload);
  next.updatedAt = nowIso();
  next.createdAt = next.createdAt || next.updatedAt;
  state.activations = [...(state.activations ?? []), next];
  writeState(state);
  return next;
}

export function updateActivation(activationId, payload, actor) {
  const state = readState();
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
  writeState(state);
  return merged;
}

export function deleteActivation(activationId) {
  const state = readState();
  const index = (state.activations ?? []).findIndex((activation) => activation.id === activationId);
  if (index === -1) return null;
  const [removed] = state.activations.splice(index, 1);
  writeState(state);
  return normalizeActivation(removed);
}

export function getPlannerEventSnapshot(eventId) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  return snapshotFromRecord(record);
}

export function createPlannerEvent(payload, actor) {
  const state = readState();
  const baseName = sanitizeText(payload?.name);
  const metadata = normalizeMetadata({
    name: "Live Engine Cue Sheet",
    match: payload?.match ?? {},
  });
  const record = createEventRecord({
    name: baseName || metadata.match.matchId || `Event ${state.events.length + 1}`,
    metadata,
    rows: [],
    versions: [],
  });

  pushVersion(record, {
    action: "planner_event_create",
    actor: actor || "system",
    details: { name: record.name },
  });

  state.events.push(record);
  writeState(state);
  return snapshotFromRecord(record);
}

export function updatePlannerEvent(eventId, payload, actor) {
  const state = readState();
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

  writeState(state);
  return snapshotFromRecord(record);
}

export function deletePlannerEvent(eventId, actor) {
  const state = readState();
  const index = state.events.findIndex((eventRecord) => eventRecord.id === eventId);
  if (index === -1) return null;
  const [removed] = state.events.splice(index, 1);
  writeState(state);
  return plannerEventSummaryFromRecord(removed);
}

export function replaceCuesheet(eventId, { rows, sourceFile, actor }) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;

  const normalizedRows = rebuildTimeline(
    (rows ?? []).map((row, index) => normalizeRow(row, actor, index)),
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

  writeState(state);
  return snapshotFromRecord(record);
}

export function updateMatchInfo(eventId, patch, actor) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;

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

  writeState(state);
  return snapshotFromRecord(record);
}

export function createRow(eventId, payload, actor) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;

  const row = normalizeRow(
    {
      ...payload,
      id: randomUUID(),
      sourceRow: null,
      raw: {},
    },
    actor || "user",
    record.rows.length,
  );

  record.rows.push(row);
  record.rows = rebuildTimeline(record.rows).map((item) => ({
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

  writeState(state);
  return snapshotFromRecord(record);
}

export function updateRow(eventId, rowId, payload, actor) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;

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

  record.rows = rebuildTimeline(record.rows).map((row) =>
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

  writeState(state);
  return snapshotFromRecord(record);
}

export function deleteRow(eventId, rowId, actor) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;

  const index = record.rows.findIndex((row) => row.id === rowId);
  if (index === -1) return null;

  const [removed] = record.rows.splice(index, 1);
  record.rows = rebuildTimeline(record.rows).map((row) => ({
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

  writeState(state);
  return snapshotFromRecord(record);
}

export function reorderRows(eventId, orderedIds, actor) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;

  const map = new Map(record.rows.map((row) => [row.id, row]));
  const reordered = orderedIds
    .map((id) => map.get(id))
    .filter(Boolean)
    .concat(record.rows.filter((row) => !orderedIds.includes(row.id)));

  record.rows = rebuildTimeline(reordered).map((row) => ({
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

  writeState(state);
  return snapshotFromRecord(record);
}

export function getVersions(eventId, limit = 100) {
  const state = readState();
  const record = findEventRecord(state, eventId);
  if (!record) return null;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return record.versions.slice(0, safeLimit);
}

export function ensurePlannerEvent(actor, payload = {}) {
  const existing = listPlannerEvents();
  if (existing.length > 0) return existing[0].id;
  const created = createPlannerEvent(payload, actor);
  return created.event.id;
}
