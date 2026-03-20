import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

type Props = {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  onCancel: () => void;
  onApprove: () => Promise<void>;
  busy?: boolean;
};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function HardConfirmModal({
  open,
  title,
  description,
  actionLabel,
  onCancel,
  onApprove,
  busy,
}: Props) {
  const [expectedCode, setExpectedCode] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      setExpectedCode(generateCode());
      setValue("");
    }
  }, [open]);

  if (!open) return null;

  const canConfirm = value.trim().toUpperCase() === expectedCode;

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <Card className="modal modal-confirm" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{description}</p>
          <div className="confirm-code">{expectedCode}</div>
          <label className="field">
            <span>Inserisci il codice per confermare</span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
              maxLength={6}
              placeholder="XXXXXX"
            />
          </label>
          <div className="modal-actions">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              <i className="fa-solid fa-xmark" />
              <span>Cancel</span>
            </Button>
            <Button onClick={onApprove} disabled={!canConfirm || busy}>
              <i className="fa-solid fa-shield-halved" />
              <span>{actionLabel}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
