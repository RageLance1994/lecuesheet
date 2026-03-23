import { useEffect, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { HardConfirmModal } from "../components/HardConfirmModal";
import { MatchPlannerModal } from "../components/MatchPlannerModal";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import {
  api,
  emptyMatchInfo,
  hasPrivilege,
  matchInfoToDraft,
  type MatchInfoDraft,
  type PlannerEventSummary,
  type Team,
  type TeamPlayer,
  type Tournament,
  type UserAccount,
  type Venue,
} from "../lib/api";

type Props = {
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
    teams: boolean;
    personnel: boolean;
    users: boolean;
  };
};

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

function EventTeamCell({
  name,
  code,
  logoUrl,
  fallback,
}: {
  name?: string | null;
  code?: string | null;
  logoUrl?: string | null;
  fallback: string;
}) {
  const displayName = String(code || "").trim() || String(name || "").trim() || fallback;
  const logo = String(logoUrl || "").trim();
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {logo ? (
        <img
          src={logo}
          alt=""
          style={{ width: 22, height: 22, borderRadius: 999, objectFit: "contain", background: "#0f131b" }}
        />
      ) : (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#dbe7ff",
            border: "1px solid rgba(106, 168, 255, 0.25)",
            background: "rgba(106, 168, 255, 0.14)",
          }}
        >
          {getTeamInitials(String(name || ""), fallback)}
        </span>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
    </div>
  );
}

type TeamDraft = {
  name: string;
  country: string;
  tricode: string;
  logoUrl: string;
  players: TeamPlayer[];
};

function uid() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function emptyTeamDraft(): TeamDraft {
  return {
    name: "",
    country: "",
    tricode: "",
    logoUrl: "",
    players: [],
  };
}

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

export function EventsPage({
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
  const [events, setEvents] = useState<PlannerEventSummary[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState<MatchInfoDraft>(emptyMatchInfo());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalStep, setTeamModalStep] = useState(0);
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(emptyTeamDraft());
  const [playerName, setPlayerName] = useState("");
  const [playerNumber, setPlayerNumber] = useState("");
  const [playerPosition, setPlayerPosition] = useState("");

  async function loadEvents() {
    setError("");
    if (!selectedTournamentId.trim()) {
      setEvents([]);
      return;
    }
    try {
      const rows = await api.getEvents(selectedTournamentId);
      setEvents(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadVenues() {
    if (!selectedTournamentId.trim()) {
      setVenues([]);
      return;
    }
    try {
      const rows = await api.getVenues(selectedTournamentId);
      setVenues(rows);
    } catch {
      setVenues([]);
    }
  }

  async function loadTeams() {
    if (!selectedTournamentId.trim()) {
      setTeams([]);
      return;
    }
    try {
      const rows = await api.getTeams(selectedTournamentId);
      setTeams(rows);
    } catch {
      setTeams([]);
    }
  }

  useEffect(() => {
    void loadEvents();
    void loadVenues();
    void loadTeams();
  }, [selectedTournamentId]);

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
    if (!selectedTournamentId.trim()) {
      setError("No tournament selected.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editingEventId) {
        await api.updatePlannerEvent(editingEventId, {
          name: draft.matchId || undefined,
          match: toMatchPayload(draft),
          tournamentId: selectedTournamentId,
        });
        setWizardOpen(false);
        setEditingEventId(null);
        await loadEvents();
        return;
      }

      const created = await api.createPlannerEvent({
        name: draft.matchId || undefined,
        match: toMatchPayload(draft),
        tournamentId: selectedTournamentId,
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

  function openRegisterTeamModal() {
    setTeamModalStep(0);
    setTeamDraft(emptyTeamDraft());
    setPlayerName("");
    setPlayerNumber("");
    setPlayerPosition("");
    setTeamModalOpen(true);
  }

  function addPlayer() {
    const name = playerName.trim();
    if (!name) return;
    const parsedNumber = Number(playerNumber);
    setTeamDraft((prev) => ({
      ...prev,
      players: [
        ...prev.players,
        {
          id: uid(),
          name,
          number: Number.isFinite(parsedNumber) && parsedNumber >= 0 ? Math.round(parsedNumber) : null,
          position: playerPosition.trim() || null,
        },
      ],
    }));
    setPlayerName("");
    setPlayerNumber("");
    setPlayerPosition("");
  }

  async function saveRegisteredTeam() {
    if (!teamDraft.name.trim()) return;
    if (!selectedTournamentId.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createTeam({
        name: teamDraft.name.trim(),
        tournamentId: selectedTournamentId,
        country: teamDraft.country.trim() || null,
        tricode: teamDraft.tricode.trim().toUpperCase() || null,
        logoUrl: teamDraft.logoUrl.trim() || null,
        players: teamDraft.players
          .filter((player) => player.name.trim())
          .map((player) => ({
            id: player.id,
            name: player.name.trim(),
            number: player.number ?? null,
            position: player.position?.trim() || null,
          })),
      });
      setTeamModalOpen(false);
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!teamModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      setTeamModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [teamModalOpen, busy]);

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
        <Card className="table-card">
          <CardHeader className="table-card__header">
            <div className="table-card__titlebar">
              <CardTitle>Events</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={openCreateWizard}
                disabled={busy || !hasPrivilege(currentUser, "events", "create")}
              >
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
                    <th>Team A</th>
                    <th>Team B</th>
                    <th>City</th>
                    <th>Kick-off (Local Time)</th>
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
                        <EventTeamCell
                          name={eventItem.match?.teamA?.name}
                          code={eventItem.match?.teamA?.code}
                          logoUrl={eventItem.match?.teamA?.logoUrl}
                          fallback="A"
                        />
                      </td>
                      <td>
                        <EventTeamCell
                          name={eventItem.match?.teamB?.name}
                          code={eventItem.match?.teamB?.code}
                          logoUrl={eventItem.match?.teamB?.logoUrl}
                          fallback="B"
                        />
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
                            disabled={!hasPrivilege(currentUser, "events", "edit")}
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
                            disabled={!hasPrivilege(currentUser, "events", "delete")}
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
                      <td colSpan={9} className="data-table__empty">
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
        teamOptions={teams}
        onRegisterTeam={openRegisterTeamModal}
        onChange={setDraft}
        onClose={closeWizard}
        onSubmit={() => {
          void submitWizard();
        }}
        busy={busy}
      />
      {teamModalOpen ? (
        <div className="modal-overlay" onMouseDown={() => !busy && setTeamModalOpen(false)}>
          <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader>
              <CardTitle>New Team</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="modal-grid">
                <div className="field notes-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Wizard</span>
                  <div className="icon-actions">
                    <Button
                      type="button"
                      variant={teamModalStep === 0 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTeamModalStep(0)}
                    >
                      <span>1. Team Info</span>
                    </Button>
                    <Button
                      type="button"
                      variant={teamModalStep === 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTeamModalStep(1)}
                    >
                      <span>2. Players</span>
                    </Button>
                  </div>
                </div>

                {teamModalStep === 0 ? (
                  <>
                    <label className="field">
                      <span>Team Name</span>
                      <input
                        value={teamDraft.name}
                        onChange={(event) => setTeamDraft((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Country</span>
                      <input
                        value={teamDraft.country}
                        onChange={(event) => setTeamDraft((prev) => ({ ...prev, country: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Tricode</span>
                      <input
                        maxLength={3}
                        value={teamDraft.tricode}
                        onChange={(event) =>
                          setTeamDraft((prev) => ({ ...prev, tricode: event.target.value.toUpperCase() }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Logo URL</span>
                      <input
                        value={teamDraft.logoUrl}
                        onChange={(event) => setTeamDraft((prev) => ({ ...prev, logoUrl: event.target.value }))}
                      />
                    </label>
                  </>
                ) : (
                  <div className="notes-field" style={{ gridColumn: "1 / -1", display: "grid", gap: 10 }}>
                    <div className="modal-grid" style={{ gridTemplateColumns: "1fr 140px 1fr auto" }}>
                      <label className="field">
                        <span>Player Name</span>
                        <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Number</span>
                        <input value={playerNumber} onChange={(event) => setPlayerNumber(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Position</span>
                        <input value={playerPosition} onChange={(event) => setPlayerPosition(event.target.value)} />
                      </label>
                      <div className="field" style={{ alignSelf: "end" }}>
                        <Button type="button" onClick={addPlayer} disabled={!playerName.trim()}>
                          <i className="fa-solid fa-plus" />
                          <span>Add</span>
                        </Button>
                      </div>
                    </div>

                    <div className="data-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Number</th>
                            <th>Position</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {teamDraft.players.map((player) => (
                            <tr key={player.id}>
                              <td>{player.name}</td>
                              <td>{player.number ?? "-"}</td>
                              <td>{player.position || "-"}</td>
                              <td>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="icon"
                                  title="Remove player"
                                  onClick={() =>
                                    setTeamDraft((prev) => ({
                                      ...prev,
                                      players: prev.players.filter((item) => item.id !== player.id),
                                    }))
                                  }
                                >
                                  <i className="fa-solid fa-trash" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {teamDraft.players.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="data-table__empty">
                                No players added.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="modal-actions modal-actions--left">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (busy) return;
                      setTeamModalOpen(false);
                    }}
                  >
                    <i className="fa-solid fa-xmark" />
                    <span>Cancel</span>
                  </Button>
                  {teamModalStep === 0 ? (
                    <Button type="button" onClick={() => setTeamModalStep(1)}>
                      <i className="fa-solid fa-arrow-right" />
                      <span>Next: Players</span>
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => setTeamModalStep(0)}>
                        <i className="fa-solid fa-arrow-left" />
                        <span>Back</span>
                      </Button>
                      <Button onClick={() => { void saveRegisteredTeam(); }} disabled={busy || !teamDraft.name.trim()}>
                        <i className="fa-solid fa-floppy-disk" />
                        <span>Create Team</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      <HardConfirmModal
        open={Boolean(deleteEventId)}
        busy={busy}
        title="Delete Event"
        description="Confirm event deletion? This action removes cuesheet, match info, and version log."
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
            await api.deletePlannerEvent(deleteEventId, selectedTournamentId);
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
