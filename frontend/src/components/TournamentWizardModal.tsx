import { useState } from "react";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

const COUNTRY_OPTIONS = [
  "Italy",
  "France",
  "Germany",
  "Spain",
  "Portugal",
  "United Kingdom",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Austria",
  "Poland",
  "Czech Republic",
  "Croatia",
  "Serbia",
  "Greece",
  "Turkey",
  "United States",
  "Canada",
  "Mexico",
  "Brazil",
];

export type TournamentDraft = {
  name: string;
  startDate: string;
  endDate: string;
  logoUrl: string;
  keyPeople: string[];
  matchesCount: string;
  format: string;
  teamsCount: string;
  hostCountries: string[];
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  draft: TournamentDraft;
  busy?: boolean;
  onChange: (next: TournamentDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function emptyTournamentDraft(): TournamentDraft {
  return {
    name: "",
    startDate: "",
    endDate: "",
    logoUrl: "",
    keyPeople: [],
    matchesCount: "",
    format: "Eliminazione diretta",
    teamsCount: "",
    hostCountries: [],
  };
}

export function TournamentWizardModal({
  open,
  mode,
  draft,
  busy,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  const [keyPeopleInput, setKeyPeopleInput] = useState("");
  const [countryInput, setCountryInput] = useState("");

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader>
          <CardTitle>{mode === "create" ? "New Tournament" : "Edit Tournament"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="modal-grid"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label className="field">
              <span>Nome</span>
              <input
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Logo Torneo</span>
              <input
                value={draft.logoUrl}
                onChange={(event) => onChange({ ...draft, logoUrl: event.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="field">
              <span>Data inizio</span>
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => onChange({ ...draft, startDate: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Data fine</span>
              <input
                type="date"
                value={draft.endDate}
                onChange={(event) => onChange({ ...draft, endDate: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Numero di partite</span>
              <input
                type="number"
                min={0}
                value={draft.matchesCount}
                onChange={(event) => onChange({ ...draft, matchesCount: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Numero di squadre</span>
              <input
                type="number"
                min={0}
                value={draft.teamsCount}
                onChange={(event) => onChange({ ...draft, teamsCount: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Formato</span>
              <select
                value={draft.format}
                onChange={(event) => onChange({ ...draft, format: event.target.value })}
              >
                <option value="Eliminazione diretta">Eliminazione diretta</option>
                <option value="Score">Score</option>
              </select>
            </label>

            <div className="field notes-field">
              <span>Key People</span>
              <div className="activation-tags__list">
                {draft.keyPeople.map((person) => (
                  <button
                    key={person}
                    type="button"
                    className="activation-tag"
                    onClick={() =>
                      onChange({ ...draft, keyPeople: draft.keyPeople.filter((item) => item !== person) })
                    }
                  >
                    {person}
                    <i className="fa-solid fa-xmark" />
                  </button>
                ))}
              </div>
              <div className="activation-tags__input">
                <input
                  value={keyPeopleInput}
                  onChange={(event) => setKeyPeopleInput(event.target.value)}
                  placeholder="Add person"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = keyPeopleInput.trim();
                    if (!next || draft.keyPeople.includes(next)) return;
                    onChange({ ...draft, keyPeople: [...draft.keyPeople, next] });
                    setKeyPeopleInput("");
                  }}
                >
                  <i className="fa-solid fa-user-plus" />
                  <span>Add</span>
                </Button>
              </div>
            </div>

            <div className="field notes-field">
              <span>Paesi Ospitanti</span>
              <div className="activation-tags__list">
                {draft.hostCountries.map((country) => (
                  <button
                    key={country}
                    type="button"
                    className="activation-tag"
                    onClick={() =>
                      onChange({
                        ...draft,
                        hostCountries: draft.hostCountries.filter((item) => item !== country),
                      })
                    }
                  >
                    {country}
                    <i className="fa-solid fa-xmark" />
                  </button>
                ))}
              </div>
              <div className="activation-tags__input">
                <input
                  list="country-options"
                  value={countryInput}
                  onChange={(event) => setCountryInput(event.target.value)}
                  placeholder="Search country"
                />
                <datalist id="country-options">
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country} value={country} />
                  ))}
                </datalist>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = countryInput.trim();
                    if (!next || draft.hostCountries.includes(next)) return;
                    onChange({ ...draft, hostCountries: [...draft.hostCountries, next] });
                    setCountryInput("");
                  }}
                >
                  <i className="fa-solid fa-earth-europe" />
                  <span>Add</span>
                </Button>
              </div>
            </div>

            <div className="modal-actions modal-actions--left">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                <i className="fa-solid fa-xmark" />
                <span>Cancel</span>
              </Button>
              <Button type="submit" disabled={busy || !draft.name.trim()}>
                <i className="fa-solid fa-floppy-disk" />
                <span>{mode === "create" ? "Create Tournament" : "Save Tournament"}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
