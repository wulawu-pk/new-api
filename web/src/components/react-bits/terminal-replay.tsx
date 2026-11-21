"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cn } from "@/lib/utils";

export type TerminalTone = "muted" | "dim" | "accent" | "success" | "warning" | "error" | "info" | "bold";

export type TerminalStep =
  | { type: "command"; text: string; directory?: string }
  | { type: "output"; lines: string[]; delay?: number }
  | { type: "spinner"; text: string; duration?: number; done?: string; status?: "success" | "warning" | "error" }
  | { type: "progress"; text: string; duration?: number; done?: string }
  | { type: "pause"; duration?: number }
  | { type: "clear" };

export interface TerminalReplayHandle {
  play: () => void;
  pause: () => void;
  restart: () => void;
  skip: () => void;
}

export interface TerminalReplayProps {
  script?: TerminalStep[];
  title?: string;
  prompt?: string;
  directory?: string;
  chrome?: "window" | "minimal" | "none";
  frame?: "solid" | "inset";
  dots?: "mono" | "color";
  theme?: "auto" | "light" | "dark";
  accentColor?: string;
  windowColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  height?: number | string;
  radius?: number;
  typingSpeed?: number;
  variance?: number;
  lineDelay?: number;
  startDelay?: number;
  hold?: number;
  loop?: boolean;
  autoplay?: boolean;
  cursor?: "block" | "bar" | "underline";
  copyable?: boolean;
  interactive?: boolean;
  onComplete?: () => void;
  className?: string;
  style?: CSSProperties;
}

type Row =
  | { id: number; kind: "command"; text: string; typed: number; directory: string; done: boolean }
  | { id: number; kind: "line"; text: string }
  | { id: number; kind: "spinner"; text: string; frame: number; done: string; status: "success" | "warning" | "error"; finished: boolean }
  | { id: number; kind: "progress"; text: string; value: number; done: string; finished: boolean };

interface Engine {
  step: number;
  time: number;
  phase: "start" | "run" | "hold" | "fade" | "done";
  rows: Row[];
  nextId: number;
  delays: number[];
  total: number;
  shown: number;
  curve: number[];
  fade: number;
  notified: boolean;
}

interface View {
  rows: Row[];
  fade: number;
  activeCommand: boolean;
  idle: boolean;
  starting: boolean;
}

interface Palette {
  surface: string;
  frame: string;
  frameShadow: string;
  panel: string;
  bar: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  shadow: string;
  dot: string;
  hover: string;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TONES = new Set<TerminalTone>(["muted", "dim", "accent", "success", "warning", "error", "info", "bold"]);
const MONO = 'var(--font-mono, ui-monospace), ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const SANS = 'var(--font-sans, ui-sans-serif), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const BAR = 22;

const DEFAULT_SCRIPT: TerminalStep[] = [
  { type: "command", text: "npm create acme@latest my-app" },
  { type: "spinner", text: "Scaffolding project", duration: 1300, done: "Created [bold]my-app[/] [muted]in 1.3s[/]" },
  { type: "spinner", text: "Installing dependencies", duration: 2100, done: "Installed 214 packages [muted]in 2.1s[/]" },
  { type: "output", lines: ["", "[muted]Next steps[/]", "  cd my-app", "  npm run dev", ""] },
  { type: "command", text: "cd my-app && npm run dev" },
  {
    type: "output",
    lines: ["", "  [accent]acme[/] [bold]4.2.0[/]", "  [muted]Local[/]    [info]http://localhost:3000[/]", "  [muted]Network[/]  [info]http://192.168.1.24:3000[/]", "", "[success]✓[/] Ready in 812ms"],
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const finite = (value: number | undefined, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const parse = (text: string) => {
  const parts: { text: string; tone?: TerminalTone }[] = [];
  const pattern = /\[([a-z]+)\]([\s\S]*?)\[\/\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    const tone = match[1] as TerminalTone;
    parts.push({ text: match[2], tone: TONES.has(tone) ? tone : undefined });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
};

const plain = (text: string) => text.replace(/\[([a-z]+)\]([\s\S]*?)\[\/\]/g, "$2");

const subscribeToMotion = (notify: () => void) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

const readMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const subscribeToHover = (notify: () => void) => {
  const media = window.matchMedia("(hover: none)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

const readHover = () => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

const luminance = (color: string, probe: CanvasRenderingContext2D | null) => {
  if (!probe) return -1;
  probe.fillStyle = "#010203";
  probe.fillStyle = color;
  if (String(probe.fillStyle) === "#010203" && color.trim().toLowerCase() !== "#010203") return -1;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const rgba = probe.getImageData(0, 0, 1, 1).data;
  if (rgba[3] / 255 < 0.5) return -1;
  const linear = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(rgba[0]) + 0.7152 * linear(rgba[1]) + 0.0722 * linear(rgba[2]);
};

const readBackdrop = (root: HTMLElement, probe: CanvasRenderingContext2D | null) => {
  let node: Element | null = root.parentElement;
  let view: Window | null = root.ownerDocument.defaultView;
  for (let hop = 0; hop < 4 && view; hop += 1) {
    while (node) {
      const color = view.getComputedStyle(node).backgroundColor;
      const value = luminance(color, probe);
      if (value >= 0) return { dark: value < 0.35, color };
      node = node.parentElement;
    }
    let frame: Element | null = null;
    try {
      frame = view.frameElement;
    } catch {
      frame = null;
    }
    if (!frame) break;
    node = frame.parentElement;
    view = frame.ownerDocument.defaultView;
  }
  const doc = root.ownerDocument;
  const html = doc.documentElement;
  const own = doc.defaultView ?? window;
  if (html.classList.contains("dark")) return { dark: true, color: null };
  if (html.classList.contains("light")) return { dark: false, color: null };
  const scheme = own.getComputedStyle(html).colorScheme;
  if (scheme === "dark" || scheme === "light") return { dark: scheme === "dark", color: null };
  return { dark: own.matchMedia("(prefers-color-scheme: dark)").matches, color: null };
};

const makePalette = (dark: boolean, accent?: string, surface?: string, text?: string): Palette =>
  dark
    ? {
        surface: surface || "#111113",
        frame: `color-mix(in srgb, ${surface || "#111113"} 94%, #ffffff)`,
        frameShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 24px 60px -16px rgba(0,0,0,0.65)",
        panel: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        bar: "rgba(255,255,255,0.025)",
        text: text || "#E7E7EA",
        muted: "#8C8C95",
        dim: "#5D5D66",
        accent: accent || "#A99BFF",
        success: "#5EDB8A",
        warning: "#F5C451",
        error: "#FF7A7A",
        info: "#7DB4FF",
        shadow: "0 0 0 1px rgba(255,255,255,0.07), 0 24px 60px -16px rgba(0,0,0,0.65)",
        dot: "rgba(255,255,255,0.14)",
        hover: "rgba(255,255,255,0.07)",
      }
    : {
        surface: surface || "#FFFFFF",
        frame: `color-mix(in srgb, ${surface || "#FFFFFF"} 96%, #000000)`,
        frameShadow: "0 0 0 1px rgba(0,0,0,0.05), 0 16px 40px -14px rgba(0,0,0,0.14)",
        panel: "inset 0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        bar: "rgba(0,0,0,0.022)",
        text: text || "#18181B",
        muted: "#71717A",
        dim: "#A1A1AA",
        accent: accent || "#5227FF",
        success: "#15803D",
        warning: "#B45309",
        error: "#DC2626",
        info: "#2563EB",
        shadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -14px rgba(0,0,0,0.16)",
        dot: "rgba(0,0,0,0.12)",
        hover: "rgba(0,0,0,0.05)",
      };

const toneColor = (tone: TerminalTone | undefined, palette: Palette) => {
  switch (tone) {
    case "muted":
      return palette.muted;
    case "dim":
      return palette.dim;
    case "accent":
      return palette.accent;
    case "success":
      return palette.success;
    case "warning":
      return palette.warning;
    case "error":
      return palette.error;
    case "info":
      return palette.info;
    default:
      return undefined;
  }
};

const fresh = (): Engine => ({
  step: 0,
  time: 0,
  phase: "start",
  rows: [],
  nextId: 1,
  delays: [],
  total: 0,
  shown: 0,
  curve: [],
  fade: 0,
  notified: false,
});

const TerminalReplay = forwardRef<TerminalReplayHandle, TerminalReplayProps>(function TerminalReplay(
  {
    script = DEFAULT_SCRIPT,
    title = "my-app — zsh",
    prompt = "❯",
    directory = "~",
    chrome = "window",
    frame = "inset",
    dots = "mono",
    theme = "auto",
    accentColor,
    windowColor,
    textColor,
    fontFamily,
    fontSize = 13,
    lineHeight = 1.7,
    height = 360,
    radius = 16,
    typingSpeed = 26,
    variance = 0.5,
    lineDelay = 70,
    startDelay = 700,
    hold = 3200,
    loop = true,
    autoplay = true,
    cursor = "block",
    copyable = true,
    interactive = true,
    onComplete,
    className,
    style,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(fresh());
  const [view, setView] = useState<View>({ rows: [], fade: 0, activeCommand: false, idle: true, starting: true });
  const [dark, setDark] = useState(theme === "dark");
  const [playing, setPlaying] = useState(autoplay);
  const [copied, setCopied] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const [scrolled, setScrolled] = useState(false);
  const reduced = useSyncExternalStore(subscribeToMotion, readMotion, () => false);
  const touch = useSyncExternalStore(subscribeToHover, readHover, () => false);
  const scriptKey = useMemo(() => JSON.stringify(script), [script]);
  const settings = {
    script,
    directory,
    typingSpeed,
    variance,
    lineDelay,
    startDelay,
    hold,
    loop,
    onComplete,
  };
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const commit = useCallback(() => {
    const engine = engineRef.current;
    const current = settingsRef.current.script[engine.step];
    setView({
      rows: engine.rows.map((row) => ({ ...row })),
      fade: engine.fade,
      activeCommand: engine.phase === "run" && current?.type === "command",
      idle:
        engine.phase === "start" ||
        engine.phase === "hold" ||
        engine.phase === "done" ||
        (engine.phase === "run" && current?.type === "pause"),
      starting: engine.phase === "start",
    });
  }, []);

  const enter = useCallback((engine: Engine) => {
    const { script: steps, typingSpeed: speed, variance: spread, directory: home } = settingsRef.current;
    const step = steps[engine.step];
    engine.time = 0;
    engine.shown = 0;
    if (!step) return;
    if (step.type === "command") {
      const base = 1000 / clamp(finite(speed, 26), 2, 200);
      const jitter = clamp(finite(spread, 0.5), 0, 1);
      const delays: number[] = [];
      let total = 260 + 260 * jitter * Math.random();
      for (const char of step.text) {
        let delay = base * (1 + jitter * 0.7 * (Math.random() * 2 - 1));
        if (char === " ") delay *= 1.6;
        else if (/[./\\:;,@&|=-]/.test(char)) delay *= 1.3;
        if (Math.random() < 0.04 * jitter) delay += base * 4;
        total += delay;
        delays.push(total);
      }
      engine.delays = delays;
      engine.total = total + 380;
      engine.rows.push({ id: engine.nextId++, kind: "command", text: step.text, typed: 0, directory: step.directory ?? home, done: false });
    } else if (step.type === "spinner") {
      engine.rows.push({
        id: engine.nextId++,
        kind: "spinner",
        text: step.text,
        frame: 0,
        done: step.done ?? "",
        status: step.status ?? "success",
        finished: false,
      });
    } else if (step.type === "progress") {
      const curve = [0];
      let level = 0;
      for (let i = 1; i < 6; i++) {
        level = Math.min(1, level + (0.12 + Math.random() * 0.3) * (1 - level) * 1.6);
        curve.push(level);
      }
      curve.push(1);
      engine.curve = curve;
      engine.rows.push({ id: engine.nextId++, kind: "progress", text: step.text, value: 0, done: step.done ?? "", finished: false });
    } else if (step.type === "clear") {
      engine.rows = [];
    }
  }, []);

  const run = useCallback(
    (engine: Engine, budget: number, force: boolean): number => {
      const { script: steps, lineDelay: gap } = settingsRef.current;
      const step = steps[engine.step];
      if (!step) return budget;
      engine.time += budget;
      const row = engine.rows[engine.rows.length - 1];
      if (step.type === "command" && row && row.kind === "command") {
        if (force) engine.time = Math.max(engine.time, engine.total);
        let typed = 0;
        while (typed < engine.delays.length && engine.delays[typed] <= engine.time) typed++;
        if (typed !== row.typed) row.typed = typed;
        if (engine.time < engine.total) return -1;
        row.typed = row.text.length;
        row.done = true;
        return force ? 0 : engine.time - engine.total;
      }
      if (step.type === "output") {
        const wait = Math.max(0, finite(step.delay, finite(gap, 70)));
        const due = force ? step.lines.length : wait <= 0 ? step.lines.length : Math.min(step.lines.length, Math.floor(engine.time / wait) + 1);
        while (engine.shown < due) {
          engine.rows.push({ id: engine.nextId++, kind: "line", text: step.lines[engine.shown] });
          engine.shown++;
        }
        const end = wait * step.lines.length;
        if (engine.shown < step.lines.length || (!force && engine.time < end)) return -1;
        return force ? 0 : engine.time - end;
      }
      if (step.type === "spinner" && row && row.kind === "spinner") {
        const duration = Math.max(0, finite(step.duration, 1600));
        row.frame = Math.floor(engine.time / 80) % SPINNER.length;
        if (!force && engine.time < duration) return -1;
        row.finished = true;
        return force ? 0 : engine.time - duration;
      }
      if (step.type === "progress" && row && row.kind === "progress") {
        const duration = Math.max(1, finite(step.duration, 1800));
        const t = force ? 1 : clamp(engine.time / duration, 0, 1);
        const at = t * (engine.curve.length - 1);
        const index = Math.min(engine.curve.length - 2, Math.floor(at));
        const local = at - index;
        const eased = local * local * (3 - 2 * local);
        row.value = engine.curve[index] + (engine.curve[index + 1] - engine.curve[index]) * eased;
        if (t < 1) return -1;
        row.value = 1;
        row.finished = true;
        return force ? 0 : engine.time - duration;
      }
      if (step.type === "pause") {
        const duration = Math.max(0, finite(step.duration, 1000));
        if (!force && engine.time < duration) return -1;
        return force ? 0 : engine.time - duration;
      }
      return force ? 0 : engine.time;
    },
    [],
  );

  const advance = useCallback(
    (dt: number, force = false) => {
      const engine = engineRef.current;
      const { script: steps, startDelay: delay, hold: rest, loop: repeat } = settingsRef.current;
      let budget = dt;
      let guard = 0;
      while (guard++ < 400) {
        if (engine.phase === "done") return;
        if (engine.phase === "start") {
          engine.time += budget;
          const wait = Math.max(0, finite(delay, 700));
          if (!force && engine.time < wait) return;
          budget = force ? 0 : engine.time - wait;
          engine.phase = "run";
          engine.step = 0;
          enter(engine);
          if (force) return;
          continue;
        }
        if (engine.phase === "hold") {
          engine.time += budget;
          if (!force && engine.time < Math.max(0, finite(rest, 3200))) return;
          engine.phase = "fade";
          engine.time = 0;
          budget = 0;
          continue;
        }
        if (engine.phase === "fade") {
          engine.time += budget;
          engine.fade = clamp(engine.time / 420, 0, 1);
          if (engine.fade < 1) return;
          const next = fresh();
          next.nextId = engine.nextId;
          next.time = Math.max(0, finite(delay, 700)) * 0.6;
          Object.assign(engine, next);
          return;
        }
        if (engine.step >= steps.length) {
          if (!engine.notified) {
            engine.notified = true;
            settingsRef.current.onComplete?.();
          }
          engine.phase = repeat ? "hold" : "done";
          engine.time = 0;
          return;
        }
        const left = run(engine, budget, force);
        if (left < 0) return;
        engine.step++;
        enter(engine);
        if (force) return;
        budget = left;
      }
    },
    [enter, run],
  );

  const finish = useCallback(() => {
    const engine = engineRef.current;
    const { script: steps } = settingsRef.current;
    if (engine.phase === "start") {
      engine.phase = "run";
      engine.step = 0;
      enter(engine);
    }
    let guard = 0;
    while (engine.step < steps.length && guard++ < 1000) {
      run(engine, 0, true);
      engine.step++;
      enter(engine);
    }
    engine.phase = "done";
    engine.fade = 0;
  }, [enter, run]);

  useEffect(() => {
    engineRef.current = fresh();
    if (reduced) finish();
    commit();
  }, [scriptKey, reduced, finish, commit]);

  useEffect(() => {
    setPlaying(autoplay);
  }, [autoplay]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const view = doc.defaultView ?? window;
    if (theme !== "auto") {
      setDark(theme === "dark");
      return;
    }
    const probe = doc.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const measure = () => {
      setDark(readBackdrop(root, probe).dark);
    };
    const frames: number[] = [];
    const timers: number[] = [];
    const schedule = () => {
      frames.push(view.requestAnimationFrame(measure));
      timers.push(view.setTimeout(measure, 380));
    };
    schedule();
    timers.push(view.setTimeout(measure, 1200));
    const observer = new MutationObserver(schedule);
    const watch = (target: Document) => {
      observer.observe(target.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
      if (target.body) observer.observe(target.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    };
    watch(doc);
    let outer: Element | null = null;
    try {
      outer = view.frameElement;
    } catch {
      outer = null;
    }
    if (outer) watch(outer.ownerDocument);
    return () => {
      observer.disconnect();
      frames.forEach((id) => view.cancelAnimationFrame(id));
      timers.forEach((id) => view.clearTimeout(id));
    };
  }, [theme]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced || !playing) return;
    const doc = root.ownerDocument;
    const view = doc.defaultView ?? window;
    let visible = false;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const engine = engineRef.current;
      const before = engine.rows.length;
      const snapshot = engine.rows.map((row) =>
        row.kind === "command" ? row.typed : row.kind === "spinner" ? row.frame + (row.finished ? 100 : 0) : row.kind === "progress" ? Math.round(row.value * 100) : 0,
      );
      const phase = engine.phase;
      const fade = engine.fade;
      advance(dt);
      const changed =
        engine.rows.length !== before ||
        engine.phase !== phase ||
        engine.fade !== fade ||
        engine.rows.some((row, index) => {
          const value =
            row.kind === "command" ? row.typed : row.kind === "spinner" ? row.frame + (row.finished ? 100 : 0) : row.kind === "progress" ? Math.round(row.value * 100) : 0;
          return value !== snapshot[index];
        });
      if (changed) commit();
      if (visible && !doc.hidden && engineRef.current.phase !== "done") raf = view.requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf || !visible || doc.hidden || engineRef.current.phase === "done") return;
      last = 0;
      raf = view.requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) wake();
      },
      { threshold: 0.15 },
    );
    observer.observe(root);
    const onVisibility = () => wake();
    doc.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      doc.removeEventListener("visibilitychange", onVisibility);
      view.cancelAnimationFrame(raf);
    };
  }, [advance, commit, playing, reduced, scriptKey]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (view.rows.length === 0) {
      body.scrollTop = 0;
    } else {
      const target = body.scrollHeight - body.clientHeight;
      if (target > 1 && Math.abs(body.scrollTop - target) > 1) {
        body.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });
      }
    }
    const next = view.rows.length > 0 && body.scrollHeight - body.clientHeight > 1;
    if (next !== scrolled) setScrolled(next);
  }, [view, reduced, scrolled]);

  const restart = useCallback(() => {
    engineRef.current = fresh();
    if (reduced) finish();
    setPlaying(true);
    commit();
  }, [commit, finish, reduced]);

  const skip = useCallback(() => {
    const engine = engineRef.current;
    if (engine.phase === "done" || engine.phase === "hold" || engine.phase === "fade") {
      restart();
      return;
    }
    advance(0, true);
    commit();
  }, [advance, commit, restart]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      restart,
      skip,
    }),
    [restart, skip],
  );

  const copy = (event: ReactMouseEvent, row: Row) => {
    event.stopPropagation();
    if (row.kind !== "command") return;
    const doc = rootRef.current?.ownerDocument ?? document;
    const done = () => {
      setCopied(row.id);
      (doc.defaultView ?? window).setTimeout(() => setCopied((value) => (value === row.id ? -1 : value)), 1400);
    };
    const fallback = () => {
      const area = doc.createElement("textarea");
      area.value = row.text;
      area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      doc.body.appendChild(area);
      area.select();
      try {
        doc.execCommand("copy");
      } catch {}
      area.remove();
      done();
    };
    const clipboard = (doc.defaultView ?? window).navigator.clipboard;
    if (clipboard?.writeText) clipboard.writeText(row.text).then(done, fallback);
    else fallback();
  };

  const onClick = () => {
    if (interactive) skip();
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!interactive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      skip();
    }
  };

  const palette = makePalette(dark, accentColor, windowColor, textColor);
  const { rows, activeCommand, idle } = view;
  const size = clamp(finite(fontSize, 13), 9, 24);
  const leading = clamp(finite(lineHeight, 1.7), 1.1, 2.4);
  const font = fontFamily || MONO;
  const corner = clamp(finite(radius, 14), 0, 40);
  const inset = frame === "inset";
  const gap = 4;
  const inner = Math.max(0, corner - gap);

  const caretStyle = (): CSSProperties => {
    const base: CSSProperties = { display: "inline-block", verticalAlign: "text-bottom", background: palette.accent };
    if (cursor === "bar") return { ...base, width: Math.max(2, Math.round(size * 0.14)), height: `${leading * 0.82}em`, marginLeft: 1 };
    if (cursor === "underline") return { ...base, width: "0.6em", height: Math.max(2, Math.round(size * 0.14)), verticalAlign: "baseline" };
    return { ...base, width: "0.6em", height: `${leading * 0.86}em`, opacity: 0.85 };
  };

  const blink = (node: HTMLSpanElement | null) => {
    if (!node || reduced || typeof node.animate !== "function") return;
    node.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.5 },
        { opacity: 0, offset: 0.5 },
        { opacity: 0, offset: 1 },
      ],
      { duration: 1060, iterations: Infinity },
    );
  };

  const rise = (node: HTMLDivElement | null) => {
    if (!node || reduced || node.dataset.entered || typeof node.animate !== "function") return;
    node.dataset.entered = "1";
    node.animate(
      [
        { opacity: 0, transform: "translateY(3px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
  };

  const segments = (text: string) =>
    parse(text).map((part, index) => (
      <span key={index} style={{ color: toneColor(part.tone, palette), fontWeight: part.tone === "bold" ? 600 : undefined }}>
        {part.text}
      </span>
    ));

  const promptParts = (home: string) => (
    <>
      {home ? <span style={{ color: palette.muted }}>{home} </span> : null}
      <span style={{ color: palette.accent, fontWeight: 600 }}>{prompt}</span>{" "}
    </>
  );

  const renderRow = (row: Row, index: number) => {
    const last = index === rows.length - 1;
    if (row.kind === "command") {
      const showCaret = last && activeCommand && !row.done;
      const showCopy = copyable && row.done;
      return (
        <div
          key={row.id}
          style={{ position: "relative", paddingRight: showCopy ? 34 : 0 }}
          onMouseEnter={() => setHovered(row.id)}
          onMouseLeave={() => setHovered((value) => (value === row.id ? -1 : value))}
        >
          {promptParts(row.directory)}
          <span style={{ color: palette.text }}>{row.text.slice(0, row.typed)}</span>
          {showCaret ? <span style={caretStyle()} /> : null}
          {showCopy ? (
            <button
              type="button"
              aria-label="Copy command"
              onClick={(event) => copy(event, row)}
              onFocus={() => setHovered(row.id)}
              onBlur={() => setHovered((value) => (value === row.id ? -1 : value))}
              onMouseEnter={(event) => (event.currentTarget.style.background = palette.hover)}
              onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
              style={{
                position: "absolute",
                right: -6,
                top: `calc(${leading / 2}em - 13px)`,
                boxSizing: "border-box",
                width: 26,
                height: 26,
                padding: 0,
                display: "grid",
                placeItems: "center",
                border: 0,
                borderRadius: 7,
                background: "transparent",
                color: copied === row.id ? palette.success : palette.muted,
                cursor: "pointer",
                opacity: touch || hovered === row.id || copied === row.id ? 0.9 : 0,
                pointerEvents: touch || hovered === row.id || copied === row.id ? "auto" : "none",
                transition: "opacity 160ms ease, background-color 160ms ease, color 160ms ease",
              }}
            >
              {copied === row.id ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
                  <path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      );
    }
    if (row.kind === "line") {
      return (
        <div key={row.id} ref={rise}>
          {row.text ? segments(row.text) : " "}
        </div>
      );
    }
    if (row.kind === "spinner") {
      const mark = row.status === "error" ? "✕" : row.status === "warning" ? "!" : "✓";
      const tone = row.status === "error" ? palette.error : row.status === "warning" ? palette.warning : palette.success;
      return (
        <div key={row.id} ref={rise}>
          {row.finished ? (
            <>
              <span style={{ color: tone, fontWeight: 600 }}>{mark}</span> {segments(row.done || row.text)}
            </>
          ) : (
            <>
              <span style={{ color: palette.accent }}>{SPINNER[row.frame]}</span> <span style={{ color: palette.text }}>{segments(row.text)}</span>
              <span style={{ color: palette.dim }}>…</span>
            </>
          )}
        </div>
      );
    }
    const filled = Math.round(row.value * BAR);
    return (
      <div key={row.id} ref={rise}>
        {row.finished && row.done ? (
          <>
            <span style={{ color: palette.success, fontWeight: 600 }}>✓</span> {segments(row.done)}
          </>
        ) : (
          <>
            <span style={{ color: palette.text }}>{segments(row.text)}</span>{" "}
            <span style={{ color: palette.accent }}>{"━".repeat(filled)}</span>
            <span style={{ color: palette.dim, opacity: 0.55 }}>{"━".repeat(BAR - filled)}</span>{" "}
            <span style={{ color: palette.muted }}>{String(Math.round(row.value * 100)).padStart(3, " ")}%</span>
          </>
        )}
      </div>
    );
  };

  const transcript = script
    .map((step) => {
      if (step.type === "command") return `${step.directory ?? directory} ${prompt} ${step.text}`;
      if (step.type === "output") return step.lines.map(plain).join("\n");
      if (step.type === "spinner") return plain(step.done || step.text);
      if (step.type === "progress") return plain(step.done || step.text);
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={title || "Terminal session"}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn("relative isolate flex w-full flex-col overflow-hidden", className)}
      style={{
        height,
        borderRadius: corner,
        background: inset ? palette.frame : palette.surface,
        boxShadow: inset ? palette.frameShadow : palette.shadow,
        color: palette.text,
        fontFamily: font,
        fontSize: size,
        lineHeight: leading,
        fontVariantLigatures: "none",
        cursor: interactive ? "pointer" : undefined,
        outline: "none",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
    >
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "pre" }}>{transcript}</span>
      {chrome !== "none" ? (
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            flex: "none",
            height: inset ? 38 : 40,
            display: "flex",
            alignItems: "center",
            padding: inset ? "0 13px" : "0 14px",
            background: inset ? "transparent" : palette.bar,
          }}
        >
          {chrome === "window" ? (
            <div style={{ display: "flex", gap: 7 }}>
              {(dots === "color" ? ["#FF5F57", "#FEBC2E", "#28C840"] : [palette.dot, palette.dot, palette.dot]).map((color, index) => (
                <span key={index} style={{ width: 11, height: 11, borderRadius: 999, background: color, opacity: dots === "color" && !dark ? 0.9 : 1 }} />
              ))}
            </div>
          ) : null}
          {title ? (
            <div
              style={{
                position: "absolute",
                left: 70,
                right: 70,
                textAlign: "center",
                fontFamily: SANS,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.01em",
                color: palette.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                pointerEvents: "none",
              }}
            >
              {title}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        style={{
          position: "relative",
          flex: "1 1 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          margin: inset ? (chrome === "none" ? gap : `0 ${gap}px ${gap}px`) : 0,
          borderRadius: inset ? inner : 0,
          background: inset ? palette.surface : "transparent",
          boxShadow: inset ? palette.panel : "none",
          overflow: "hidden",
        }}
      >
        <div
          ref={bodyRef}
          aria-hidden="true"
          style={{
            position: "relative",
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            padding: chrome === "none" || inset ? "16px 18px 18px" : "12px 20px 18px",
            WebkitMaskImage: scrolled ? "linear-gradient(to bottom, transparent 0, transparent 10px, #000 38px)" : undefined,
            maskImage: scrolled ? "linear-gradient(to bottom, transparent 0, transparent 10px, #000 38px)" : undefined,
          }}
        >
          <div
            style={{
              opacity: 1 - view.fade,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {rows.map(renderRow)}
            {idle && !(view.starting && rows.length > 0) ? (
              <div>
                {promptParts(directory)}
                <span ref={blink} style={caretStyle()} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

TerminalReplay.displayName = "TerminalReplay";

export { TerminalReplay };
export default TerminalReplay;
