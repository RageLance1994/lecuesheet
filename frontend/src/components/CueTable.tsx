import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PHASES } from "../lib/api";
import type { CueEvent, EventPhase } from "../lib/api";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/Table";

export type CueColumnKey =
  | "index"
  | "activation"
  | "timecode"
  | "duration"
  | "timeTo0"
  | "category"
  | "cue"
  | "asset"
  | "operator"
  | "status"
  | "notes"
  | "actions";

type ColumnDef = {
  key: CueColumnKey;
  label: string;
  template: string;
};

const COLUMN_DEFS: ColumnDef[] = [
  { key: "index", label: "#", template: "44px" },
  { key: "activation", label: "Activation", template: "192px" },
  { key: "timecode", label: "Timecode", template: "94px" },
  { key: "duration", label: "Duration", template: "94px" },
  { key: "timeTo0", label: "Time To 0", template: "94px" },
  { key: "category", label: "Category", template: "minmax(0, 0.8fr)" },
  { key: "cue", label: "Cue", template: "minmax(0, 1.6fr)" },
  { key: "asset", label: "Asset / Template", template: "minmax(0, 1.2fr)" },
  { key: "operator", label: "Operator", template: "minmax(0, 0.8fr)" },
  { key: "status", label: "Status", template: "96px" },
  { key: "notes", label: "Notes", template: "minmax(0, 1fr)" },
  { key: "actions", label: "Actions", template: "88px" },
];

type Props = {
  events: CueEvent[];
  phaseOptions?: readonly EventPhase[];
  kickoffTime?: string | null;
  phaseMinuteAdjustments?: Readonly<Record<string, number>>;
  onPhaseMinuteAdjustmentsChange?: (next: Record<string, number>) => void;
  onAdjustPhaseMinutes?: (phaseKey: string, deltaMinutes: number) => void;
  onInsertAfter?: (event: CueEvent) => void;
  onEdit: (event: CueEvent) => void;
  onDelete: (event: CueEvent) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  scrollToEventId?: string | null;
  visibleColumns: CueColumnKey[];
};

function parseTimecodeToSeconds(timecode: string) {
  const parts = timecode.split(":").map((value) => Number(value));
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return null;
  const [hours, minutes, seconds] = parts;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(totalSeconds, 0);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatClock(totalSeconds: number) {
  const normalized = ((totalSeconds % 86400) + 86400) % 86400;
  const hh = String(Math.floor(normalized / 3600)).padStart(2, "0");
  const mm = String(Math.floor((normalized % 3600) / 60)).padStart(2, "0");
  const ss = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatRelativeMinutes(totalMinutes: number) {
  const sign = totalMinutes >= 0 ? "+" : "";
  return `T${sign}${totalMinutes}m`;
}

function formatSignedMinutes(totalMinutes: number) {
  const sign = totalMinutes >= 0 ? "+" : "";
  return `${sign}${totalMinutes}m`;
}

function isKickoffPhaseKey(phase: EventPhase) {
  const text = `${phase.key} ${phase.label}`.toUpperCase();
  return (
    text.includes("KICK OFF") ||
    text.includes("KICKOFF") ||
    text.includes("TIP OFF") ||
    text.includes("TIPOFF")
  );
}

export function CueTable({
  events,
  phaseOptions = PHASES,
  kickoffTime = null,
  phaseMinuteAdjustments,
  onPhaseMinuteAdjustmentsChange,
  onAdjustPhaseMinutes,
  onInsertAfter,
  onEdit,
  onDelete,
  onReorder,
  scrollToEventId = null,
  visibleColumns,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [flashEventId, setFlashEventId] = useState<string | null>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [localPhaseMinuteAdjustments, setLocalPhaseMinuteAdjustments] = useState<
    Record<string, number>
  >({});
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ordered = useMemo(
    () => [...events].sort((a, b) => a.rowOrder - b.rowOrder),
    [events],
  );

  const activeColumns = useMemo(() => {
    const cols = COLUMN_DEFS.filter((column) => visibleColumns.includes(column.key));
    return cols.length ? cols : [COLUMN_DEFS[0], COLUMN_DEFS[1], COLUMN_DEFS[11]];
  }, [visibleColumns]);

  const gridTemplate = useMemo(
    () => activeColumns.map((column) => column.template).join(" "),
    [activeColumns],
  );

  const phaseList = useMemo(
    () => (phaseOptions?.length ? [...phaseOptions] : [...PHASES]),
    [phaseOptions],
  );

  const phaseSignature = useMemo(
    () => phaseList.map((phase) => `${phase.key}:${phase.label}:${phase.offsetMinutes}`).join("|"),
    [phaseList],
  );

  useEffect(() => {
    setLocalPhaseMinuteAdjustments({});
  }, [phaseSignature]);

  const effectivePhaseMinuteAdjustments = phaseMinuteAdjustments ?? localPhaseMinuteAdjustments;

  const kickoffPhaseKey = useMemo(() => {
    const byKeywords = phaseList.find((phase) => isKickoffPhaseKey(phase));
    return byKeywords?.key ?? "KICK_OFF";
  }, [phaseList]);

  const kickoffSeconds = useMemo(() => {
    const explicitKickoffSeconds = kickoffTime ? parseTimecodeToSeconds(kickoffTime) : null;
    if (explicitKickoffSeconds !== null) return explicitKickoffSeconds;
    const kickoffEvent = ordered.find((event) => event.phase === kickoffPhaseKey);
    if (!kickoffEvent) return null;
    return parseTimecodeToSeconds(kickoffEvent.timecode);
  }, [kickoffTime, ordered, kickoffPhaseKey]);

  const phaseBlocks = useMemo(() => {
    const blocks = phaseList.map((phase) => ({ phase, events: [] as CueEvent[] }));
    const indexByKey = new Map(phaseList.map((phase, index) => [phase.key, index] as const));
    const unknownIndexByKey = new Map<string, number>();
    const unknownBlocks: Array<{ phase: EventPhase; events: CueEvent[] }> = [];

    ordered.forEach((event) => {
      const knownIndex = indexByKey.get(event.phase);
      if (knownIndex !== undefined) {
        blocks[knownIndex].events.push(event);
        return;
      }

      const unknownIndex = unknownIndexByKey.get(event.phase);
      if (unknownIndex !== undefined) {
        unknownBlocks[unknownIndex].events.push(event);
        return;
      }

      unknownIndexByKey.set(event.phase, unknownBlocks.length);
      unknownBlocks.push({
        phase: {
          key: event.phase,
          label: event.phase,
          offsetMinutes: 0,
        },
        events: [event],
      });
    });

    return [...blocks, ...unknownBlocks];
  }, [ordered, phaseList]);

  const cumulativeDriftByPhaseKey = useMemo(() => {
    let runningDrift = 0;
    const map = new Map<string, number>();

    phaseBlocks.forEach(({ phase }) => {
      runningDrift += effectivePhaseMinuteAdjustments[phase.key] ?? 0;
      map.set(phase.key, runningDrift);
    });

    return map;
  }, [effectivePhaseMinuteAdjustments, phaseBlocks]);

  const eventIndexById = useMemo(
    () => new Map(ordered.map((event, index) => [event.id, index] as const)),
    [ordered],
  );

  useLayoutEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const body = wrap.querySelector(".ui-table__body") as HTMLElement | null;
    if (!body) return;

    const update = () => setScrollbarWidth(Math.max(0, body.offsetWidth - body.clientWidth));
    update();
    body.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      body.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ordered.length, gridTemplate]);

  useEffect(() => {
    if (!scrollToEventId) return;
    const node = document.querySelector(
      `.cue-table .ui-table__body tr[data-event-id="${scrollToEventId}"]`,
    ) as HTMLElement | null;
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashEventId(scrollToEventId);
    const t = setTimeout(
      () => setFlashEventId((current) => (current === scrollToEventId ? null : current)),
      1500,
    );
    return () => clearTimeout(t);
  }, [scrollToEventId]);

  function parseTimecodeToDate(timecode: string) {
    const seconds = parseTimecodeToSeconds(timecode);
    if (seconds === null) return null;
    const target = new Date(now);
    target.setHours(Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60, 0);
    return target;
  }

  function statusVariant(status: string): "default" | "success" | "warning" | "danger" | "secondary" {
    if (status === "live" || status === "ready") return "success";
    if (status === "done") return "secondary";
    if (status === "blocked") return "danger";
    return "warning";
  }

  function updatePhaseMinuteAdjustment(phaseKey: string, deltaMinutes: number) {
    const currentMinutes = effectivePhaseMinuteAdjustments[phaseKey] ?? 0;
    const nextMinutes = currentMinutes + deltaMinutes;
    const nextAdjustments = { ...effectivePhaseMinuteAdjustments };

    if (nextMinutes === 0) {
      delete nextAdjustments[phaseKey];
    } else {
      nextAdjustments[phaseKey] = nextMinutes;
    }

    if (onAdjustPhaseMinutes) {
      onAdjustPhaseMinutes(phaseKey, deltaMinutes);
      return;
    }

    if (phaseMinuteAdjustments) {
      onPhaseMinuteAdjustmentsChange?.(nextAdjustments);
      return;
    }

    setLocalPhaseMinuteAdjustments(nextAdjustments);
  }

  const rowStyle = { gridTemplateColumns: gridTemplate };

  return (
    <div
      className="table-wrap"
      ref={tableWrapRef}
      style={{
        ["--cue-scrollbar" as string]: `${scrollbarWidth}px`,
        ["--cue-grid-template" as string]: gridTemplate,
      }}
    >
      <Table className="cue-table">
        <TableHeader className="sticky-head">
          <TableRow style={rowStyle}>
            {activeColumns.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {phaseBlocks.map(({ phase, events: phaseEvents }) => {
            const cumulativeDriftMinutes = cumulativeDriftByPhaseKey.get(phase.key) ?? 0;
            const adjustedPhaseMinutes = phase.offsetMinutes + cumulativeDriftMinutes;
            const separatorLabel =
              kickoffSeconds !== null
                ? formatClock(kickoffSeconds + adjustedPhaseMinutes * 60)
                : formatRelativeMinutes(adjustedPhaseMinutes);

            return (
              <Fragment key={`phase-${phase.key}`}>
                <TableRow className="phase-separator" style={rowStyle}>
                  <TableCell colSpan={activeColumns.length}>
                    <div className="phase-separator__content">
                      <div className="phase-separator__summary">
                        <span className="phase-separator__label">{phase.label}</span>
                        <div className="phase-separator__pills">
                          <span className="phase-separator__time">{separatorLabel}</span>
                          {cumulativeDriftMinutes !== 0 ? (
                            <span className="phase-separator__drift">
                              drift {formatSignedMinutes(cumulativeDriftMinutes)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="phase-separator__controls" aria-label={`${phase.label} controls`}>
                        <Button
                          variant="outline"
                          size="icon"
                          title={`Shift ${phase.label} earlier by 1 minute`}
                          aria-label={`Shift ${phase.label} earlier by 1 minute`}
                          onClick={() => updatePhaseMinuteAdjustment(phase.key, -1)}
                        >
                          <i className="fa-solid fa-minus" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          title={`Shift ${phase.label} later by 1 minute`}
                          aria-label={`Shift ${phase.label} later by 1 minute`}
                          onClick={() => updatePhaseMinuteAdjustment(phase.key, 1)}
                        >
                          <i className="fa-solid fa-plus" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
                {phaseEvents.map((event) => {
                  const globalIndex = eventIndexById.get(event.id) ?? 0;
                  const next = ordered[globalIndex + 1];
                  const target = parseTimecodeToDate(event.timecode);
                  const rawRemainingSeconds = target
                    ? Math.floor((target.getTime() - now.getTime()) / 1000)
                    : 0;
                  const overdue = rawRemainingSeconds <= 0;
                  const remainingSeconds = overdue ? 0 : rawRemainingSeconds;
                  const countdownWindowSeconds = 2 * 60 * 60;
                  const progress = overdue
                    ? 0
                    : Math.min(remainingSeconds, countdownWindowSeconds) / countdownWindowSeconds;
                  const circumference = 2 * Math.PI * 19;
                  const dashOffset = circumference * (1 - progress);
                  const currentSeconds = parseTimecodeToSeconds(event.timecode);
                  const nextSeconds = next ? parseTimecodeToSeconds(next.timecode) : null;
                  const durationSeconds =
                    currentSeconds !== null && nextSeconds !== null
                      ? Math.max(nextSeconds - currentSeconds, 0)
                      : null;
                  const timeToZeroSeconds =
                    currentSeconds !== null && kickoffSeconds !== null
                      ? Math.max(kickoffSeconds - currentSeconds, 0)
                      : null;
                  const expanded = expandedRowId === event.id;
                  const canInsertAfter = Boolean(onInsertAfter) && globalIndex < ordered.length - 1;

                  return (
                    <Fragment key={event.id}>
                      <TableRow
                        draggable
                        data-event-id={event.id}
                        style={rowStyle}
                        className={`${overId === event.id ? "drag-over" : ""} ${overdue ? "row-overdue" : ""} ${flashEventId === event.id ? "row-focused" : ""}`}
                        onDragStart={() => setDraggedId(event.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOverId(event.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!draggedId || draggedId === event.id) return;
                          onReorder(draggedId, event.id);
                          setDraggedId(null);
                          setOverId(null);
                        }}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setOverId(null);
                        }}
                        onDoubleClick={() =>
                          setExpandedRowId((current) => (current === event.id ? null : event.id))
                        }
                      >
                        {activeColumns.map((column) => {
                          switch (column.key) {
                            case "index":
                              return (
                                <TableCell key={column.key} className="row-index-cell">
                                  {globalIndex + 1}
                                </TableCell>
                              );
                            case "activation":
                              return (
                                <TableCell key={column.key} className="activation-cell">
                                  <div className="metro-track" aria-hidden />
                                  <div className="metro-node" />
                                  <div className="countdown-circle-wrap">
                                    <svg
                                      className="countdown-circle"
                                      viewBox="0 0 44 44"
                                      role="img"
                                      aria-label="Countdown"
                                    >
                                      <circle className="countdown-circle-bg" cx="22" cy="22" r="19" />
                                      <circle
                                        className={`countdown-circle-fg ${overdue ? "is-overdue" : ""}`}
                                        cx="22"
                                        cy="22"
                                        r="19"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={dashOffset}
                                      />
                                    </svg>
                                    <span>{formatDuration(remainingSeconds)}</span>
                                  </div>
                                  <Badge variant={overdue ? "danger" : "secondary"}>
                                    {overdue ? "overdue" : "scheduled"}
                                  </Badge>
                                </TableCell>
                              );
                            case "timecode":
                              return <TableCell key={column.key}>{event.timecode}</TableCell>;
                            case "duration":
                              return (
                                <TableCell key={column.key}>
                                  {durationSeconds === null ? "--:--:--" : formatDuration(durationSeconds)}
                                </TableCell>
                              );
                            case "timeTo0":
                              return (
                                <TableCell key={column.key}>
                                  {timeToZeroSeconds === null ? "--:--:--" : formatDuration(timeToZeroSeconds)}
                                </TableCell>
                              );
                            case "category":
                              return (
                                <TableCell key={column.key} className="truncate-cell">
                                  {event.category || "-"}
                                </TableCell>
                              );
                            case "cue":
                              return (
                                <TableCell key={column.key} className="truncate-cell">
                                  {event.cue || "-"}
                                </TableCell>
                              );
                            case "asset":
                              return (
                                <TableCell key={column.key} className="truncate-cell">
                                  {event.asset || "-"}
                                </TableCell>
                              );
                            case "operator":
                              return (
                                <TableCell key={column.key} className="truncate-cell">
                                  {event.operator || "-"}
                                </TableCell>
                              );
                            case "status":
                              return (
                                <TableCell key={column.key}>
                                  <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                                </TableCell>
                              );
                            case "notes":
                              return (
                                <TableCell key={column.key} className="truncate-cell">
                                  {event.notes || "-"}
                                </TableCell>
                              );
                            case "actions":
                              return (
                                <TableCell key={column.key}>
                                  <div className="icon-actions">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      title="Edit"
                                      onClick={() => onEdit(event)}
                                    >
                                      <i className="fa-solid fa-pen-to-square" />
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="icon"
                                      title="Delete"
                                      onClick={() => onDelete(event)}
                                    >
                                      <i className="fa-solid fa-trash" />
                                    </Button>
                                  </div>
                                </TableCell>
                              );
                            default:
                              return null;
                          }
                        })}
                      </TableRow>
                      {expanded ? (
                        <TableRow className="cue-row-expanded" style={rowStyle}>
                          <TableCell colSpan={activeColumns.length}>
                            <div className="cue-row-expanded__content">
                              <strong>Script</strong>
                              <p>{event.script || "-"}</p>
                              {event.screenTargets?.length ? (
                                <div className="cue-row-expanded__targets">
                                  {event.screenTargets.map((target) => (
                                    <span key={target.screenId}>
                                      {target.screenLabel}: {target.value || "-"}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {canInsertAfter ? (
                        <TableRow className="cue-insert-row" style={rowStyle}>
                          <TableCell colSpan={activeColumns.length}>
                            <button
                              type="button"
                              className="cue-insert-row__button"
                              title="Insert blank row below"
                              aria-label="Insert blank row below"
                              onClick={() => onInsertAfter?.(event)}
                            >
                              <i className="fa-solid fa-plus" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
