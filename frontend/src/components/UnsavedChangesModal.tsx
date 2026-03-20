import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

export function UnsavedChangesModal({ open, onCancel, onConfirm, busy }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <Card className="modal modal-unsaved" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader>
          <CardTitle>Unsaved changes</CardTitle>
        </CardHeader>
        <CardContent>
          <p>You have unsaved changes. Close anyway?</p>
          <div className="modal-actions">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              <i className="fa-solid fa-arrow-left" />
              <span>Keep editing</span>
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={busy}>
              <i className="fa-solid fa-trash" />
              <span>Discard</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
