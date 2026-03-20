import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
  Fleet,
  Documents,
  UsersPage,
  SettingsPage,
} from "./pages/ModulePages";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
                    <AppLayout>
                      <ErrorBoundary>
                        <Routes>
                          <Route path="/" element={<Index />} />
                          <Route path="/service-orders" element={<ServiceOrdersPage />} />
                          <Route path="/payment-orders" element={<PaymentOrdersPage />} />
                          <Route path="/financial" element={<FinancialPage />} />
                          <Route path="/profit" element={<ProfitDistribution />} />
                          <Route path="/accounting" element={<Accounting />} />
                          <Route path="/fleet" element={<Fleet />} />
                          <Route path="/documents" element={<Documents />} />
                          <Route path="/users" element={<UsersPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </ErrorBoundary>
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
