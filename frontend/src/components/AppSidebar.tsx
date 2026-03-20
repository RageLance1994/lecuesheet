import type { Tournament } from "../lib/api";

type ActiveSection = "events" | "activations" | "venues";

type Props = {
  active: ActiveSection;
  onNavigate: (path: string) => void;
  tournaments: Tournament[];
  selectedTournamentId: string;
  onSelectTournament: (tournamentId: string) => void;
  onCreateTournament: () => void;
  onEditTournament: (tournament: Tournament) => void;
  onDeleteTournament: (tournament: Tournament) => void;
};

export function AppSidebar({
  active,
  onNavigate,
  tournaments,
  selectedTournamentId,
  onSelectTournament,
  onCreateTournament,
  onEditTournament,
  onDeleteTournament,
}: Props) {
  function goTo(path: string, tournamentId: string) {
    onSelectTournament(tournamentId);
    onNavigate(`${path}?tournament=${encodeURIComponent(tournamentId)}`);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img className="sidebar-brand__logo" src="/mock_liveengine%20logo.png" alt="Live Engine" />
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav__item ${active === "events" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("/events")}
        >
          <i className="fa-solid fa-calendar-days" />
          <span>Events</span>
        </button>
        <button
          className={`sidebar-nav__item ${active === "activations" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("/activations")}
        >
          <i className="fa-solid fa-clapperboard" />
          <span>Activations</span>
        </button>
        <button
          className={`sidebar-nav__item ${active === "venues" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("/venues")}
        >
          <i className="fa-solid fa-location-dot" />
          <span>Venues</span>
        </button>
      </nav>

      <div className="sidebar-tournaments">
        <div className="sidebar-tournaments__head">
          <span>Tornei</span>
          <button type="button" className="sidebar-tournaments__create" onClick={onCreateTournament}>
            <i className="fa-solid fa-plus" />
          </button>
        </div>
        <div className="sidebar-tournaments__list">
          {tournaments.map((tournament) => {
            const isSelected = selectedTournamentId === tournament.id;
            return (
              <div key={tournament.id} className="sidebar-tournament">
                <div className={`sidebar-tournament__row ${isSelected ? "is-selected" : ""}`}>
                  <button type="button" className="sidebar-tournament__toggle" onClick={() => onSelectTournament(tournament.id)}>
                    <i className="fa-solid fa-chevron-right" />
                    <span>{tournament.name}</span>
                  </button>
                  <div className="sidebar-tournament__actions">
                    <button
                      type="button"
                      title="Edit tournament"
                      onClick={() => onEditTournament(tournament)}
                    >
                      <i className="fa-solid fa-pen-to-square" />
                    </button>
                    <button
                      type="button"
                      title="Delete tournament"
                      onClick={() => onDeleteTournament(tournament)}
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
                <div className="sidebar-tournament__menu">
                  <button type="button" onClick={() => goTo("/events", tournament.id)}>
                    <i className="fa-solid fa-calendar-days" />
                    <span>Events</span>
                  </button>
                  <button type="button" onClick={() => goTo("/activations", tournament.id)}>
                    <i className="fa-solid fa-clapperboard" />
                    <span>Activations</span>
                  </button>
                  <button type="button" onClick={() => goTo("/venues", tournament.id)}>
                    <i className="fa-solid fa-location-dot" />
                    <span>Venues</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
