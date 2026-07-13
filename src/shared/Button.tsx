import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  wide?: boolean;
};

export function Button({ children, variant = "primary", wide = false, className = "", ...props }: ButtonProps) {
  const classes = [styles.button, styles[variant], wide ? styles.wide : "", className].filter(Boolean).join(" ");
  return <button className={classes} {...props}>{children}</button>;
}
