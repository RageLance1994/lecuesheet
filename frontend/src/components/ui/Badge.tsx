import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "danger" | "outline";

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ className = "", variant = "default", ...props }: Props) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()} {...props} />
  );
}
