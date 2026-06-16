import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { withAbortableTimeout, withPromiseTimeout } from "@/lib/asyncGuard";
import { apiRequest } from "@/lib/api";
import { uploadFile, deleteFiles, getFileUrl } from "@/lib/storage";

export function useUserAvatar() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error("Not authenticated");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      // #region debug-point U:user-avatar-upload
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "upload-db-timeout",
          runId: "pre-fix",
          hypothesisId: "U",
          location: "src/hooks/useUserAvatar.ts:upload:start",
          msg: "[DEBUG] DATA_START",
          data: { bucket: "avatars", path, size: file.size, type: file.type },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      await withPromiseTimeout<any>(
        uploadFile("avatars", path, file, file.type),
        10000,
        "avatar_upload",
      );
      const publicUrl = getFileUrl("avatars", path);
      await apiRequest("/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatar_url: publicUrl }),
        timeoutMs: 10000,
      });
      // #region debug-point U:user-avatar-success
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "upload-db-timeout",
          runId: "pre-fix",
          hypothesisId: "U",
          location: "src/hooks/useUserAvatar.ts:upload:success",
          msg: "[DEBUG] DATA_SUCCESS",
          data: { bucket: "avatars", path },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return publicUrl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
    },
    onError: (err) => {
      // #region debug-point U:user-avatar-error
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "upload-db-timeout",
          runId: "pre-fix",
          hypothesisId: "U",
          location: "src/hooks/useUserAvatar.ts:upload:error",
          msg: "[DEBUG] DATA_ERROR",
          data: { error: err instanceof Error ? err.message : String(err) },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data: current, error: currentError } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => ((supabase as any)
          .from("profiles")
          .select("avatar_url")
          .eq("id", user.id)
          .maybeSingle() as any).abortSignal(signal),
        8000,
        "avatar_profile_read",
      );
      if (currentError) throw currentError;
      const url = current?.avatar_url || "";
      const marker = "/storage/public/avatars/";
      const idx = url.indexOf(marker);
      if (idx >= 0) {
        const path = url.substring(idx + marker.length);
        try { await withPromiseTimeout<any>(deleteFiles("avatars", [path]), 10000, "avatar_remove_storage"); } catch {}
      }
      await apiRequest("/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatar_url: null }),
        timeoutMs: 10000,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
    },
  });

  return { upload, remove };
}
