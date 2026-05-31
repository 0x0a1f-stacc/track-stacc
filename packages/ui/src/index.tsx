import * as React from "react";

const cn = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-brand-500 text-white hover:bg-brand-400",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
    ghost: "text-zinc-200 hover:bg-zinc-800",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };
  return (
    <button
      className={cn(
        "rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  label,
  error,
  helperText,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  helperText?: string;
}) {
  return (
    <label className="block space-y-2 text-sm text-zinc-200">
      {label ? <span>{label}</span> : null}
      <input
        className={cn(
          "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-brand-400",
          error && "border-red-500",
          className,
        )}
        {...props}
      />
      {error ? (
        <span className="text-xs text-red-400">{error}</span>
      ) : helperText ? (
        <span className="text-xs text-zinc-500">{helperText}</span>
      ) : null}
    </label>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "host" | "mod" | "danger";
}) {
  const styles = {
    default: "bg-zinc-800 text-zinc-200",
    host: "bg-brand-500/20 text-brand-200",
    mod: "bg-sky-500/20 text-sky-200",
    danger: "bg-red-500/20 text-red-200",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ nickname }: { nickname: string }) {
  const initials = nickname
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xs font-bold text-white">
      {initials}
    </span>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-brand-300" />
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      <span>{children}</span>
      <span className="pointer-events-none absolute bottom-full mb-2 hidden rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 group-hover:block">
        {label}
      </span>
    </span>
  );
}

export function SystemMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-brand-500/10 px-3 py-2 text-sm italic text-brand-100">
      {children}
    </p>
  );
}
