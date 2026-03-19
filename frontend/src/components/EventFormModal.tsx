import { PHASES } from "../lib/api";
import type { CueEvent, PhaseKey } from "../lib/api";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

export type EventDraft = {
  phase: PhaseKey;
  category: string;
  cue: string;
  asset: string;
  operator: string;
  status: string;
  notes: string;
};

type Props = {
  open: boolean;
  title: string;
  draft: EventDraft;
  onChange: (next: EventDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
};

export const emptyDraft: EventDraft = {
  phase: "GATES_OPEN",
  category: "",
  cue: "",
  asset: "",
  operator: "",
  status: "pending",
  notes: "",
};

export function draftFromEvent(event: CueEvent): EventDraft {
  return {
    phase: event.phase,
    category: event.category,
    cue: event.cue,
    asset: event.asset,
    operator: event.operator,
    status: event.status,
    notes: event.notes,
  };
}

export function EventFormModal({
  open,
  title,
  draft,
  onChange,
  onClose,
  onSubmit,
  submitLabel,
  busy,
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay">
      <Card className="modal">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="modal-grid">
            <label className="field">
              <span>Phase</span>
              <select
                value={draft.phase}
                onChange={(event) =>
                  onChange({ ...draft, phase: event.target.value as EventDraft["phase"] })
                }
              >
                {PHASES.map((phase) => (
                  <option key={phase.key} value={phase.key}>
                    {phase.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <input
                value={draft.category}
                onChange={(event) => onChange({ ...draft, category: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Cue</span>
              <input
                value={draft.cue}
                onChange={(event) => onChange({ ...draft, cue: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Asset / Template</span>
              <input
                value={draft.asset}
                onChange={(event) => onChange({ ...draft, asset: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Operator</span>
              <input
                value={draft.operator}
                onChange={(event) => onChange({ ...draft, operator: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(event) => onChange({ ...draft, status: event.target.value })}
              >
                <option value="pending">pending</option>
                <option value="ready">ready</option>
                <option value="live">live</option>
                <option value="done">done</option>
                <option value="blocked">blocked</option>
              </select>
            </label>
            <label className="field notes-field">
              <span>Notes</span>
              <textarea
                value={draft.notes}
                onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              />
            </label>
          </div>
          <div className="modal-actions">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              <i className="fa-solid fa-xmark" />
              <span>Cancel</span>
            </Button>
            <Button onClick={onSubmit} disabled={busy}>
              <i className="fa-solid fa-floppy-disk" />
              <span>{submitLabel}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
