"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyBanner } from "./key-banner";
import { cn } from "@/lib/cn";

const tabs = [
  { href: "sources", label: "Sources" },
  { href: "workflow", label: "Run" },
  { href: "chat", label: "Threads" },
  { href: "evals", label: "Evals" },
  { href: "traces", label: "Traces" },
];

export function WorkspaceChrome({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const pathname = usePathname();
  return (
    <header className="flex h-14 items-center gap-6 border-b border-line px-4">
      <Link href="/" className="font-mono text-sm tracking-[0.2em] text-copper">
        ARC
      </Link>
      <div className="hidden h-4 w-px bg-line sm:block" />
      <div className="min-w-0 truncate text-sm text-muted">
        <span className="text-text">{name}</span>
      </div>
      <nav className="ml-4 flex items-center gap-1">
        {tabs.map((tab) => {
          const href = `/w/${workspaceId}/${tab.href}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                active ? "bg-white/10 text-text" : "text-muted hover:text-text",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <KeyBanner />
        <Link href="/settings" className="text-sm text-muted hover:text-text">
          Keys
        </Link>
      </div>
    </header>
  );
}
