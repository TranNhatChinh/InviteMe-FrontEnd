import type { SeatingDragPointer } from "../../../core/realtime/seating-drag-events";

// A critically damped spring follows the newest sample without building a queue.
// At a steady speed this setting trails the target by roughly 40 ms.
const SPRING_FREQUENCY = 50;

function advanceSpring(position: number, velocity: number, target: number, seconds: number) {
  const offset = position - target;
  const step = (velocity + SPRING_FREQUENCY * offset) * seconds;
  const decay = Math.exp(-SPRING_FREQUENCY * seconds);
  return {
    position: target + (offset + step) * decay,
    velocity: (velocity - SPRING_FREQUENCY * step) * decay,
  };
}

// Keep points in the anchor's pixel space, then resolve its current geometry at paint time.
export function createSeatingCursorAnimator(element: HTMLDivElement) {
  let pointer: SeatingDragPointer | undefined;
  let basis = { width: 1, height: 1 };
  let point: [number, number] = [0, 0];
  let velocity: [number, number] = [0, 0];
  let target: [number, number] = [0, 0];
  let screen: [number, number] | undefined;
  let anchor: HTMLElement | null = null;
  let lastFrame: number | undefined;
  let frame: number;

  function paint(now: number) {
    if (pointer) {
      if (!anchor?.isConnected)
        anchor = document.querySelector<HTMLElement>(
          `[data-seating-pointer-anchor="${pointer.anchor}"]`,
        );
      const rect = anchor?.getBoundingClientRect();
      element.hidden = !rect || rect.width <= 0 || rect.height <= 0;
      if (rect && !element.hidden) {
        if (lastFrame !== undefined) {
          const seconds = Math.max(0, (now - lastFrame) / 1000);
          const x = advanceSpring(point[0], velocity[0], target[0], seconds);
          const y = advanceSpring(point[1], velocity[1], target[1], seconds);
          point = [x.position, y.position];
          velocity = [x.velocity, y.velocity];
          if (
            Math.abs(point[0] - target[0]) < 0.01 &&
            Math.abs(point[1] - target[1]) < 0.01 &&
            Math.abs(velocity[0]) < 0.01 &&
            Math.abs(velocity[1]) < 0.01
          ) {
            point = [...target];
            velocity = [0, 0];
          }
        }
        const rawX = rect.left + (point[0] / basis.width) * rect.width;
        const rawY = rect.top + (point[1] / basis.height) * rect.height;
        screen = [rawX, rawY];
        const x = Math.max(12, Math.min(innerWidth - 12, rawX));
        const y = Math.max(12, Math.min(innerHeight - 12, rawY));
        element.dataset.offscreen = String(
          rawX < 0 || rawY < 0 || rawX > innerWidth || rawY > innerHeight,
        );
        element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        element.style.setProperty("--chip-x", x > innerWidth - 260 ? "-245px" : "14px");
        element.style.setProperty("--chip-y", y > innerHeight - 200 ? "-190px" : "12px");
      }
    }
    lastFrame = now;
    frame = requestAnimationFrame(paint);
  }
  frame = requestAnimationFrame(paint);

  return {
    push(next: SeatingDragPointer) {
      if (pointer?.dragId === next.dragId && pointer.sequence >= next.sequence) return;
      const changedAnchor = pointer?.anchor !== next.anchor;
      const firstSample = !pointer;
      pointer = next;
      if (changedAnchor || !anchor?.isConnected) {
        anchor = document.querySelector<HTMLElement>(
          `[data-seating-pointer-anchor="${next.anchor}"]`,
        );
        const rect = anchor?.getBoundingClientRect();
        basis = { width: rect?.width || 1, height: rect?.height || 1 };
        if (screen && rect && !firstSample) point = [screen[0] - rect.left, screen[1] - rect.top];
        velocity = [0, 0];
      }
      target = [next.x * basis.width, next.y * basis.height];
      if (firstSample) {
        point = [...target];
        velocity = [0, 0];
      }
    },
    reset() {
      pointer = undefined;
      screen = undefined;
      anchor = null;
      lastFrame = undefined;
      velocity = [0, 0];
      element.hidden = true;
    },
    dispose() {
      cancelAnimationFrame(frame);
    },
  };
}
