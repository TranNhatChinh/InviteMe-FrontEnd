import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  createInvitationAudioController,
  type InvitationAudioState,
} from "../src/features/template-studio/components/invitation-audio-controller";

class Audio extends EventTarget {
  paused = true;
  calls = 0;
  result = () => Promise.resolve();
  play() {
    this.calls++;
    return this.result().then(() => {
      this.paused = false;
      this.dispatchEvent(new Event("playing"));
    });
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}
const denied = () =>
  Promise.reject(Object.assign(new Error("Blocked"), { name: "NotAllowedError" }));

test("invitation attempts autoplay immediately, and manual pause survives later interactions", async () => {
  const audio = new Audio(),
    document = new EventTarget();
  const states: InvitationAudioState[] = [];
  const player = createInvitationAudioController(audio, [document], (state) => states.push(state));
  player.start();
  assert.equal(audio.calls, 1);
  await setImmediate();
  assert.equal(states.at(-1), "playing");
  player.toggle();
  assert.equal(audio.paused, true);
  document.dispatchEvent(new Event("click"));
  document.dispatchEvent(new Event("touchend"));
  assert.equal(audio.calls, 1);
  player.toggle();
  await setImmediate();
  assert.equal(audio.calls, 2);
  assert.equal(states.at(-1), "playing");
  player.destroy();
  assert.equal(audio.paused, true);
});

test("blocked autoplay retries on the first gesture in either preview or parent document", async () => {
  for (const targetIndex of [0, 1]) {
    const audio = new Audio(),
      targets = [new EventTarget(), new EventTarget()];
    let state: InvitationAudioState = "paused";
    audio.result = denied;
    const player = createInvitationAudioController(audio, targets, (next) => {
      state = next;
    });
    player.start();
    await setImmediate();
    assert.equal(state, "blocked");
    let resolve: () => void = () => {};
    audio.result = () =>
      new Promise<void>((done) => {
        resolve = done;
      });
    targets[targetIndex]?.dispatchEvent(new Event("click"));
    targets[0]?.dispatchEvent(new Event("touchend"));
    targets[1]?.dispatchEvent(new Event("keydown"));
    assert.equal(audio.calls, 2);
    resolve();
    await setImmediate();
    assert.equal(state, "playing");
    targets[0]?.dispatchEvent(new Event("click"));
    assert.equal(audio.calls, 2);
    player.destroy();
  }
});

test("clicking the music button does not also trigger the global retry", async () => {
  const audio = new Audio();
  const button = Object.assign(new EventTarget(), { closest: () => ({}) });
  audio.result = denied;
  const player = createInvitationAudioController(audio, [button], () => {});
  player.start();
  await setImmediate();
  audio.result = () => Promise.resolve();
  button.dispatchEvent(new Event("click"));
  assert.equal(audio.calls, 1);
  player.toggle();
  await setImmediate();
  assert.equal(audio.calls, 2);
  assert.equal(audio.paused, false);
  player.destroy();
});

test("network failures wait for manual retry and cleanup removes blocked gesture retries", async () => {
  const audio = new Audio(),
    document = new EventTarget();
  const states: InvitationAudioState[] = [];
  audio.result = () => Promise.reject(new Error("Network error"));
  const player = createInvitationAudioController(audio, [document], (state) => states.push(state));
  player.start();
  await setImmediate();
  assert.equal(states.at(-1), "error");
  document.dispatchEvent(new Event("click"));
  assert.equal(audio.calls, 1);
  audio.result = denied;
  player.toggle();
  await setImmediate();
  assert.equal(states.at(-1), "blocked");
  player.destroy();
  const count = states.length;
  document.dispatchEvent(new Event("click"));
  audio.dispatchEvent(new Event("error"));
  assert.equal(audio.calls, 2);
  assert.equal(states.length, count);
});

test("a late play completion cannot overwrite a manual pause", async () => {
  const audio = new Audio(),
    document = new EventTarget();
  const states: InvitationAudioState[] = [];
  let resolve: () => void = () => {};
  audio.result = () =>
    new Promise<void>((done) => {
      resolve = done;
    });
  const player = createInvitationAudioController(audio, [document], (state) => states.push(state));
  player.start();
  player.toggle();
  resolve();
  await setImmediate();
  assert.equal(states.at(-1), "paused");
  document.dispatchEvent(new Event("click"));
  assert.equal(audio.calls, 1);
  player.destroy();
});
