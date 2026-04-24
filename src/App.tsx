import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { RoleProvider } from "@/hooks/useRole";
import { ImpersonationProvider } from "@/hooks/useImpersonation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PermissionGuard } from "@/components/PermissionGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ChangePasswordPage from "./pages/ChangePasswordPage";
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
                <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <ImpersonationProvider>
                      <RoleProvider>
                      <AppLayout>
                        <ErrorBoundary>
                          <Routes>
                            <Route path="/" element={<PermissionGuard permission="dashboard.view"><Index /></PermissionGuard>} />
                            <Route path="/service-orders" element={<PermissionGuard permission="service_orders.view"><ServiceOrdersPage /></PermissionGuard>} />
                            <Route path="/payment-orders" element={<PermissionGuard permission="payment_orders.view"><PaymentOrdersPage /></PermissionGuard>} />
                            <Route path="/financial" element={<PermissionGuard permission="financial.view"><FinancialPage /></PermissionGuard>} />
                            <Route path="/profit" element={<PermissionGuard permission="profit.view"><ProfitDistribution /></PermissionGuard>} />
                            <Route path="/accounting" element={<PermissionGuard permission="accounting.view"><Accounting /></PermissionGuard>} />
                            <Route path="/fleet" element={<PermissionGuard permission="fleet.view"><FleetPage /></PermissionGuard>} />
                            <Route path="/documents" element={<PermissionGuard permission="documents.view"><Documents /></PermissionGuard>} />
                            <Route path="/users" element={<PermissionGuard permission="users.view"><UsersPage /></PermissionGuard>} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </ErrorBoundary>
                      </AppLayout>
                      </RoleProvider>
                      </ImpersonationProvider>
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
