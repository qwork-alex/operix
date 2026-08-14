import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RealtimeHub } from "@/lib/realtime/RealtimeHub";
import { apiRequest } from "@/lib/api";

type Notification = {
  id: string;
  user_id: string | null;
  type: string;
  title: string | null;
  body: string | null;
  payload: unknown | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    retry: 0,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      try {
        const rows = await apiRequest<Notification[]>("/notifications?limit=50", { timeoutMs: 8000 });
        return (rows || []).map((r) => ({
          ...r,
          isRead: r.is_read,
          user_id: r.user_id,
        }));
      } catch {
        return [] as any[];
      }
    },
  });

  const unreadCount = (notifications as any[]).filter((n) => !(n.is_read ?? n.isRead)).length;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest<void>(`/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
        timeoutMs: 8000,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await apiRequest<void>("/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
        timeoutMs: 8000,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await apiRequest<void>("/notifications", { method: "DELETE", timeoutMs: 8000 });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!user) return undefined as unknown as () => void;
    let off: (() => void) | null = null;
    try {
      off = RealtimeHub.subscribe(
        { table: "notifications", event: "INSERT", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      );
    } catch {
      off = null;
    }
    return () => {
      if (typeof off === "function") {
        try { off(); } catch {}
      }
    };
  }, [user, queryClient]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsRead.mutate,
    markAllRead: markAllRead.mutate,
    clearAll: clearAll.mutate,
  };
}
