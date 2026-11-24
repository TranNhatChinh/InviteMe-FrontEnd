export type InvitationAudioState = "loading" | "playing" | "paused" | "blocked" | "error";
type AudioPort = EventTarget & { paused: boolean; play: () => Promise<void>; pause: () => void };

// Each invitation owns its playback intent. A deliberate pause must survive later gestures.
export function createInvitationAudioController(
  audio: AudioPort,
  gestureTargets: EventTarget[],
  onState: (state: InvitationAudioState) => void,
) {
  let disposed = false;
  let wanted = true;
  let pending = false;
  let sequence = 0;
  let waiting = false;
  const targets = [...new Set(gestureTargets)];
  const gestures = ["click", "touchend", "keydown"];
  function disarm() {
    waiting = false;
    for (const target of targets)
      for (const event of gestures) target.removeEventListener(event, retry, true);
  }
  function retry(event: Event) {
    const target = event.target as { closest?: (selector: string) => unknown } | null;
    if (target?.closest?.("[data-invitation-audio-control]")) return;
    if (wanted && waiting && !pending) attempt();
  }
  function arm() {
    if (waiting || disposed || !wanted) return;
    waiting = true;
    for (const target of targets)
      for (const event of gestures) target.addEventListener(event, retry, true);
  }
  function attempt() {
    if (disposed || !wanted || pending) return;
    const request = ++sequence;
    pending = true;
    onState("loading");
    let result: Promise<void>;
    try {
      result = audio.play();
    } catch (error) {
      result = Promise.reject(error);
    }
    void result.then(
      () => {
        if (disposed || request !== sequence) return;
        pending = false;
        disarm();
        onState("playing");
      },
      (error: unknown) => {
        if (disposed || request !== sequence) return;
        pending = false;
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "NotAllowedError"
        ) {
          onState("blocked");
          arm();
        } else {
          disarm();
          onState("error");
        }
      },
    );
  }
  function pause() {
    wanted = false;
    pending = false;
    sequence++;
    disarm();
    audio.pause();
    if (!disposed) onState("paused");
  }
  const onPlaying = () => {
    if (!disposed && wanted) {
      disarm();
      onState("playing");
    }
  };
  const onPause = () => {
    if (!disposed && !pending && !waiting) onState("paused");
  };
  const onError = () => {
    if (!disposed) {
      sequence++;
      pending = false;
      disarm();
      onState("error");
    }
  };
  audio.addEventListener("playing", onPlaying);
  audio.addEventListener("pause", onPause);
  audio.addEventListener("ended", onPause);
  audio.addEventListener("error", onError);
  return {
    start: attempt,
    toggle() {
      if (disposed) return;
      if (pending || !audio.paused) pause();
      else {
        wanted = true;
        attempt();
      }
    },
    destroy() {
      disposed = true;
      pause();
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("error", onError);
    },
  };
}
