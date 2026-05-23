import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const fieldCls =
  "gmv-field w-full min-w-0 px-2.5 py-2 border border-gmv-border rounded-gmv-md text-sm box-border bg-gmv-canvas text-gmv-text-strong transition focus:outline-none focus:border-gmv-primary focus:ring-1 focus:ring-gmv-primary disabled:bg-gmv-bg disabled:text-gmv-muted";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldCls, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldCls, className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldCls, "resize-y", className)} {...rest} />;
}
