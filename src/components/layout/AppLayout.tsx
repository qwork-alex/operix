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
          <div className="min-h-screen flex w-full bg-background">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
              <ImpersonationBanner />
              <TopBar />
              <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 min-w-0 max-w-full">
                <div className="min-w-0 max-w-full w-full space-y-4">
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

