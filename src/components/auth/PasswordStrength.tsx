import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordRule {
  label: string;
  test: (p: string) => boolean;
}

export const passwordRules: PasswordRule[] = [
  { label: "Mínimo 8 caracteres", test: (p) => p.length >= 8 },
  { label: "1 letra maiúscula", test: (p) => /[A-Z]/.test(p) },
  { label: "1 número", test: (p) => /\d/.test(p) },
];

export function isPasswordStrong(p: string) {
  return passwordRules.every((r) => r.test(p));
}

interface Props {
  password: string;
  className?: string;
}

export function PasswordStrength({ password, className }: Props) {
  if (!password) return null;
  const passedCount = passwordRules.filter((r) => r.test(password)).length;
  const pct = (passedCount / passwordRules.length) * 100;
  const tone =
    passedCount === passwordRules.length
      ? "bg-emerald-500"
      : passedCount >= 2
        ? "bg-amber-500"
        : "bg-destructive";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all duration-300", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="grid grid-cols-1 gap-0.5 pt-0.5">
        {passwordRules.map((r) => {
          const ok = r.test(password);
          return (
            <li
              key={r.label}
              className={cn(
                "flex items-center gap-1.5 text-[11px] transition-colors",
                ok ? "text-emerald-500" : "text-muted-foreground"
              )}
            >
              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
