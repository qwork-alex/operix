import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { RoleProvider } from "@/hooks/useRole";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGuard } from "@/components/RoleGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ServiceOrdersPage from "./pages/ServiceOrdersPage";
import PaymentOrdersPage from "./pages/PaymentOrdersPage";
import FinancialPage from "./pages/FinancialPage";
import {
  ProfitDistribution,
  Accounting,
  Documents,
  UsersPage,
  SettingsPage,
} from "./pages/ModulePages";
import FleetPage from "./pages/FleetPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        console.error("[Mutation Error]", error);
      },
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <RoleProvider>
                      <AppLayout>
                        <ErrorBoundary>
                          <Routes>
                            <Route path="/" element={<Index />} />
                            <Route path="/service-orders" element={<ServiceOrdersPage />} />
                            <Route path="/payment-orders" element={<PaymentOrdersPage />} />
                            <Route path="/financial" element={<RoleGuard allowedRoles={["admin", "socio"]}><FinancialPage /></RoleGuard>} />
                            <Route path="/profit" element={<RoleGuard allowedRoles={["admin", "socio"]}><ProfitDistribution /></RoleGuard>} />
                            <Route path="/accounting" element={<RoleGuard allowedRoles={["admin"]}><Accounting /></RoleGuard>} />
                            <Route path="/fleet" element={<RoleGuard allowedRoles={["admin", "tecnico"]}><FleetPage /></RoleGuard>} />
                            <Route path="/documents" element={<RoleGuard allowedRoles={["admin", "tecnico", "socio"]}><Documents /></RoleGuard>} />
                            <Route path="/users" element={<RoleGuard allowedRoles={["admin"]}><UsersPage /></RoleGuard>} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </ErrorBoundary>
                      </AppLayout>
                      </RoleProvider>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
