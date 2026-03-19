import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { CueTable } from "../components/CueTable";
import type { CueColumnKey } from "../components/CueTable";
import { CuesheetTimeline } from "../components/CuesheetTimeline";
import { MatchPlannerModal } from "../components/MatchPlannerModal";
import {
  EventFormModal,
  type EventDraft,
  draftFromEvent,
  emptyDraft,
} from "../components/EventFormModal";
import { HardConfirmModal } from "../components/HardConfirmModal";
import { api } from "../lib/api";
import type { CueEvent, CueSheetSnapshot, MatchInfoDraft } from "../lib/api";
import { emptyMatchInfo, matchInfoToDraft } from "../lib/api";
import { Button } from "../components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";

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
          <img className="match-info-team-row__img" src={logoUrl} alt="" />
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
        <img src={logoUrl} alt="" />
      ) : (
        <span>{getTeamInitials(name, fallback)}</span>
      )}
    </div>
  );
}

function moveByIds(events: CueEvent[], draggedId: string, targetId: string) {
  const next = [...events];
  const from = next.findIndex((event) => event.id === draggedId);
  const to = next.findIndex((event) => event.id === targetId);
  if (from === -1 || to === -1 || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function App() {
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
  const [matchInfoOpen, setMatchInfoOpen] = useState(true);
  const [matchPlannerOpen, setMatchPlannerOpen] = useState(false);
  const [matchPlannerDraft, setMatchPlannerDraft] = useState<MatchInfoDraft>(emptyMatchInfo());
  const [menuOpen, setMenuOpen] = useState(false);
  const [versionLogModalOpen, setVersionLogModalOpen] = useState(false);
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const versionMenuRef = useRef<HTMLDivElement | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
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
    api
      .getCueSheet()
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch((err) => setError(err.message));

    const socket = io();
    socket.on("cuesheet:updated", (data: CueSheetSnapshot) => {
      setSnapshot(data);
    });
    return () => {
      active = false;
      socket.close();
    };
  }, []);

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
    if (selectedTimelineEventId) return;
    const firstEvent = snapshot?.events?.[0];
    if (firstEvent) setSelectedTimelineEventId(firstEvent.id);
  }, [snapshot, selectedTimelineEventId]);

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
    setDraft(emptyDraft);
    setEditor({ open: true, mode: "create", eventId: null });
  }

  function openMatchPlanner() {
    setMatchPlannerDraft(matchInfoToDraft(snapshot?.metadata?.match));
    setMatchPlannerOpen(true);
  }

  function closeMatchPlanner() {
    if (busy) return;
    setMatchPlannerOpen(false);
  }

  function openEditModal(event: CueEvent) {
    setDraft(draftFromEvent(event));
    setEditor({ open: true, mode: "edit", eventId: event.id });
  }

  function submitEditor() {
    if (editor.mode === "create") {
      requestConfirm(
        "Create New Cue Event",
        "Conferma inserimento record nel cuesheet.",
        "Create",
        async () => {
          await run(async () => {
            setSnapshot(await api.addEvent(draft));
            setEditor({ open: false, mode: "create", eventId: null });
            setDraft(emptyDraft);
          });
          setConfirm(initialConfirm);
        },
      );
      return;
    }

    if (!editor.eventId) return;
    const eventId = editor.eventId;
    requestConfirm(
      "Update Cue Event",
      "Conferma modifica record.",
      "Save",
      async () => {
        await run(async () => {
          setSnapshot(await api.updateEvent(eventId, draft));
          setEditor({ open: false, mode: "create", eventId: null });
          setDraft(emptyDraft);
        });
        setConfirm(initialConfirm);
      },
    );
  }

  function submitMatchInfo() {
    void run(async () => {
      const nextSnapshot = await api.saveMatchInfo(matchPlannerDraft);
      setSnapshot(nextSnapshot);
      setMatchPlannerOpen(false);
    });
  }

  const matchInfo = matchInfoToDraft(snapshot?.metadata?.match);

  return (
    <div className="page-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img
            className="sidebar-brand__logo"
            src="/mock_liveengine%20logo.png"
            alt="Live Engine"
          />
        </div>
        <nav className="sidebar-nav">
          <button className="sidebar-nav__item is-active">
            <i className="fa-solid fa-table-list" />
            <span>Dashboard</span>
          </button>
        </nav>
      </aside>

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
                variant="outline"
                size="sm"
                className="planner-trigger"
                title="Open planner wizard"
                onClick={openMatchPlanner}
              >
                <i className="fa-solid fa-sliders" />
                <span className="planner-trigger__label">Planner / Wizard</span>
              </Button>
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
                <MatchInfoField label="Kickoff Time" value={matchInfo.kickoffTime} />
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
                      disabled={busy}
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
                      disabled={busy}
                      onClick={() => {
                        requestConfirm(
                          "Import Context XLSX",
                          "Sostituisce l'attuale cuesheet con import da file xlsx di contesto.",
                          "Import",
                          async () => {
                            await run(async () => setSnapshot(await api.importDefault()));
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
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          requestConfirm(
                            "Upload Context XLSX",
                            `Confermi import del file ${file.name}?`,
                            "Upload",
                            async () => {
                              await run(async () => {
                                setSnapshot(await api.importXlsx(file));
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
                visibleColumns={columnOptions
                  .filter((option) => visibleColumns[option.key])
                  .map((option) => option.key)}
                scrollToEventId={selectedTimelineEventId}
                onEdit={openEditModal}
                onDelete={(event) =>
                  requestConfirm(
                    "Delete Cue Event",
                    `Eliminare definitivamente "${event.cue || event.id}"?`,
                    "Delete",
                    async () => {
                      await run(async () => setSnapshot(await api.deleteEvent(event.id)));
                      setConfirm(initialConfirm);
                    },
                  )
                }
                onReorder={(draggedId, targetId) => {
                  const ordered = [...(snapshot?.events ?? [])].sort(
                    (a, b) => a.rowOrder - b.rowOrder,
                  );
                  const nextOrdered = moveByIds(ordered, draggedId, targetId);
                  requestConfirm(
                    "Reorder CueSheet",
                    "Confermi il nuovo ordine? Il sistema ricalcolera i timecode.",
                    "Apply",
                    async () => {
                      await run(async () =>
                        setSnapshot(await api.reorderEvents(nextOrdered.map((event) => event.id))),
                      );
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

        {error ? <p className="error">{error}</p> : null}
      </main>

      <EventFormModal
        open={editor.open}
        title={editor.mode === "create" ? "Insert Cue Record" : "Edit Cue Record"}
        draft={draft}
        onChange={setDraft}
        onClose={() => setEditor({ open: false, mode: "create", eventId: null })}
        onSubmit={submitEditor}
        submitLabel={editor.mode === "create" ? "Create" : "Save"}
        busy={busy}
      />

      <MatchPlannerModal
        open={matchPlannerOpen}
        draft={matchPlannerDraft}
        onChange={setMatchPlannerDraft}
        onClose={closeMatchPlanner}
        onSubmit={submitMatchInfo}
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
        <div className="modal-overlay">
          <Card className="modal modal-log">
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

