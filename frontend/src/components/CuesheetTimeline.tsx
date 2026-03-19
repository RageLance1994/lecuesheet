import { useMemo, useState } from "react";
import type { CueEvent } from "../lib/api";

type Props = {
  events: CueEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
};

type HoveredMarker = {
  id: string;
  left: number;
};

function statusClass(status: string) {
  if (status === "live") return "is-live";
  if (status === "done") return "is-done";
  if (status === "blocked") return "is-blocked";
  if (status === "ready") return "is-ready";
  return "is-pending";
}

export function CuesheetTimeline({ events, selectedEventId, onSelectEvent }: Props) {
  const ordered = useMemo(
    () => [...events].sort((a, b) => a.rowOrder - b.rowOrder),
    [events],
  );
  const [hovered, setHovered] = useState<HoveredMarker | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (!ordered.length) return null;

  const selectedIndex = Math.max(
    0,
    selectedEventId ? ordered.findIndex((event) => event.id === selectedEventId) : 0,
  );

  return (
    <div className="timeline-card">
      <div className="timeline-header">
        <h4>Live Timeline</h4>
        <div className="timeline-header__right">
          <span>{`${selectedIndex + 1}/${ordered.length}`}</span>
          <button
            type="button"
            className="timeline-toggle"
            title={collapsed ? "Expand timeline" : "Collapse timeline"}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            <i className={`fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}`} />
          </button>
        </div>
      </div>

      <div className={`timeline-content ${collapsed ? "is-collapsed" : ""}`}>
        <div className="timeline-rail-wrap">
          <div className="timeline-rail" />
          {ordered.map((event, index) => {
            const leftRaw = ordered.length <= 1 ? 50 : (index / (ordered.length - 1)) * 100;
            const left = Math.min(99.4, Math.max(0.6, leftRaw));
            return (
              <button
                key={event.id}
                type="button"
                className={`timeline-marker ${statusClass(event.status)} ${selectedEventId === event.id ? "is-selected" : ""}`}
                style={{ left: `${left}%` }}
                onMouseEnter={() => setHovered({ id: event.id, left })}
                onMouseLeave={() => setHovered((current) => (current?.id === event.id ? null : current))}
                onClick={() => onSelectEvent(event.id)}
                aria-label={`Go to ${event.cue || "cue"} at ${event.timecode}`}
              />
            );
          })}

          {hovered ? (
            <div className="timeline-tooltip" style={{ left: `${hovered.left}%` }}>
              {(() => {
                const event = ordered.find((item) => item.id === hovered.id);
                if (!event) return null;
                return (
                  <>
                    <strong>{event.timecode}</strong>
                    <span>{event.phase.replaceAll("_", " ")}</span>
                    <span>{event.cue || "-"}</span>
                    <span>{event.asset || "-"}</span>
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>

        <input
          className="timeline-scrubber"
          type="range"
          min={0}
          max={Math.max(ordered.length - 1, 0)}
          value={selectedIndex}
          onChange={(event) => {
            const idx = Number(event.target.value);
            const target = ordered[idx];
            if (target) onSelectEvent(target.id);
          }}
        />
      </div>
    </div>
  );
}
