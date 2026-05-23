import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { ThemeProvider } from "@/hooks/useTheme";
import { RoleProvider } from "@/hooks/useRole";
import { ImpersonationProvider } from "@/hooks/useImpersonation";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PermissionGuard } from "@/components/PermissionGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";

// Eager: routes hit on first paint of an authenticated session.
import Index from "./pages/Index";

// Lazy: every other page is code-split so the initial bundle shrinks
// dramatically. Navigation feels instant because Vite preloads on hover
// and the Suspense fallback below is a lightweight skeleton.
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChangePasswordPage = lazy(() => import("./pages/ChangePasswordPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ServiceOrdersPage = lazy(() => import("./pages/ServiceOrdersPage"));
const PaymentOrdersPage = lazy(() => import("./pages/PaymentOrdersPage"));
const FinancialPage = lazy(() => import("./pages/FinancialPage"));
const ModulePages = () => import("./pages/ModulePages");
const ProfitDistribution = lazy(() => ModulePages().then((m) => ({ default: m.ProfitDistribution })));
const Accounting = lazy(() => ModulePages().then((m) => ({ default: m.Accounting })));
const Documents = lazy(() => ModulePages().then((m) => ({ default: m.Documents })));
const UsersPage = lazy(() => ModulePages().then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => ModulePages().then((m) => ({ default: m.SettingsPage })));
const FleetPage = lazy(() => import("./pages/FleetPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const AutomationsPage = lazy(() => import("./pages/AutomationsPage"));
const AIPage = lazy(() => import("./pages/AIPage"));
const RecoveryPage = lazy(() => import("./pages/RecoveryPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const PlatformOwnerPage = lazy(() => import("./pages/PlatformOwnerPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const ProductionPage = lazy(() => import("./pages/ProductionPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const WorkspaceOnboardingPage = lazy(() => import("./pages/onboarding/WorkspaceOnboardingPage"));
const TermsPage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.PrivacyPage })));
const GdprPage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.GdprPage })));
const CookiesPage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.CookiesPage })));
const DataProcessingPage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.DataProcessingPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Reuse cached data across navigations to avoid spinner flashes.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      onError: (error) => {
        console.error("[Mutation Error]", error);
      },
    },
  },
});

/** Subtle, layout-stable fallback used while a route chunk is loading. */
function RouteFallback() {
  return (
    <div className="flex items-center justify-center p-12 text-xs text-muted-foreground/60">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/onboarding/workspace" element={<WorkspaceOnboardingPage />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/legal/terms" element={<TermsPage />} />
                  <Route path="/legal/privacy" element={<PrivacyPage />} />
                  <Route path="/legal/gdpr" element={<GdprPage />} />
                  <Route path="/legal/cookies" element={<CookiesPage />} />
                  <Route path="/legal/data-processing" element={<DataProcessingPage />} />
                  <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
                  <Route
                    path="/*"
                    element={
                      <ProtectedRoute>
                        <ImpersonationProvider>
                        <WorkspaceProvider>
                        <RoleProvider>
                        <TenantProvider>
                        <AppLayout>
                          <ErrorBoundary>
                            <Suspense fallback={<RouteFallback />}>
                              <Routes>
                                <Route path="/" element={<PermissionGuard permission="dashboard.view"><Index /></PermissionGuard>} />
                                <Route path="/service-orders" element={<PermissionGuard permission="service_orders.view"><ServiceOrdersPage /></PermissionGuard>} />
                                <Route path="/production" element={<PermissionGuard permission="service_orders.view"><ProductionPage /></PermissionGuard>} />
                                <Route path="/payment-orders" element={<PermissionGuard permission="payment_orders.view"><PaymentOrdersPage /></PermissionGuard>} />
                                <Route path="/financial" element={<PermissionGuard permission="financial.view"><FinancialPage /></PermissionGuard>} />
                                <Route path="/profit" element={<PermissionGuard permission="profit.view"><ProfitDistribution /></PermissionGuard>} />
                                <Route path="/accounting" element={<Navigate to="/financial?tab=accounting" replace />} />
                                <Route path="/fleet" element={<PermissionGuard permission="fleet.view"><FleetPage /></PermissionGuard>} />
                                <Route path="/billing/*" element={<BillingPage />} />
                                <Route path="/documents" element={<PermissionGuard permission="documents.view"><Documents /></PermissionGuard>} />
                                <Route path="/users" element={<PermissionGuard permission="users.view"><UsersPage /></PermissionGuard>} />
                                <Route path="/marketplace" element={<MarketplacePage />} />
                                <Route path="/settings" element={<SettingsPage />} />
                                <Route path="/profile" element={<ProfilePage />} />
                                <Route path="/audit" element={<AuditPage />} />
                                <Route path="/automations" element={<PermissionGuard permission="settings.edit"><AutomationsPage /></PermissionGuard>} />
                                <Route path="/ai" element={<AIPage />} />
                                <Route path="/recovery" element={<RecoveryPage />} />
                                <Route path="/subscription" element={<SubscriptionPage />} />
                                <Route path="/checkout" element={<CheckoutPage />} />
                                <Route path="/platform" element={<PlatformOwnerPage />} />
                                <Route path="*" element={<NotFound />} />
                              </Routes>
                            </Suspense>
                          </ErrorBoundary>
                        </AppLayout>
                        </TenantProvider>
                        </RoleProvider>
                        </WorkspaceProvider>
                        </ImpersonationProvider>
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
