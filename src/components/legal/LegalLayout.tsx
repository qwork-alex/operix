import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SYSTEM_METADATA } from "@/config/system";
import { TERMS_VERSION } from "@/config/legal";

interface LegalLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * LegalLayout — shared shell for all /legal/* pages.
 * Public, dark-mode aware, enterprise-grade typography.
 */
export function LegalLayout({ title, subtitle, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
          <span className="text-[11px] tracking-wide text-muted-foreground/70">
            {SYSTEM_METADATA.trademark} · Legal v{TERMS_VERSION}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        )}
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-muted-foreground">
          {children}
        </div>
      </main>

      <footer className="mt-16 border-t border-border/60 py-8 text-center text-[11px] text-muted-foreground/70">
        {SYSTEM_METADATA.trademark} © {SYSTEM_METADATA.year} · {SYSTEM_METADATA.proprietary_notice}
        <br />
        {SYSTEM_METADATA.attribution}
      </footer>
    </div>
  );
}
