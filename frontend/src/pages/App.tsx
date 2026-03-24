import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { AppSidebar } from "../components/AppSidebar";
import { CueTable } from "../components/CueTable";
import type { CueColumnKey } from "../components/CueTable";
import { CuesheetTimeline } from "../components/CuesheetTimeline";
import {
  EventFormModal,
  type EventDraft,
  draftFromEvent,
  emptyDraft,
} from "../components/EventFormModal";
import { HardConfirmModal } from "../components/HardConfirmModal";
import { api, hasPrivilege, PHASES } from "../lib/api";
import type { Activation, CueEvent, CueSheetSnapshot, Tournament, UserAccount, Venue } from "../lib/api";
import { matchInfoToDraft } from "../lib/api";
import { Button } from "../components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";

const MATCH_INFO_COLLAPSE_STORAGE_KEY = "lecuesheet:matchInfoOpen";
const LAST_CUESHEET_EVENT_STORAGE_KEY = "lecuesheet:lastCuesheetEventId";
const PHASE_DRIFT_DEBOUNCE_MS = 280;

type ConfirmState = {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  onApprove?: () => Promise<void>;
};

type EditorState = {
  open: boolean;
  mode: "create" | "edit";
  eventId: string | null;
};

type Props = {
  eventId: string;
  onNavigate: (path: string) => void;
  tournaments: Tournament[];
  selectedTournamentId: string;
  onSelectTournament: (tournamentId: string) => void;
  onCreateTournament: () => void;
  onEditTournament: (tournament: Tournament) => void;
  onDeleteTournament: (tournament: Tournament) => void;
  currentUser: UserAccount | null;
  pageAccess: {
    events: boolean;
    activations: boolean;
    venues: boolean;
    personnel: boolean;
    users: boolean;
  };
};

const initialConfirm: ConfirmState = {
  open: false,
  title: "",
  description: "",
  actionLabel: "Confirm",
};

function formatMatchField(value: string) {
  return value.trim() || "-";
}

function getTeamInitials(name: string, fallback: string) {
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  const initials = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials.slice(0, 2) || fallback;
}

function TeamLogoImage({
  src,
  className,
  alt = "",
  outlierRatio = 1.15,
}: {
  src: string;
  className: string;
  alt?: string;
  outlierRatio?: number;
}) {
  const [ratioOutlier, setRatioOutlier] = useState(false);
  useEffect(() => {
    setRatioOutlier(false);
  }, [src]);

  return (
    <img
      className={`${className}${ratioOutlier ? " is-ratio-outlier" : ""}`}
      src={src}
      alt={alt}
      onLoad={(event) => {
        const image = event.currentTarget;
        const { naturalWidth, naturalHeight } = image;
        if (!naturalWidth || !naturalHeight) {
          setRatioOutlier(false);
          return;
        }

        const ratio = naturalWidth / naturalHeight;
        const ratioFloor = 1 / outlierRatio;
        setRatioOutlier(ratio >= outlierRatio || ratio <= ratioFloor);
      }}
      onError={() => setRatioOutlier(false)}
    />
  );
}

function MatchTeamRow({
  label,
  name,
  code,
  logoUrl,
}: {
  label: string;
  name: string;
  code: string;
  logoUrl: string;
}) {
  const compactCode = code.trim();
  const displayName = name.trim() || `Team ${label}`;
  const labelWithCode = compactCode ? `${displayName} (${compactCode})` : displayName;

  return (
    <div className="match-info-team-row">
      <div className="match-info-team-row__label">{label}</div>
      <div className="match-info-team-row__avatar">
        {logoUrl.trim() ? (
          <TeamLogoImage className="match-info-team-row__img" src={logoUrl} alt="" />
        ) : (
          <span>{getTeamInitials(name, label)}</span>
        )}
      </div>
      <div className="match-info-team-row__copy">
        <strong>{labelWithCode}</strong>
        <span>{logoUrl.trim() ? "Logo linked" : "No logo set"}</span>
      </div>
    </div>
  );
}

function MatchInfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="match-info-field">
      <span className="label">{label}</span>
      <strong>{formatMatchField(value)}</strong>
    </div>
  );
}

function MatchMiniLogo({
  name,
  logoUrl,
  fallback,
}: {
  name: string;
  logoUrl: string;
  fallback: string;
}) {
  return (
    <div className="match-info-mini-logo" title={name.trim() || fallback}>
      {logoUrl.trim() ? (
        <TeamLogoImage className="match-info-mini-logo__img" src={logoUrl} alt="" />
      ) : (
        <span>{getTeamInitials(name, fallback)}</span>
      )}
    </div>
  );
}

export function App({
  eventId,
  onNavigate,
  tournaments,
  selectedTournamentId,
  onSelectTournament,
  onCreateTournament,
  onEditTournament,
  onDeleteTournament,
  currentUser,
  pageAccess,
}: Props) {
  const [snapshot, setSnapshot] = useState<CueSheetSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    mode: "create",
    eventId: null,
  });
  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [matchInfoOpen, setMatchInfoOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem(MATCH_INFO_COLLAPSE_STORAGE_KEY);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch {
      // Ignore storage failures.
    }
    return true;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [versionLogModalOpen, setVersionLogModalOpen] = useState(false);
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [activationOptions, setActivationOptions] = useState<Activation[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [phaseMinuteAdjustments, setPhaseMinuteAdjustments] = useState<Record<string, number>>({});
  const [undoStack, setUndoStack] = useState<CueEvent[][]>([]);
  const versionMenuRef = useRef<HTMLDivElement | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingPhaseDriftRef = useRef<Record<string, number>>({});
  const phaseDriftTimerRef = useRef<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<CueColumnKey, boolean>>({
    index: true,
    activation: true,
    timecode: true,
    duration: true,
    timeTo0: true,
    category: true,
    cue: true,
    asset: true,
    operator: true,
    status: true,
    notes: true,
    actions: true,
  });

  const columnOptions: Array<{ key: CueColumnKey; label: string }> = [
    { key: "index", label: "#" },
    { key: "activation", label: "Activation" },
    { key: "timecode", label: "Timecode" },
    { key: "duration", label: "Duration" },
    { key: "timeTo0", label: "Time To 0" },
    { key: "category", label: "Category" },
    { key: "cue", label: "Cue" },
    { key: "asset", label: "Asset / Template" },
    { key: "operator", label: "Operator" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
    { key: "actions", label: "Actions" },
  ];

  useEffect(() => {
    let active = true;
    setError("");

    api
      .getCueSheet(eventId)
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setSnapshot(null);
        }
      });

    const socket = io();
    socket.on("cuesheet:updated", (payload: { eventId: string; snapshot: CueSheetSnapshot }) => {
      if (payload?.eventId === eventId && payload?.snapshot) {
        setSnapshot(payload.snapshot);
      }
    });

    return () => {
      active = false;
      socket.close();
    };
  }, [eventId]);

  useEffect(() => {
    let active = true;
    if (!selectedTournamentId.trim()) {
      setActivationOptions([]);
      setVenues([]);
      return () => {
        active = false;
      };
    }
    api.getActivations(selectedTournamentId).then((rows) => {
      if (active) setActivationOptions(rows);
    }).catch(() => {
      if (active) setActivationOptions([]);
    });
    api.getVenues(selectedTournamentId).then((rows) => {
      if (active) setVenues(rows);
    }).catch(() => {
      if (active) setVenues([]);
    });
    return () => {
      active = false;
    };
  }, [selectedTournamentId]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (versionMenuRef.current && !versionMenuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (tableMenuRef.current && !tableMenuRef.current.contains(event.target as Node)) {
        setTableMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setSelectedTimelineEventId(null);
    if (phaseDriftTimerRef.current !== null) {
      window.clearTimeout(phaseDriftTimerRef.current);
      phaseDriftTimerRef.current = null;
    }
    pendingPhaseDriftRef.current = {};
    setPhaseMinuteAdjustments({});
    setUndoStack([]);
  }, [eventId]);

  useEffect(
    () => () => {
      if (phaseDriftTimerRef.current !== null) {
        window.clearTimeout(phaseDriftTimerRef.current);
        phaseDriftTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_CUESHEET_EVENT_STORAGE_KEY, eventId);
    } catch {
      // Ignore storage failures.
    }
  }, [eventId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MATCH_INFO_COLLAPSE_STORAGE_KEY, matchInfoOpen ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, [matchInfoOpen]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName?.toLowerCase() || "";
        const isTypingContext =
          target?.isContentEditable ||
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select";
        if (isTypingContext || busy || !undoStack.length) return;
        event.preventDefault();
        const [previousRows, ...rest] = undoStack;
        void run(async () => {
          setSnapshot(await api.restoreRows(eventId, previousRows));
          setUndoStack(rest);
        });
        return;
      }
      if (!event.altKey || event.key.toLowerCase() !== "n") return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase() || "";
      const isTypingContext =
        target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";
      if (isTypingContext) return;
      if (editor.open) return;
      if (!hasPrivilege(currentUser, "cuesheet", "edit")) return;
      event.preventDefault();
      openCreateModal();
    }

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [busy, currentUser, editor.open, eventId, undoStack]);

  useEffect(() => {
    if (selectedTimelineEventId) return;
    const firstEvent = snapshot?.events?.[0];
    if (firstEvent) setSelectedTimelineEventId(firstEvent.id);
  }, [snapshot, selectedTimelineEventId]);

  useEffect(() => {
    if (!versionLogModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setVersionLogModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [versionLogModalOpen]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function cloneRows(rows: CueEvent[]) {
    return rows.map((row) => ({
      ...row,
      screenTargets: row.screenTargets ? row.screenTargets.map((item) => ({ ...item })) : [],
    }));
  }

  function pushUndoRows(rows: CueEvent[]) {
    const cloned = cloneRows(rows);
    setUndoStack((prev) => [cloned, ...prev].slice(0, 40));
  }

  function requestConfirm(
    title: string,
    description: string,
    actionLabel: string,
    onApprove: () => Promise<void>,
  ) {
    setConfirm({
      open: true,
      title,
      description,
      actionLabel,
      onApprove,
    });
  }

  function closeConfirm() {
    if (busy) return;
    setConfirm(initialConfirm);
  }

  function openCreateModal() {
    setDraft((current) => ({
      ...emptyDraft,
      phase: phaseOptions[0]?.key || current.phase || emptyDraft.phase,
    }));
    setEditor({ open: true, mode: "create", eventId: null });
  }

  function openEditModal(event: CueEvent) {
    setDraft(draftFromEvent(event));
    setEditor({ open: true, mode: "edit", eventId: event.id });
  }

  function submitEditor() {
    if (editor.mode === "create") {
      requestConfirm(
        "Create New Cue Event",
        "Confirm adding this record to the cuesheet.",
        "Create",
        async () => {
          const previousRows = cloneRows(snapshot?.events ?? []);
          await run(async () => {
            setSnapshot(await api.addRow(eventId, draft));
            pushUndoRows(previousRows);
            setEditor({ open: false, mode: "create", eventId: null });
            setDraft(emptyDraft);
          });
          setConfirm(initialConfirm);
        },
      );
      return;
    }

    if (!editor.eventId) return;
    const rowId = editor.eventId;
    requestConfirm(
      "Update Cue Event",
      "Confirm record update.",
      "Save",
      async () => {
        const previousRows = cloneRows(snapshot?.events ?? []);
        await run(async () => {
          setSnapshot(await api.updateRow(eventId, rowId, draft));
          pushUndoRows(previousRows);
          setEditor({ open: false, mode: "create", eventId: null });
          setDraft(emptyDraft);
        });
        setConfirm(initialConfirm);
      },
    );
  }

  const matchInfo = matchInfoToDraft(snapshot?.metadata?.match);
  const selectedVenue =
    venues.find((venue) => venue.id === matchInfo.venueId) ??
    venues.find((venue) => venue.name === matchInfo.venue);
  const selectedTournament =
    tournaments.find((item) => item.id === selectedTournamentId) ?? tournaments[0] ?? null;
  const phaseOptions = selectedTournament?.eventPhases?.length
    ? selectedTournament.eventPhases
    : PHASES;
  const activationDurationsById = useMemo(
    () =>
      Object.fromEntries(
        activationOptions.map((activation) => [
          activation.id,
          Math.max(0, Math.round((activation.durationMs ?? 0) / 1000)),
        ]),
      ) as Record<string, number>,
    [activationOptions],
  );
  const screenOptions = (selectedVenue?.tech?.screens ?? []).map((screen, index) => ({
    id: screen.id,
    label: `${screen.type.replaceAll("_", " ")} ${index + 1}`,
    type: screen.type,
  }));

  function adjustPhaseMinutes(phaseKey: string, deltaMinutes: number) {
    const pending = pendingPhaseDriftRef.current;
    pending[phaseKey] = (pending[phaseKey] ?? 0) + deltaMinutes;

    if (phaseDriftTimerRef.current !== null) {
      window.clearTimeout(phaseDriftTimerRef.current);
    }

    phaseDriftTimerRef.current = window.setTimeout(() => {
      const batch = pendingPhaseDriftRef.current;
      pendingPhaseDriftRef.current = {};
      phaseDriftTimerRef.current = null;

      setPhaseMinuteAdjustments((prev) => {
        const next = { ...prev };
        for (const [key, delta] of Object.entries(batch)) {
          const value = (next[key] ?? 0) + delta;
          if (value === 0) {
            delete next[key];
          } else {
            next[key] = value;
          }
        }
        return next;
      });
    }, PHASE_DRIFT_DEBOUNCE_MS);
  }

  async function insertBlankRowAfter(row: CueEvent) {
    if (!hasPrivilege(currentUser, "cuesheet", "edit")) return;
    const orderedBefore = [...(snapshot?.events ?? [])].sort((a, b) => a.rowOrder - b.rowOrder);
    if (!orderedBefore.length) return;
    const previousRows = cloneRows(snapshot?.events ?? []);
    const existingIds = new Set(orderedBefore.map((item) => item.id));

    await run(async () => {
      const createdSnapshot = await api.addRow(eventId, {
        phase: row.phase,
        category: "",
        cue: "",
        asset: "",
        operator: "",
        audio: "",
        script: "",
        activationId: "",
        status: "pending",
        notes: "",
      });

      const orderedWithNew = [...(createdSnapshot.events ?? [])].sort((a, b) => a.rowOrder - b.rowOrder);
      const createdRow = orderedWithNew.find((item) => !existingIds.has(item.id));
      if (!createdRow) {
        setSnapshot(createdSnapshot);
        return;
      }

      const nextIds = orderedWithNew.map((item) => item.id).filter((id) => id !== createdRow.id);
      const anchorIndex = nextIds.findIndex((id) => id === row.id);
      if (anchorIndex === -1) {
        setSnapshot(createdSnapshot);
        return;
      }
      nextIds.splice(anchorIndex + 1, 0, createdRow.id);
      setSnapshot(await api.reorderRows(eventId, nextIds));
      pushUndoRows(previousRows);
    });
  }

  async function groupRows(rowIds: string[], group: { name: string; color: string }) {
    if (!hasPrivilege(currentUser, "cuesheet", "edit")) return;
    const currentRows = snapshot?.events ?? [];
    if (!currentRows.length || !rowIds.length) return;
    const selectedIds = new Set(rowIds);
    const groupId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `group-${Date.now()}`;
    const nextRows = currentRows.map((row) =>
      selectedIds.has(row.id)
        ? {
            ...row,
            groupId,
            groupName: group.name.trim() || "Group",
            groupColor: group.color || "#6aa8ff",
          }
        : row,
    );
    const previousRows = cloneRows(currentRows);
    await run(async () => {
      setSnapshot(await api.restoreRows(eventId, nextRows));
      pushUndoRows(previousRows);
    });
  }

  function requestDeleteRows(rowIds: string[]) {
    if (!hasPrivilege(currentUser, "cuesheet", "edit")) return;
    const currentRows = snapshot?.events ?? [];
    if (!currentRows.length || !rowIds.length) return;
    requestConfirm(
      "Delete Selected Rows",
      `Permanently delete ${rowIds.length} selected rows?`,
      "Delete",
      async () => {
        const selectedIds = new Set(rowIds);
        const nextRows = currentRows.filter((row) => !selectedIds.has(row.id));
        const previousRows = cloneRows(currentRows);
        await run(async () => {
          setSnapshot(await api.restoreRows(eventId, nextRows));
          pushUndoRows(previousRows);
        });
        setConfirm(initialConfirm);
      },
    );
  }

  useEffect(() => {
    if (!editor.open) return;
    if (phaseOptions.some((phase) => phase.key === draft.phase)) return;
    setDraft((prev) => ({
      ...prev,
      phase: phaseOptions[0]?.key || prev.phase,
    }));
  }, [draft.phase, editor.open, phaseOptions]);

  return (
    <div className="page-shell">
      <AppSidebar
        active="events"
        onNavigate={onNavigate}
        tournaments={tournaments}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={onSelectTournament}
        onCreateTournament={onCreateTournament}
        onEditTournament={onEditTournament}
        onDeleteTournament={onDeleteTournament}
        pageAccess={pageAccess}
      />

      <main className="main-content">
        <Card className="match-info-card">
          <CardHeader className="match-info-header">
            <div className="match-info-header-left">
              <CardTitle>Match Info</CardTitle>
              <div className="match-info-inline">
                <span className="match-info-inline__id">
                  {matchInfo.matchId || "Unassigned match"}
                </span>
                <div className="match-info-inline__teams">
                  <MatchMiniLogo
                    name={matchInfo.teamAName}
                    logoUrl={matchInfo.teamALogoUrl}
                    fallback="A"
                  />
                  <MatchMiniLogo
                    name={matchInfo.teamBName}
                    logoUrl={matchInfo.teamBLogoUrl}
                    fallback="B"
                  />
                </div>
                <span className="match-info-inline__item">
                  <i className="fa-solid fa-city" />
                  {formatMatchField(matchInfo.city)}
                </span>
                <span className="match-info-inline__item">
                  <i className="fa-solid fa-door-open" />
                  {formatMatchField(matchInfo.gatesOpen)}
                </span>
                <span className="match-info-inline__item">
                  <i className="fa-solid fa-futbol" />
                  {formatMatchField(matchInfo.kickoffTime)}
                </span>
              </div>
            </div>
            <div className="match-info-header-right" ref={versionMenuRef}>
              <Button
                variant="ghost"
                size="icon"
                title="Open menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <i className="fa-solid fa-ellipsis-vertical" />
              </Button>
              {menuOpen ? (
                <div className="version-menu">
                  <button
                    className="version-menu__item"
                    onClick={() => {
                      setVersionLogModalOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    <i className="fa-solid fa-clock-rotate-left" />
                    <span>Version Log</span>
                  </button>
                </div>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                title={matchInfoOpen ? "Collapse match info" : "Expand match info"}
                onClick={() => setMatchInfoOpen((open) => !open)}
              >
                <i className={`fa-solid ${matchInfoOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className={`match-info-grid-wrap ${matchInfoOpen ? "open" : "closed"}`}>
            <div className="match-info-shell">
              <div className="match-info-hero">
                <span className="match-info-kicker">MATCH ID</span>
                <strong className="match-info-id">{matchInfo.matchId || "Unassigned match"}</strong>
                <div className="match-info-hero__meta">
                  <span>{formatMatchField(matchInfo.city)}</span>
                  <span>{formatMatchField(matchInfo.date)}</span>
                  <span>{formatMatchField(matchInfo.venue)}</span>
                </div>
              </div>

              <div className="match-info-teams">
                <MatchTeamRow
                  label="A"
                  name={matchInfo.teamAName}
                  code={matchInfo.teamACode}
                  logoUrl={matchInfo.teamALogoUrl}
                />
                <MatchTeamRow
                  label="B"
                  name={matchInfo.teamBName}
                  code={matchInfo.teamBCode}
                  logoUrl={matchInfo.teamBLogoUrl}
                />
              </div>

              <div className="match-info-fields">
                <MatchInfoField label="Gates Open" value={matchInfo.gatesOpen} />
                <MatchInfoField label="City" value={matchInfo.city} />
                <MatchInfoField label="Date" value={matchInfo.date} />
                <MatchInfoField label="Kick-off (Local Time)" value={matchInfo.kickoffTime} />
                <MatchInfoField label="Venue" value={matchInfo.venue} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="table-card">
          <CardHeader className="table-card__header">
            <div className="table-card__titlebar">
              <CardTitle>Activation Table</CardTitle>
              <div className="table-actions-menu-wrap" ref={tableMenuRef}>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setTableMenuOpen((open) => !open)}
                  title="Table actions"
                >
                  <i className="fa-solid fa-ellipsis" />
                </Button>
                {tableMenuOpen ? (
                  <div className="table-actions-menu">
                    <button
                      type="button"
                      className="table-actions-menu__item"
                      disabled={busy || !hasPrivilege(currentUser, "cuesheet", "edit")}
                      onClick={() => {
                        openCreateModal();
                        setTableMenuOpen(false);
                      }}
                    >
                      <i className="fa-solid fa-plus" />
                      <span>Add record</span>
                    </button>
                    <button
                      type="button"
                      className="table-actions-menu__item"
                      disabled={busy || !hasPrivilege(currentUser, "cuesheet", "import")}
                      onClick={() => {
                        requestConfirm(
                          "Import Context XLSX",
                          "This replaces the current cuesheet with the imported context XLSX file.",
                          "Import",
                          async () => {
                            await run(async () => setSnapshot(await api.importDefault(eventId)));
                            setConfirm(initialConfirm);
                          },
                        );
                        setTableMenuOpen(false);
                      }}
                    >
                      <i className="fa-solid fa-file-import" />
                      <span>Import default</span>
                    </button>
                    <label className="table-actions-menu__item table-actions-menu__upload">
                      <i className="fa-solid fa-upload" />
                      <span>Upload xlsx</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        hidden
                        disabled={!hasPrivilege(currentUser, "cuesheet", "import")}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          requestConfirm(
                            "Upload Context XLSX",
                            `Confirm import of file ${file.name}?`,
                            "Upload",
                            async () => {
                              await run(async () => {
                                setSnapshot(await api.importXlsx(eventId, file));
                              });
                              setConfirm(initialConfirm);
                            },
                          );
                          setTableMenuOpen(false);
                        }}
                      />
                    </label>
                    <div className="table-actions-menu__divider" />
                    <p className="table-actions-menu__section">Column selection</p>
                    {columnOptions.map((option) => (
                      <label key={option.key} className="table-actions-menu__check">
                        <input
                          type="checkbox"
                          checked={visibleColumns[option.key]}
                          onChange={(event) =>
                            setVisibleColumns((prev) => ({
                              ...prev,
                              [option.key]: event.target.checked,
                            }))
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="table-stack">
              <CueTable
                events={snapshot?.events ?? []}
                activationDurationsById={activationDurationsById}
                phaseOptions={phaseOptions}
                phaseMinuteAdjustments={phaseMinuteAdjustments}
                kickoffTime={matchInfo.kickoffTime}
                onAdjustPhaseMinutes={adjustPhaseMinutes}
                onGroupRows={(rowIds, group) => {
                  void groupRows(rowIds, group);
                }}
                onDeleteRows={requestDeleteRows}
                onInsertAfter={hasPrivilege(currentUser, "cuesheet", "edit") ? insertBlankRowAfter : undefined}
                visibleColumns={columnOptions
                  .filter((option) => visibleColumns[option.key])
                  .map((option) => option.key)}
                scrollToEventId={selectedTimelineEventId}
                onEdit={(event) => {
                  if (!hasPrivilege(currentUser, "cuesheet", "edit")) return;
                  openEditModal(event);
                }}
                onDelete={(event) =>
                  hasPrivilege(currentUser, "cuesheet", "edit") ?
                  requestConfirm(
                    "Delete Cue Event",
                    `Permanently delete "${event.cue || event.id}"?`,
                    "Delete",
                    async () => {
                      const previousRows = cloneRows(snapshot?.events ?? []);
                      await run(async () => setSnapshot(await api.deleteRow(eventId, event.id)));
                      pushUndoRows(previousRows);
                      setConfirm(initialConfirm);
                    },
                  ) : undefined
                }
                onReorderRows={(orderedIds) => {
                  if (!hasPrivilege(currentUser, "cuesheet", "reorder")) return;
                  const previousRows = cloneRows(snapshot?.events ?? []);
                  requestConfirm(
                    "Reorder CueSheet",
                    "Confirm the new order? The system will recalculate timecodes.",
                    "Apply",
                    async () => {
                      await run(async () => setSnapshot(await api.reorderRows(eventId, orderedIds)));
                      pushUndoRows(previousRows);
                      setConfirm(initialConfirm);
                    },
                  );
                }}
              />
              <CuesheetTimeline
                events={snapshot?.events ?? []}
                selectedEventId={selectedTimelineEventId}
                onSelectEvent={setSelectedTimelineEventId}
              />
            </div>
          </CardContent>
        </Card>

        {error ? (
          <p className="error">
            {error}
            <button type="button" className="link-button" onClick={() => onNavigate("/events")}>
              Back to events
            </button>
          </p>
        ) : null}
      </main>

      <EventFormModal
        open={editor.open}
        title={editor.mode === "create" ? "Insert Cue Record" : "Edit Cue Record"}
        draft={draft}
        activationOptions={activationOptions}
        phaseOptions={phaseOptions}
        screenOptions={screenOptions}
        onChange={setDraft}
        onClose={() => setEditor({ open: false, mode: "create", eventId: null })}
        onSubmit={submitEditor}
        submitLabel={editor.mode === "create" ? "Create" : "Save"}
        busy={busy}
      />

      <HardConfirmModal
        open={confirm.open}
        title={confirm.title}
        description={confirm.description}
        actionLabel={confirm.actionLabel}
        busy={busy}
        onCancel={closeConfirm}
        onApprove={async () => {
          if (!confirm.onApprove) return;
          await confirm.onApprove();
        }}
      />

      {versionLogModalOpen ? (
        <div className="modal-overlay" onMouseDown={() => setVersionLogModalOpen(false)}>
          <Card className="modal modal-log" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader className="modal-log__header">
              <div>
                <CardTitle>Version Log</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="Close"
                onClick={() => setVersionLogModalOpen(false)}
              >
                <i className="fa-solid fa-xmark" />
              </Button>
            </CardHeader>
            <CardContent className="modal-log__content">
              <ul>
                {(snapshot?.versions ?? []).slice(0, 120).map((version) => (
                  <li key={version.id}>
                    <span>{new Date(version.timestamp).toLocaleString()}</span>
                    <span>{version.action}</span>
                    <span>{version.actor}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
