import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-copper text-[#1a1206] hover:brightness-110 font-medium",
  ghost:
    "bg-transparent text-text hover:bg-white/5 border border-line",
  danger: "bg-bad/15 text-bad hover:bg-bad/25",
  quiet: "bg-bg-elev text-text hover:bg-white/5 border border-line",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm transition disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
