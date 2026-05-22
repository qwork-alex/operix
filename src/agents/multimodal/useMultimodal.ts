import { useCallback, useEffect, useState } from "react";
import { AttachmentStore } from "./AttachmentStore";
import { MultimodalPipeline } from "./MultimodalPipeline";
import { captureUIContext } from "./ContextualParser";
import { captureScreenshot } from "./ScreenshotCapture";
import { AudioRecorder } from "./AudioRecorder";
import type {
  MultimodalAnalysisResult,
  MultimodalAttachment,
  MultimodalSource,
} from "./types";

export function useMultimodal() {
  const [attachments, setAttachments] = useState<MultimodalAttachment[]>(
    AttachmentStore.list(),
  );
  const [results, setResults] = useState<MultimodalAnalysisResult[]>(
    MultimodalPipeline.list(),
  );

  useEffect(() => AttachmentStore.subscribe(setAttachments), []);
  useEffect(() => MultimodalPipeline.subscribe(setResults), []);

  const addFile = useCallback(
    async (file: File, source: MultimodalSource = "upload", userNote?: string) => {
      const att = AttachmentStore.add(file, { name: file.name, source });
      const ctx = captureUIContext();
      MultimodalPipeline.analyze(att, {
        userNote,
        route: ctx.route,
        viewport: ctx.viewport,
      });
      return att;
    },
    [],
  );

  const addFiles = useCallback(
    async (files: FileList | File[], source: MultimodalSource = "upload") => {
      const list = Array.from(files);
      const out: MultimodalAttachment[] = [];
      for (const f of list) out.push(await addFile(f, source));
      return out;
    },
    [addFile],
  );

  const takeScreenshot = useCallback(async (userNote?: string) => {
    const blob = await captureScreenshot();
    const att = AttachmentStore.add(blob, {
      name: `screenshot-${Date.now()}.png`,
      source: "screenshot",
    });
    const ctx = captureUIContext();
    MultimodalPipeline.analyze(att, {
      userNote,
      route: ctx.route,
      viewport: ctx.viewport,
    });
    return att;
  }, []);

  return {
    attachments,
    results,
    addFile,
    addFiles,
    takeScreenshot,
    remove: AttachmentStore.remove.bind(AttachmentStore),
    clear: AttachmentStore.clear.bind(AttachmentStore),
  };
}

/** Imperatively control an audio recording session. */
export function useAudioRecorder() {
  const [recorder] = useState(() => new AudioRecorder());
  const [recording, setRecording] = useState(false);

  const start = useCallback(async () => {
    await recorder.start();
    setRecording(true);
  }, [recorder]);

  const stop = useCallback(async () => {
    const result = await recorder.stop();
    setRecording(false);
    const att = AttachmentStore.add(result.blob, {
      name: `audio-${Date.now()}.webm`,
      source: "recording",
      durationSec: result.durationSec,
    });
    const ctx = captureUIContext();
    MultimodalPipeline.analyze(att, {
      route: ctx.route,
      viewport: ctx.viewport,
    });
    return att;
  }, [recorder]);

  const cancel = useCallback(() => {
    recorder.cancel();
    setRecording(false);
  }, [recorder]);

  return { recording, start, stop, cancel, supported: recorder.isSupported() };
}
