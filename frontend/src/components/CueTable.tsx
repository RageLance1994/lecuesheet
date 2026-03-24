import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  activationDurationsById?: Readonly<Record<string, number>>;
  phaseOptions?: readonly EventPhase[];
  kickoffTime?: string | null;
  phaseMinuteAdjustments?: Readonly<Record<string, number>>;
  onPhaseMinuteAdjustmentsChange?: (next: Record<string, number>) => void;
  onAdjustPhaseMinutes?: (phaseKey: string, deltaMinutes: number) => void;
  onGroupRows?: (rowIds: string[], group: { name: string; color: string }) => void;
  onDeleteRows?: (rowIds: string[]) => void;
  onInsertAfter?: (event: CueEvent) => void;
  onEdit: (event: CueEvent) => void;
  onDelete: (event: CueEvent) => void;
  onReorderRows?: (orderedIds: string[]) => void;
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

function formatClockFromSeconds(totalSeconds: number | null) {
  if (totalSeconds === null) return "--:--:--";
  return formatClock(totalSeconds);
}

function formatClockWithSeconds(date: Date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
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

function resolveRowSpanSeconds(
  currentSeconds: number,
  nextSeconds: number | null,
  activationSeconds: number,
) {
  // Keep marker timing aligned with visible row duration (timecode -> next timecode).
  if (nextSeconds !== null && nextSeconds > currentSeconds) return nextSeconds - currentSeconds;
  if (activationSeconds > 0) return activationSeconds;
  return 30;
}

function shortPhaseLabel(label: string) {
  const words = label
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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
  activationDurationsById = {},
  phaseOptions = PHASES,
  kickoffTime = null,
  phaseMinuteAdjustments,
  onPhaseMinuteAdjustmentsChange,
  onAdjustPhaseMinutes,
  onGroupRows,
  onDeleteRows,
  onInsertAfter,
  onEdit,
  onDelete,
  onReorderRows,
  scrollToEventId = null,
  visibleColumns,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [flashEventId, setFlashEventId] = useState<string | null>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIds: string[] } | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState("#6aa8ff");
  const [localPhaseMinuteAdjustments, setLocalPhaseMinuteAdjustments] = useState<
    Record<string, number>
  >({});
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const timeMarkerRef = useRef<HTMLDivElement | null>(null);
  const timeLineRef = useRef<HTMLDivElement | null>(null);
  const timeMarkerLabelRef = useRef<HTMLSpanElement | null>(null);
  const markerRafRef = useRef<number | null>(null);
  const liveRowIdRef = useRef<string | null>(null);
  const reloadAutoScrollDoneRef = useRef(false);
  const activePhaseKeyRef = useRef<string | null>(null);
  const phaseRailButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const validIds = new Set(events.map((event) => event.id));
    setSelectedRowIds((current) => current.filter((id) => validIds.has(id)));
    setSelectionAnchorId((current) => (current && validIds.has(current) ? current : null));
  }, [events]);

  useEffect(() => {
    if (!contextMenu) return;
    function onClick() {
      setContextMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setGroupModalOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!groupModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setGroupModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [groupModalOpen]);

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

  const timedEvents = useMemo(
    () =>
      ordered
        .map((event, index) => {
          const baseSeconds = parseTimecodeToSeconds(event.timecode);
          if (baseSeconds === null) return null;
          const driftMinutes = cumulativeDriftByPhaseKey.get(event.phase) ?? 0;
          const seconds = baseSeconds + driftMinutes * 60;

          const activationSeconds =
            event.activationId && Number.isFinite(activationDurationsById[event.activationId])
              ? Math.max(0, activationDurationsById[event.activationId] ?? 0)
              : 0;

          const nextEvent = ordered[index + 1];
          const nextBaseSeconds = parseTimecodeToSeconds(nextEvent?.timecode ?? "");
          const nextDriftMinutes = nextEvent
            ? (cumulativeDriftByPhaseKey.get(nextEvent.phase) ?? 0)
            : 0;
          const nextSeconds =
            nextBaseSeconds === null ? null : nextBaseSeconds + nextDriftMinutes * 60;
          const spanSeconds = Math.max(
            1,
            resolveRowSpanSeconds(seconds, nextSeconds, activationSeconds),
          );
          return { eventId: event.id, seconds, spanSeconds, endSeconds: seconds + spanSeconds };
        })
        .filter(
          (
            item,
          ): item is {
            eventId: string;
            seconds: number;
            spanSeconds: number;
            endSeconds: number;
          } => item !== null,
        )
        .sort((a, b) => a.seconds - b.seconds),
    [activationDurationsById, cumulativeDriftByPhaseKey, ordered],
  );

  function computeTimelineMarker(body: HTMLElement, nowSeconds: number) {
    if (!timedEvents.length) return null;

    const rowMetricsById = new Map<string, { top: number; height: number }>();
    const bodyRect = body.getBoundingClientRect();

    const rowMetricsFor = (eventId: string) => {
      const cached = rowMetricsById.get(eventId);
      if (cached) return cached;
      const row = body.querySelector(`tr[data-event-id="${eventId}"]`) as HTMLElement | null;
      if (!row) return null;
      const rowRect = row.getBoundingClientRect();
      const metrics = {
        top: Math.max(0, rowRect.top - bodyRect.top + body.scrollTop),
        height: Math.max(1, rowRect.height),
      };
      rowMetricsById.set(eventId, metrics);
      return metrics;
    };

    const first = timedEvents[0];
    const last = timedEvents[timedEvents.length - 1];

    if (nowSeconds <= first.seconds) {
      const metrics = rowMetricsFor(first.eventId);
      return metrics === null ? null : { contentTop: metrics.top, liveEventId: first.eventId };
    }
    if (nowSeconds >= last.endSeconds) {
      const metrics = rowMetricsFor(last.eventId);
      return metrics === null
        ? null
        : { contentTop: metrics.top + metrics.height, liveEventId: last.eventId };
    }

    // Find active row by timecode: the last row with start <= now.
    let left = 0;
    let right = timedEvents.length - 1;
    let activeIndex = 0;

    while (left <= right) {
      const middle = (left + right) >> 1;
      const middleStart = timedEvents[middle].seconds;
      if (middleStart <= nowSeconds) {
        activeIndex = middle;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    const active = timedEvents[activeIndex];
    const activeMetrics = rowMetricsFor(active.eventId);
    if (!activeMetrics) return null;

    // Move only inside active row with pixel/second progression.
    // If we are in a gap after row end, hold on row bottom until next row starts.
    const elapsedInRow = Math.max(0, nowSeconds - active.seconds);
    const boundedElapsed = Math.min(elapsedInRow, active.spanSeconds);
    const pixelPerSecond = activeMetrics.height / active.spanSeconds;
    const contentTop = activeMetrics.top + boundedElapsed * pixelPerSecond;

    return {
      contentTop,
      liveEventId: nowSeconds < active.endSeconds ? active.eventId : null,
    };
  }

  function setActivePhaseVisual(nextActive: string | null) {
    if (nextActive === activePhaseKeyRef.current) return;
    const previousKey = activePhaseKeyRef.current;
    if (previousKey) {
      const previousButton = phaseRailButtonRefs.current.get(previousKey);
      previousButton?.classList.remove("is-active");
    }
    if (nextActive) {
      const nextButton = phaseRailButtonRefs.current.get(nextActive);
      nextButton?.classList.add("is-active");
    }
    activePhaseKeyRef.current = nextActive;
  }

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

  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const body = wrap.querySelector(".ui-table__body") as HTMLElement | null;
    if (!body) return;

    const updateActivePhase = () => {
      const marker = body.scrollTop + body.clientHeight * 0.33;
      let nextActive = phaseBlocks[0]?.phase.key ?? null;

      for (const block of phaseBlocks) {
        const node = body.querySelector(
          `[data-phase-separator="${block.phase.key}"]`,
        ) as HTMLElement | null;
        if (!node) continue;
        if (node.offsetTop <= marker) {
          nextActive = block.phase.key;
          continue;
        }
        break;
      }

      setActivePhaseVisual(nextActive);
    };

    updateActivePhase();
    body.addEventListener("scroll", updateActivePhase, { passive: true });
    window.addEventListener("resize", updateActivePhase);
    return () => {
      body.removeEventListener("scroll", updateActivePhase);
      window.removeEventListener("resize", updateActivePhase);
    };
  }, [phaseBlocks]);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const body = wrap.querySelector(".ui-table__body") as HTMLElement | null;
    if (!body) return;

    const updateTimeMarker = () => {
      if (markerRafRef.current !== null) return;
      markerRafRef.current = window.requestAnimationFrame(() => {
        markerRafRef.current = null;
        const line = timeLineRef.current;
        const marker = timeMarkerRef.current;
        const label = timeMarkerLabelRef.current;
        if (!line || !marker || !label) return;
        const nowDate = new Date();
        label.textContent = formatClockWithSeconds(nowDate);
        const nowSeconds = nowDate.getHours() * 3600 + nowDate.getMinutes() * 60 + nowDate.getSeconds();

        // Keep overdue styling in sync without triggering React rerenders.
        for (const item of timedEvents) {
          const row = body.querySelector(`tr[data-event-id="${item.eventId}"]`) as HTMLElement | null;
          if (!row) continue;
          const shouldBeOverdue = nowSeconds > item.endSeconds;
          const isOverdue = row.classList.contains("row-overdue");
          if (shouldBeOverdue !== isOverdue) {
            row.classList.toggle("row-overdue", shouldBeOverdue);
          }
        }

        const timelineMarker = computeTimelineMarker(body, nowSeconds);
        if (!timelineMarker) {
          line.style.opacity = "0";
          marker.style.opacity = "0";
          if (liveRowIdRef.current) {
            const previous = body.querySelector(`tr[data-event-id="${liveRowIdRef.current}"]`) as HTMLElement | null;
            previous?.classList.remove("row-live");
            liveRowIdRef.current = null;
          }
          return;
        }

        const markerTop = body.offsetTop + timelineMarker.contentTop - body.scrollTop;
        const topPx = `${markerTop}px`;
        line.style.top = topPx;
        marker.style.top = topPx;
        line.style.opacity = "1";
        marker.style.opacity = "1";

        if (timelineMarker.liveEventId !== liveRowIdRef.current) {
          if (liveRowIdRef.current) {
            const previous = body.querySelector(`tr[data-event-id="${liveRowIdRef.current}"]`) as HTMLElement | null;
            previous?.classList.remove("row-live");
          }
          if (timelineMarker.liveEventId) {
            const nextLive = body.querySelector(`tr[data-event-id="${timelineMarker.liveEventId}"]`) as HTMLElement | null;
            nextLive?.classList.add("row-live");
          }
          liveRowIdRef.current = timelineMarker.liveEventId;
        }
      });
    };

    updateTimeMarker();
    const timer = window.setInterval(updateTimeMarker, 1000);
    body.addEventListener("scroll", updateTimeMarker, { passive: true });
    window.addEventListener("resize", updateTimeMarker);
    return () => {
      window.clearInterval(timer);
      body.removeEventListener("scroll", updateTimeMarker);
      window.removeEventListener("resize", updateTimeMarker);
      if (markerRafRef.current !== null) {
        window.cancelAnimationFrame(markerRafRef.current);
        markerRafRef.current = null;
      }
      if (liveRowIdRef.current) {
        const previous = body.querySelector(`tr[data-event-id="${liveRowIdRef.current}"]`) as HTMLElement | null;
        previous?.classList.remove("row-live");
        liveRowIdRef.current = null;
      }
    };
  }, [ordered, timedEvents]);

  useEffect(() => {
    if (reloadAutoScrollDoneRef.current) return;
    let isReload = false;
    try {
      const entries = window.performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      isReload = entries[0]?.type === "reload";
    } catch {
      isReload = false;
    }
    if (!isReload) return;

    const wrap = tableWrapRef.current;
    const body = wrap?.querySelector(".ui-table__body") as HTMLElement | null;
    if (!wrap || !body) return;

    let rafId: number | null = null;
    let attempts = 0;
    const maxAttempts = 8;

    const tryScrollToActiveRow = () => {
    const nowDate = new Date();
    const nowSeconds = nowDate.getHours() * 3600 + nowDate.getMinutes() * 60 + nowDate.getSeconds();
    const timelineMarker = computeTimelineMarker(body, nowSeconds);
    const activeEventId = timelineMarker?.liveEventId ?? null;
      if (!activeEventId) return false;

      const row = body.querySelector(`tr[data-event-id="${activeEventId}"]`) as HTMLElement | null;
      if (!row) return false;

      const targetTop = Math.max(0, row.offsetTop - body.clientHeight / 2 + row.offsetHeight / 2);
      body.scrollTo({
        top: targetTop,
        behavior: "auto",
      });
      return true;
    };

    const tick = () => {
      attempts += 1;
      if (tryScrollToActiveRow() || attempts >= maxAttempts) {
        reloadAutoScrollDoneRef.current = true;
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [ordered]);

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

  function selectSingleRow(rowId: string) {
    setSelectedRowIds([rowId]);
    setSelectionAnchorId(rowId);
  }

  function handleRowSelectionClick(event: MouseEvent, rowId: string) {
    if (event.button !== 0) return;
    if (event.shiftKey) {
      const anchorId = selectionAnchorId ?? rowId;
      const indexById = new Map(ordered.map((item, index) => [item.id, index] as const));
      const from = indexById.get(anchorId);
      const to = indexById.get(rowId);
      if (from === undefined || to === undefined) {
        selectSingleRow(rowId);
        return;
      }
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      const rangeIds = ordered.slice(start, end + 1).map((item) => item.id);
      setSelectedRowIds(rangeIds);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedRowIds((current) => {
        if (current.includes(rowId)) return current.filter((id) => id !== rowId);
        return [...current, rowId];
      });
      setSelectionAnchorId(rowId);
      return;
    }

    selectSingleRow(rowId);
  }

  function handleRowContextMenu(event: MouseEvent, rowId: string) {
    event.preventDefault();
    const rowIds = selectedRowIds.includes(rowId) ? selectedRowIds : [rowId];
    setSelectedRowIds(rowIds);
    setSelectionAnchorId(rowId);
    setContextMenu({ x: event.clientX, y: event.clientY, rowIds });
  }

  function handleGroupSelectedRows() {
    const rowIds = contextMenu?.rowIds ?? selectedRowIds;
    if (!rowIds.length || !onGroupRows) return;
    const selectedRows = ordered.filter((row) => rowIds.includes(row.id));
    const sameGroup = selectedRows.every(
      (row) => row.groupName === selectedRows[0]?.groupName && row.groupColor === selectedRows[0]?.groupColor,
    );
    setGroupName(sameGroup ? selectedRows[0]?.groupName ?? "" : "");
    setGroupColor((sameGroup ? selectedRows[0]?.groupColor : null) || "#6aa8ff");
    setGroupModalOpen(true);
    setContextMenu(null);
  }

  function submitGroupRows() {
    const rowIds = selectedRowIds;
    if (!rowIds.length || !onGroupRows) return;
    onGroupRows(rowIds, { name: groupName.trim() || "Group", color: groupColor });
    setGroupModalOpen(false);
  }

  const rowStyle = { gridTemplateColumns: gridTemplate };

  function jumpToPhase(phaseKey: string) {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const body = wrap.querySelector(".ui-table__body") as HTMLElement | null;
    const node = body?.querySelector(`[data-phase-separator="${phaseKey}"]`) as HTMLElement | null;
    if (!body || !node) return;
    body.scrollTo({
      top: Math.max(0, node.offsetTop - 8),
      behavior: "smooth",
    });
    setActivePhaseVisual(phaseKey);
  }

  const totalPhaseWeight = phaseBlocks.reduce((sum, block) => sum + Math.max(block.events.length, 1), 0);
  const nowLabel = formatClockWithSeconds(new Date());
  const renderNow = new Date();
  const renderNowSeconds =
    renderNow.getHours() * 3600 + renderNow.getMinutes() * 60 + renderNow.getSeconds();

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
                <TableRow
                  className="phase-separator"
                  style={rowStyle}
                  data-phase-separator={phase.key}
                >
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
                  const currentSeconds = parseTimecodeToSeconds(event.timecode);
                  const nextSeconds = next ? parseTimecodeToSeconds(next.timecode) : null;
                  const currentDriftMinutes = cumulativeDriftByPhaseKey.get(event.phase) ?? 0;
                  const nextDriftMinutes = next ? (cumulativeDriftByPhaseKey.get(next.phase) ?? 0) : 0;
                  const adjustedCurrentSeconds =
                    currentSeconds === null ? null : currentSeconds + currentDriftMinutes * 60;
                  const adjustedNextSeconds =
                    nextSeconds === null ? null : nextSeconds + nextDriftMinutes * 60;
                  const activationSeconds =
                    event.activationId && Number.isFinite(activationDurationsById[event.activationId])
                      ? Math.max(0, activationDurationsById[event.activationId] ?? 0)
                      : 0;
                  const effectiveSpan =
                    adjustedCurrentSeconds !== null
                      ? Math.max(
                          1,
                          resolveRowSpanSeconds(
                            adjustedCurrentSeconds,
                            adjustedNextSeconds,
                            activationSeconds,
                          ),
                        )
                      : 30;
                  const rowEndSeconds =
                    adjustedCurrentSeconds !== null ? adjustedCurrentSeconds + effectiveSpan : null;
                  const overdue = rowEndSeconds !== null ? renderNowSeconds > rowEndSeconds : true;
                  const durationSeconds =
                    adjustedCurrentSeconds !== null && adjustedNextSeconds !== null
                      ? Math.max(adjustedNextSeconds - adjustedCurrentSeconds, 0)
                      : null;
                  const timeToZeroSeconds =
                    adjustedCurrentSeconds !== null && kickoffSeconds !== null
                      ? Math.max(kickoffSeconds - adjustedCurrentSeconds, 0)
                      : null;
                  const adjustedTimecodeLabel = formatClockFromSeconds(adjustedCurrentSeconds);
                  const expanded = expandedRowId === event.id;
                  const canInsertAfter = Boolean(onInsertAfter);
                  const rowRuntimeStyle = event.groupColor
                    ? {
                        ...rowStyle,
                        ["--row-group-color" as string]: event.groupColor,
                      }
                    : rowStyle;

                  return (
                    <Fragment key={event.id}>
                      <TableRow
                        draggable
                        data-event-id={event.id}
                        style={rowRuntimeStyle}
                        className={`${overId === event.id ? "drag-over" : ""} ${overdue ? "row-overdue" : ""} ${flashEventId === event.id ? "row-focused" : ""} ${selectedRowIds.includes(event.id) ? "row-selected" : ""}`}
                        onClick={(e) => handleRowSelectionClick(e, event.id)}
                        onContextMenu={(e) => handleRowContextMenu(e, event.id)}
                        onDragStart={() => {
                          if (selectedRowIds.includes(event.id) && selectedRowIds.length > 1) {
                            setDraggedId(selectedRowIds[0] ?? event.id);
                            return;
                          }
                          selectSingleRow(event.id);
                          setDraggedId(event.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOverId(event.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!draggedId || draggedId === event.id || !onReorderRows) return;
                          const draggedIds = selectedRowIds.includes(draggedId) && selectedRowIds.length > 1
                            ? selectedRowIds
                            : [draggedId];
                          if (draggedIds.includes(event.id)) return;
                          const draggedSet = new Set(draggedIds);
                          const remaining = ordered.filter((rowItem) => !draggedSet.has(rowItem.id));
                          const targetIndex = remaining.findIndex((rowItem) => rowItem.id === event.id);
                          if (targetIndex === -1) return;
                          const draggedRows = ordered.filter((rowItem) => draggedSet.has(rowItem.id));
                          const nextOrderRows = [...remaining];
                          nextOrderRows.splice(targetIndex, 0, ...draggedRows);
                          onReorderRows(nextOrderRows.map((rowItem) => rowItem.id));
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
                                </TableCell>
                              );
                            case "timecode":
                              return <TableCell key={column.key}>{adjustedTimecodeLabel}</TableCell>;
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
                                  {event.groupName ? (
                                    <span
                                      className="cue-group-chip"
                                      style={event.groupColor ? { borderColor: event.groupColor, color: event.groupColor } : undefined}
                                    >
                                      {event.groupName}
                                    </span>
                                  ) : null}
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
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation();
                                        onEdit(event);
                                      }}
                                    >
                                      <i className="fa-solid fa-pen-to-square" />
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="icon"
                                      title="Delete"
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation();
                                        onDelete(event);
                                      }}
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
                              <span className="cue-insert-row__dot">
                                <i className="fa-solid fa-plus" />
                              </span>
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
      <div className="phase-jump-hotspot" aria-hidden />
      <div className="phase-jump-scrim" aria-hidden />
      <div ref={timeLineRef} className="cue-time-line" aria-hidden />
      <div ref={timeMarkerRef} className="cue-time-marker" aria-live="polite" title="Current time marker">
        <i className="fa-solid fa-clock" aria-hidden />
        <span ref={timeMarkerLabelRef}>{nowLabel}</span>
      </div>
      <div className="phase-jump-rail" aria-label="Phase quick navigation">
        {phaseBlocks.map((block) => {
          const weight = Math.max(block.events.length, 1);
          return (
            <button
              key={`jump-${block.phase.key}`}
              type="button"
              className="phase-jump-rail__segment"
              style={{ flexGrow: totalPhaseWeight > 0 ? weight : 1 }}
              onClick={() => jumpToPhase(block.phase.key)}
              title={block.phase.label}
              aria-label={`Jump to ${block.phase.label}`}
              ref={(node) => {
                if (node) {
                  phaseRailButtonRefs.current.set(block.phase.key, node);
                  if (!activePhaseKeyRef.current && block === phaseBlocks[0]) {
                    node.classList.add("is-active");
                    activePhaseKeyRef.current = block.phase.key;
                  }
                  return;
                }
                phaseRailButtonRefs.current.delete(block.phase.key);
              }}
            >
              <span>{shortPhaseLabel(block.phase.label)}</span>
            </button>
          );
        })}
      </div>
      {contextMenu ? (
        <div
          className="cue-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={handleGroupSelectedRows} disabled={!onGroupRows}>
            <i className="fa-solid fa-layer-group" />
            <span>Group Selected</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!onDeleteRows) return;
              onDeleteRows(contextMenu.rowIds);
              setContextMenu(null);
            }}
            disabled={!onDeleteRows}
          >
            <i className="fa-solid fa-trash" />
            <span>Delete Selected</span>
          </button>
        </div>
      ) : null}
      {groupModalOpen ? (
        <div className="modal-overlay" onMouseDown={() => setGroupModalOpen(false)}>
          <div className="modal modal-confirm" onMouseDown={(event) => event.stopPropagation()}>
            <h3>Group Rows</h3>
            <div className="modal-grid" style={{ marginTop: "0.65rem" }}>
              <label className="field">
                <span>Group Name</span>
                <input value={groupName} onChange={(event) => setGroupName(event.target.value)} />
              </label>
              <label className="field">
                <span>Group Color</span>
                <input type="color" value={groupColor} onChange={(event) => setGroupColor(event.target.value)} />
              </label>
            </div>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setGroupModalOpen(false)}>
                <span>Cancel</span>
              </Button>
              <Button onClick={submitGroupRows} disabled={!selectedRowIds.length}>
                <span>Apply Group</span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
