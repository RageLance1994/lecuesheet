import { useEffect, useRef, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedTournament =
    tournaments.find((item) => item.id === selectedTournamentId) ?? tournaments[0] ?? null;

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img className="sidebar-brand__logo" src="/mock_liveengine%20logo.png" alt="Live Engine" />
      </div>

      <div className="sidebar-tournament-switch" ref={menuRef}>
        <label className="sidebar-tournament-switch__label">Torneo attivo</label>
        <div className="sidebar-tournament-switch__row">
          <select
            className="sidebar-tournament-switch__select"
            value={selectedTournamentId}
            onChange={(event) => onSelectTournament(event.target.value)}
          >
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sidebar-tournament-switch__menu-trigger"
            title="Azioni torneo"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i className="fa-solid fa-ellipsis" />
          </button>
        </div>
        {menuOpen ? (
          <div className="sidebar-tournament-switch__menu">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onCreateTournament();
              }}
            >
              <i className="fa-solid fa-plus" />
              <span>Nuovo torneo</span>
            </button>
            <button
              type="button"
              disabled={!selectedTournament}
              onClick={() => {
                if (!selectedTournament) return;
                setMenuOpen(false);
                onEditTournament(selectedTournament);
              }}
            >
              <i className="fa-solid fa-pen-to-square" />
              <span>Modifica torneo</span>
            </button>
            <button
              type="button"
              className="is-danger"
              disabled={!selectedTournament}
              onClick={() => {
                if (!selectedTournament) return;
                setMenuOpen(false);
                onDeleteTournament(selectedTournament);
              }}
            >
              <i className="fa-solid fa-trash" />
              <span>Elimina torneo</span>
            </button>
          </div>
        ) : null}
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
    </aside>
  );
}
