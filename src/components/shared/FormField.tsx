import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Standardized form field wrapper. Provides consistent label sizing,
 * required indicators, validation errors and hint text across all forms.
 *
 * Pairs naturally with shadcn Input/Select (h-9). Does not change any
 * existing form logic — purely presentational.
 */
export function FormField({
  label,
  required,
  error,
  hint,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-foreground/80">
        {label}
        {required && <span className="text-destructive ml-0.5" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive leading-tight" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>
      ) : null}
    </div>
  );
}
