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
          <div className="flex-1 flex flex-col min-w-0">
            <ImpersonationBanner />
            <TopBar />
            <main className="flex-1 overflow-auto p-6">
              {children}
            </main>
            <AppFooter />
          </div>
        </div>
      </SidebarProvider>
    </ConsentGate>
  );
}

