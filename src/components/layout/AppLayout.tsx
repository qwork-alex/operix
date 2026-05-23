import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { AppFooter } from "./AppFooter";
import { ConsentGate } from "@/components/legal/ConsentGate";
import { AccessStateBanner } from "@/components/billing/AccessStateBanner";
import { AIProvider } from "@/agents/ai";
import { useOperationalBusBoot } from "@/hooks/useOperationalBusBoot";
import { useAgentRuntimeBoot } from "@/hooks/useAgentRuntimeBoot";
import { useVirtualEngineerBoot } from "@/hooks/useVirtualEngineerBoot";
import { useOperationalCopilotBoot } from "@/hooks/useOperationalCopilotBoot";
import { useObservabilityBoot } from "@/hooks/useObservabilityBoot";
import { FloatingTripButton } from "@/components/fleet/FloatingTripButton";

export function AppLayout({ children }: { children: ReactNode }) {
  useOperationalBusBoot();
  useAgentRuntimeBoot();
  useVirtualEngineerBoot();
  useOperationalCopilotBoot();
  useObservabilityBoot();
  return (
    <ConsentGate>
      <SidebarProvider>
        <AIProvider>
          <div className="min-h-svh flex w-full bg-background overflow-hidden">
            <AppSidebar />
            <div className="flex-1 flex min-h-svh flex-col min-w-0 max-w-full overflow-hidden">
              <ImpersonationBanner />
              <TopBar />
              <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-4 sm:py-4 md:px-6 md:py-6 min-w-0 max-w-full">
                <div className="min-w-0 max-w-full w-full space-y-4 md:space-y-6">
                  <AccessStateBanner />
                  {children}
                </div>
              </main>

              <AppFooter />
            </div>
            {/* AI is now a fixed control-center in the TopBar — no floating overlays */}
          </div>
        </AIProvider>
      </SidebarProvider>
    </ConsentGate>
  );
}

