import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-line bg-bg-sunken px-3 py-2 text-sm text-text outline-none placeholder:text-muted/70 focus:border-copper",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line bg-bg-sunken px-3 py-2 text-sm text-text outline-none placeholder:text-muted/70 focus:border-copper",
        className,
      )}
      {...props}
    />
  );
}
