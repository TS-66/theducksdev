/**
 * Ducky AI | Coder — computer-use perception via screen capture.
 *
 * `getDisplayMedia` lets the USER pick a screen/window/tab to share (the
 * browser always shows its own picker — the page can never capture silently).
 * We grab one frame, store it as a workspace image, and the agent reads it
 * with the existing `vision_describe` tool. That closes the loop: see the
 * real screen → reason about it → act with disk and workspace tools.
 */

export function isScreenCaptureSupported(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia
    );
  } catch {
    return false;
  }
}

function needDom<T>(name: string): T {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    throw new Error(`${name}: needs a real browser (unavailable here)`);
  }
  return undefined as T;
}

/**
 * Capture one screen frame into the workspace (`images/screen-*.png`).
 * Resolves with the workspace path. The browser's share picker + the
 * permission policy gate (sideEffects) both stand in front of this.
 */
export async function captureScreenToWorkspace(
  sessionId: string,
  writeFile: (path: string, content: string) => void,
): Promise<string> {
  needDom<void>("screen_capture");
  if (!isScreenCaptureSupported()) {
    throw new Error("screen_capture: this browser does not support screen sharing (needs getDisplayMedia)");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e) {
    throw new Error(`screen_capture: share picker dismissed or denied (${(e as Error).message})`);
  }
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("screen_capture: no video track in the shared stream");
    const settings = track.getSettings?.() ?? {};
    const w = settings.width ?? 1280;
    const h = settings.height ?? 800;

    const video = document.createElement("video");
    video.muted = true;
    (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
    video.srcObject = stream;
    await video.play();
    // let the first real frame arrive
    await new Promise((r) => setTimeout(r, 350));

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(w, 1920);
    canvas.height = Math.min(h, Math.round((Math.min(w, 1920) / w) * h));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("screen_capture: 2d canvas unavailable");
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    video.pause();
    video.srcObject = null;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const path = `images/screen-${stamp}.png`;
    writeFile(path, dataUrl);
    const kb = Math.round((dataUrl.length * 3) / 4 / 1024);
    void sessionId;
    return `Captured ${canvas.width}×${canvas.height} (${kb} KB) → ${path}. Use vision_describe on it to see the screen.`;
  } finally {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // noop
      }
    });
  }
}
