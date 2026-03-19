import type { HTMLAttributes } from "react";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: DivProps) {
  return <div className={`ui-card ${className}`.trim()} {...props} />;
}

export function CardHeader({ className = "", ...props }: DivProps) {
  return <div className={`ui-card__header ${className}`.trim()} {...props} />;
}

export function CardTitle({ className = "", ...props }: DivProps) {
  return <h3 className={`ui-card__title ${className}`.trim()} {...props} />;
}

export function CardDescription({ className = "", ...props }: DivProps) {
  return <p className={`ui-card__description ${className}`.trim()} {...props} />;
}

export function CardContent({ className = "", ...props }: DivProps) {
  return <div className={`ui-card__content ${className}`.trim()} {...props} />;
}
