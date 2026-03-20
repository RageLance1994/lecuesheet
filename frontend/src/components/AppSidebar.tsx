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
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedTournament =
    tournaments.find((item) => item.id === selectedTournamentId) ?? tournaments[0] ?? null;
  const selectedMeta = selectedTournament
    ? [
      selectedTournament.format || null,
      selectedTournament.startDate && selectedTournament.endDate
        ? `${selectedTournament.startDate} - ${selectedTournament.endDate}`
        : selectedTournament.startDate || selectedTournament.endDate || null,
      selectedTournament.teamsCount ? `${selectedTournament.teamsCount} teams` : null,
    ]
      .filter(Boolean)
      .join(" | ")
    : "";

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setSelectorOpen(false);
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
          <button
            type="button"
            className="sidebar-tournament-switch__select"
            onClick={() => {
              setMenuOpen(false);
              setSelectorOpen((open) => !open);
            }}
          >
            <span className="sidebar-tournament-switch__select-main">
              <i className="fa-solid fa-trophy" />
              <span>{selectedTournament?.name || "Select tournament"}</span>
            </span>
            <span className="sidebar-tournament-switch__select-meta">{selectedMeta || "No details"}</span>
            <i className={`fa-solid ${selectorOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
          </button>
          <button
            type="button"
            className="sidebar-tournament-switch__menu-trigger"
            title="Azioni torneo"
            onClick={() => {
              setSelectorOpen(false);
              setMenuOpen((open) => !open);
            }}
          >
            <i className="fa-solid fa-ellipsis" />
          </button>
        </div>
        {selectorOpen ? (
          <div className="sidebar-tournament-switch__selector-menu">
            {tournaments.map((tournament) => {
              const isSelected = tournament.id === selectedTournamentId;
              const meta = [
                tournament.format || null,
                tournament.startDate && tournament.endDate
                  ? `${tournament.startDate} - ${tournament.endDate}`
                  : tournament.startDate || tournament.endDate || null,
                tournament.matchesCount ? `${tournament.matchesCount} matches` : null,
                tournament.teamsCount ? `${tournament.teamsCount} teams` : null,
              ]
                .filter(Boolean)
                .join(" | ");
              return (
                <button
                  key={tournament.id}
                  type="button"
                  className={`sidebar-tournament-switch__selector-item ${isSelected ? "is-selected" : ""}`}
                  onClick={() => {
                    onSelectTournament(tournament.id);
                    setSelectorOpen(false);
                  }}
                >
                  <strong>{tournament.name}</strong>
                  <span>{meta || "No details"}</span>
                </button>
              );
            })}
          </div>
        ) : null}
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
