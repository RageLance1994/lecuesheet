import { useEffect, useState } from "react";
import { HardConfirmModal } from "../components/HardConfirmModal";
import { MatchPlannerModal } from "../components/MatchPlannerModal";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import {
  api,
  emptyMatchInfo,
  matchInfoToDraft,
  type MatchInfoDraft,
  type PlannerEventSummary,
  type Venue,
} from "../lib/api";

type Props = {
  onNavigate: (path: string) => void;
};

function toMatchPayload(draft: MatchInfoDraft) {
  return {
    matchId: draft.matchId || null,
    teamA: {
      name: draft.teamAName || null,
      code: draft.teamACode || null,
      logoUrl: draft.teamALogoUrl || null,
    },
    teamB: {
      name: draft.teamBName || null,
      code: draft.teamBCode || null,
      logoUrl: draft.teamBLogoUrl || null,
    },
    venueId: draft.venueId || null,
    gatesOpen: draft.gatesOpen || null,
    city: draft.city || null,
    date: draft.date || null,
    kickoffTime: draft.kickoffTime || null,
    venue: draft.venue || null,
  };
}

export function EventsPage({ onNavigate }: Props) {
  const [events, setEvents] = useState<PlannerEventSummary[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState<MatchInfoDraft>(emptyMatchInfo());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);

  async function loadEvents() {
    setError("");
    try {
      const rows = await api.getEvents();
      setEvents(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadVenues() {
    try {
      const rows = await api.getVenues();
      setVenues(rows);
    } catch {
      setVenues([]);
    }
  }

  useEffect(() => {
    void loadEvents();
    void loadVenues();
  }, []);

  function openCreateWizard() {
    setEditingEventId(null);
    setDraft(emptyMatchInfo());
    setWizardOpen(true);
  }

  function openEditWizard(eventItem: PlannerEventSummary) {
    setEditingEventId(eventItem.id);
    setDraft({
      ...matchInfoToDraft(eventItem.match),
      matchId: eventItem.match?.matchId?.trim() || eventItem.name || "",
    });
    setWizardOpen(true);
  }

  function closeWizard() {
    if (busy) return;
    setWizardOpen(false);
    setEditingEventId(null);
  }

  async function submitWizard() {
    setBusy(true);
    setError("");
    try {
      if (editingEventId) {
        await api.updatePlannerEvent(editingEventId, {
          name: draft.matchId || undefined,
          match: toMatchPayload(draft),
        });
        setWizardOpen(false);
        setEditingEventId(null);
        await loadEvents();
        return;
      }

      const created = await api.createPlannerEvent({
        name: draft.matchId || undefined,
        match: toMatchPayload(draft),
      });
      setWizardOpen(false);
      await loadEvents();
      onNavigate(`/events/${created.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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
          <button className="sidebar-nav__item is-active" type="button">
            <i className="fa-solid fa-calendar-days" />
            <span>Events</span>
          </button>
          <button className="sidebar-nav__item" type="button" onClick={() => onNavigate("/activations")}>
            <i className="fa-solid fa-clapperboard" />
            <span>Activations</span>
          </button>
          <button className="sidebar-nav__item" type="button" onClick={() => onNavigate("/venues")}>
            <i className="fa-solid fa-location-dot" />
            <span>Venues</span>
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <Card className="table-card">
          <CardHeader className="table-card__header">
            <div className="table-card__titlebar">
              <CardTitle>Events</CardTitle>
              <Button variant="outline" size="sm" onClick={openCreateWizard} disabled={busy}>
                <i className="fa-solid fa-plus" />
                <span>New Event</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Match ID</th>
                    <th>Teams</th>
                    <th>City</th>
                    <th>Kickoff</th>
                    <th>Venue</th>
                    <th>Rows</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((eventItem) => (
                    <tr
                      key={eventItem.id}
                      className="data-table__row"
                      onClick={() => onNavigate(`/events/${eventItem.id}`)}
                    >
                      <td>{eventItem.match?.matchId || eventItem.name}</td>
                      <td>
                        {(eventItem.match?.teamA?.code || eventItem.match?.teamA?.name || "A") +
                          " vs " +
                          (eventItem.match?.teamB?.code || eventItem.match?.teamB?.name || "B")}
                      </td>
                      <td>{eventItem.match?.city || "-"}</td>
                      <td>{eventItem.match?.kickoffTime || "-"}</td>
                      <td>{eventItem.match?.venue || "-"}</td>
                      <td>{String(eventItem.totalRows)}</td>
                      <td>{new Date(eventItem.updatedAt).toLocaleString()}</td>
                      <td>
                        <div className="icon-actions">
                          <Button
                            variant="outline"
                            size="icon"
                            title="Open event"
                            onClick={(event) => {
                              event.stopPropagation();
                              onNavigate(`/events/${eventItem.id}`);
                            }}
                          >
                            <i className="fa-solid fa-up-right-from-square" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Edit event"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditWizard(eventItem);
                            }}
                          >
                            <i className="fa-solid fa-pen-to-square" />
                          </Button>
                          <Button
                            variant="danger"
                            size="icon"
                            title="Delete event"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteEventId(eventItem.id);
                            }}
                          >
                            <i className="fa-solid fa-trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="data-table__empty">
                        No events yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="error">{error}</p> : null}
      </main>

      <MatchPlannerModal
        open={wizardOpen}
        draft={draft}
        venueOptions={venues}
        onChange={setDraft}
        onClose={closeWizard}
        onSubmit={() => {
          void submitWizard();
        }}
        busy={busy}
      />
      <HardConfirmModal
        open={Boolean(deleteEventId)}
        busy={busy}
        title="Delete Event"
        description="Confermi eliminazione evento? Questa azione rimuove cuesheet, match info e version log."
        actionLabel="Delete"
        onCancel={() => {
          if (busy) return;
          setDeleteEventId(null);
        }}
        onApprove={async () => {
          if (!deleteEventId) return;
          setBusy(true);
          setError("");
          try {
            await api.deletePlannerEvent(deleteEventId);
            setDeleteEventId(null);
            if (editingEventId === deleteEventId) {
              setEditingEventId(null);
              setWizardOpen(false);
            }
            await loadEvents();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
