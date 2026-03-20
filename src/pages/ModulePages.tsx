import { AppLayout } from "@/components/layout/AppLayout";

const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
    <div className="glass-panel rounded-xl p-12 text-center max-w-md">
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground">This module will be available in the next phase.</p>
    </div>
  </div>
);

// ServiceOrders moved to dedicated page
export const PaymentOrders = () => <PlaceholderPage title="Payment Orders" />;
export const Financial = () => <PlaceholderPage title="Financial" />;
export const ProfitDistribution = () => <PlaceholderPage title="Profit Distribution" />;
export const Accounting = () => <PlaceholderPage title="Accounting" />;
export const Fleet = () => <PlaceholderPage title="Fleet Management" />;
export const Documents = () => <PlaceholderPage title="Documents" />;
export const UsersPage = () => <PlaceholderPage title="User Management" />;
export const SettingsPage = () => <PlaceholderPage title="Settings" />;
