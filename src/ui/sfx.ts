import { useSyncExternalStore } from "react";

/**
 * Zero-asset sound effects, synthesized with the Web Audio API. Off by default; the choice is
 * remembered in localStorage. The AudioContext is created only after the player turns sound on,
 * which is a user gesture, so browsers allow it to play.
 */
export type Sound = "click" | "blip" | "scan" | "deny" | "unlock" | "sign";

const KEY = "warden.sfx";
const listeners = new Set<() => void>();
let enabled = readSetting();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function readSetting(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function isSfxOn(): boolean {
  return enabled;
}

export function subscribeSfx(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSfx(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // storage unavailable (private mode): keep the setting for this page only
  }
  for (const l of listeners) l();
  if (on) playSfx("click");
}

export function useSfx(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeSfx, isSfxOn, () => false);
  return [on, setSfx];
}

function audio(): { c: AudioContext; out: GainNode } | null {
  if (!enabled || typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return master ? { c: ctx, out: master } : null;
}

interface Tone {
  type: OscillatorType;
  freq: number;
  to?: number;
  at?: number;
  dur: number;
  gain: number;
  lowpass?: number;
}

function tone(c: AudioContext, out: AudioNode, t: Tone): void {
  const start = c.currentTime + (t.at ?? 0);
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.freq, start);
  if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(t.gain, start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  let node: AudioNode = osc;
  if (t.lowpass) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = t.lowpass;
    osc.connect(f);
    node = f;
  }
  node.connect(env);
  env.connect(out);
  osc.start(start);
  osc.stop(start + t.dur + 0.02);
}

function noise(c: AudioContext, out: AudioNode, at: number, dur: number, gain: number, lowpass: number): void {
  const start = c.currentTime + at;
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const env = c.createGain();
  env.gain.value = gain;
  src.connect(f);
  f.connect(env);
  env.connect(out);
  src.start(start);
}

const SOUNDS: Record<Sound, (c: AudioContext, out: AudioNode) => void> = {
  // A short terminal key click.
  click: (c, out) => {
    tone(c, out, { type: "square", freq: 2400, dur: 0.018, gain: 0.025, lowpass: 5000 });
    noise(c, out, 0, 0.012, 0.05, 6000);
  },
  // A warden replied.
  blip: (c, out) => tone(c, out, { type: "sine", freq: 880, to: 1320, dur: 0.08, gain: 0.04 }),
  // A warden read a file.
  scan: (c, out) => {
    tone(c, out, { type: "triangle", freq: 620, to: 940, dur: 0.05, gain: 0.03 });
    tone(c, out, { type: "triangle", freq: 620, to: 940, at: 0.08, dur: 0.05, gain: 0.03 });
  },
  // The lock refused: two low buzzes.
  deny: (c, out) => {
    for (const at of [0, 0.17]) {
      tone(c, out, { type: "sawtooth", freq: 110, at, dur: 0.13, gain: 0.06, lowpass: 900 });
      tone(c, out, { type: "sawtooth", freq: 116, at, dur: 0.13, gain: 0.04, lowpass: 900 });
    }
  },
  // Bolts retract, then a short rising chime.
  unlock: (c, out) => {
    noise(c, out, 0, 0.05, 0.14, 1800);
    tone(c, out, { type: "sine", freq: 130, to: 55, dur: 0.22, gain: 0.12 });
    noise(c, out, 0.24, 0.05, 0.12, 1500);
    tone(c, out, { type: "sine", freq: 110, to: 50, at: 0.24, dur: 0.2, gain: 0.1 });
    [523.25, 659.25, 783.99].forEach((freq, i) => tone(c, out, { type: "sine", freq, at: 0.5 + i * 0.1, dur: 0.45, gain: 0.04 }));
  },
  // A clearance signature.
  sign: (c, out) => {
    tone(c, out, { type: "sine", freq: 660, to: 990, dur: 0.12, gain: 0.04 });
    tone(c, out, { type: "sine", freq: 1320, at: 0.12, dur: 0.18, gain: 0.03 });
  },
};

export function playSfx(sound: Sound): void {
  const a = audio();
  if (!a) return;
  try {
    SOUNDS[sound](a.c, a.out);
  } catch {
    // sound is decoration; never let it break the game
  }
}
