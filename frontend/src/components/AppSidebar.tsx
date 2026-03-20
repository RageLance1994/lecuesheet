import { useEffect, useMemo, useRef, useState } from "react";
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
  const sortedTournaments = useMemo(() => {
    return [...tournaments].sort((a, b) => {
      const aTime = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
  }, [tournaments]);

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
        <label className="sidebar-tournament-switch__label">Active Tournament</label>
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
              {selectedTournament?.logoUrl ? (
                <img
                  className="sidebar-tournament-switch__logo"
                  src={selectedTournament.logoUrl}
                  alt=""
                />
              ) : (
                <span className="sidebar-tournament-switch__logo-fallback" aria-hidden>
                  <i className="fa-solid fa-trophy" />
                </span>
              )}
              <span>{selectedTournament?.name || "Select tournament"}</span>
            </span>
            <i
              className={`fa-solid ${selectorOpen ? "fa-chevron-up" : "fa-chevron-down"} sidebar-tournament-switch__select-caret`}
            />
          </button>
          <button
            type="button"
            className="sidebar-tournament-switch__menu-trigger"
            title="Tournament actions"
            onClick={() => {
              setSelectorOpen(false);
              setMenuOpen((open) => !open);
            }}
          >
            <i className="fa-solid fa-ellipsis-vertical" />
          </button>
        </div>
        {selectorOpen ? (
          <div className="sidebar-tournament-switch__selector-menu is-open">
            {sortedTournaments.map((tournament) => {
              const isSelected = tournament.id === selectedTournamentId;
              const year = tournament.startDate
                ? new Date(tournament.startDate).getFullYear()
                : tournament.endDate
                  ? new Date(tournament.endDate).getFullYear()
                  : null;
              const countries = tournament.hostCountries?.length
                ? tournament.hostCountries.join(", ")
                : "-";
              const federation = tournament.federation || "-";
              const metaInline = `Countries: ${countries}   Year: ${year ?? "-"}   Federation: ${federation}`;
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
                  <span className="sidebar-tournament-switch__selector-main">
                    {tournament.logoUrl ? (
                      <img
                        className="sidebar-tournament-switch__logo"
                        src={tournament.logoUrl}
                        alt=""
                      />
                    ) : (
                      <span className="sidebar-tournament-switch__logo-fallback" aria-hidden>
                        <i className="fa-solid fa-trophy" />
                      </span>
                    )}
                    <strong>{tournament.name}</strong>
                  </span>
                  <span className="sidebar-tournament-switch__selector-meta">{metaInline}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {menuOpen ? (
          <div className="sidebar-tournament-switch__menu is-open">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onCreateTournament();
              }}
            >
              <i className="fa-solid fa-plus" />
              <span>New tournament</span>
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
              <span>Edit tournament</span>
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
              <span>Delete tournament</span>
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
