import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "default" | "secondary" | "outline" | "danger" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className = "",
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()}
      {...props}
    />
  );
}
