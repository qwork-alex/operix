import { ReactNode, useEffect } from "react";
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
  useEffect(() => {
    console.log("[MOUNT] AppLayout");
    return () => console.log("[UNMOUNT] AppLayout");
  }, []);
  useOperationalBusBoot();
  useAgentRuntimeBoot();
  useVirtualEngineerBoot();
  useOperationalCopilotBoot();
  useObservabilityBoot();
  return (
    <ConsentGate>
      <SidebarProvider>
        <AIProvider>
          <div className="h-svh flex w-full bg-background overflow-hidden">
            <AppSidebar />
            <div className="flex-1 flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
              <ImpersonationBanner />
              <TopBar />
              <main className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-4 sm:py-4 md:px-6 md:py-6">
                <AccessStateBanner />
                {children}
                <AppFooter />
              </main>
            </div>
            <FloatingTripButton />
            {/* AI is now a fixed control-center in the TopBar — no floating overlays */}
          </div>
        </AIProvider>
      </SidebarProvider>
    </ConsentGate>
  );
}

