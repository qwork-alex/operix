import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { AppFooter } from "./AppFooter";
import { ConsentGate } from "@/components/legal/ConsentGate";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ConsentGate>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
            <ImpersonationBanner />
            <TopBar />
            <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 min-w-0 max-w-full">
              <div className="min-w-0 max-w-full w-full">
                {children}
              </div>
            </main>
            <AppFooter />
          </div>
        </div>
      </SidebarProvider>
    </ConsentGate>
  );
}

