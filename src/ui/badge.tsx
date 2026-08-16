import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "copper" | "good" | "bad" | "info";
}) {
  const tones = {
    muted: "bg-white/5 text-muted",
    copper: "bg-copper/15 text-copper",
    good: "bg-good/15 text-good",
    bad: "bg-bad/15 text-bad",
    info: "bg-info/15 text-info",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}
