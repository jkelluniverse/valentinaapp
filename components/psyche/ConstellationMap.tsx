"use client";

import { useEffect, useRef } from "react";

// C16.3 — the constellation canvas. A living force layout, hand-rolled (no
// heavy graph deps): wounds/shadows are gravity wells whose mass is earned from
// evidence; proximity = connection strength; light = recency. Always the dusk
// palette — constellations belong to the night. Never a pathology chart.

export type RenderNode = {
  id: string;
  kind: string;
  label: string;
  state: string; // ACTIVE | LOOSENING | INTEGRATED
  source: string; // AI_EXTRACTED | PRACTITIONER | SELF_REPORTED
  weight: number;
  glow: number; // 0..1
  hasSuggestion: boolean;
  selfX: number | null;
  selfY: number | null;
  createdAt: number; // epoch ms — drives the time scrub
};

export type RenderEdge = { from: string; to: string; weight: number };

type Sim = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
};

// Dusk palette (the map is always night).
const HUES: Record<string, [number, number, number]> = {
  WOUND: [128, 22, 52], // deep wine
  SHADOW: [104, 18, 48],
  CORE_BELIEF: [178, 74, 92], // rose
  PROTECTION: [183, 145, 117], // mocha
  PATTERN: [148, 110, 128], // dusty plum
  BEHAVIOR: [138, 118, 138],
  TRAIT: [186, 158, 122],
  RESOURCE: [212, 168, 96], // gold
  GIFT: [224, 184, 104],
};
const LOOSE_GOLD: [number, number, number] = [214, 172, 110]; // mocha-gold
const CREAM = "rgba(254,244,234,";

function rgba(c: [number, number, number], a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function blend(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function ConstellationMap({
  nodes,
  edges,
  visibleIds,
  selectedId,
  focusId,
  cutoff,
  onSelect,
}: {
  nodes: RenderNode[];
  edges: RenderEdge[];
  visibleIds: Set<string> | null; // lens filter; null = all
  selectedId: string | null;
  focusId: string | null; // search fly-to
  cutoff: number | null; // time scrub: hide nodes created after this epoch ms
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Map<string, Sim>>(new Map());
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ id: string | null; panning: boolean; sx: number; sy: number }>({
    id: null,
    panning: false,
    sx: 0,
    sy: 0,
  });
  const pinchRef = useRef<number | null>(null);
  const propsRef = useRef({ nodes, edges, visibleIds, selectedId, cutoff, onSelect });
  propsRef.current = { nodes, edges, visibleIds, selectedId, cutoff, onSelect };

  // Fly to a searched node.
  useEffect(() => {
    if (!focusId) return;
    const s = simRef.current.get(focusId);
    const wrap = wrapRef.current;
    if (!s || !wrap) return;
    const k = Math.max(viewRef.current.k, 1.1);
    viewRef.current = { k, x: wrap.clientWidth / 2 - s.x * k, y: wrap.clientHeight / 2 - s.y * k };
  }, [focusId]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = true;
    let tick = 0;

    function size() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = wrap!.clientWidth * dpr;
      canvas!.height = wrap!.clientHeight * dpr;
      canvas!.style.width = `${wrap!.clientWidth}px`;
      canvas!.style.height = `${wrap!.clientHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);

    // Seed positions: golden-angle spiral; the client's own star placement
    // (selfX/selfY ∈ 0..1) hints where a self-reported node begins.
    const W = () => wrap!.clientWidth;
    const H = () => wrap!.clientHeight;
    const sims = simRef.current;
    propsRef.current.nodes.forEach((n, i) => {
      if (sims.has(n.id)) return;
      const angle = i * 2.39996; // golden angle
      const rad = 40 + 26 * Math.sqrt(i);
      sims.set(n.id, {
        x: n.selfX != null ? n.selfX * W() : W() / 2 + Math.cos(angle) * rad,
        y: n.selfY != null ? n.selfY * H() : H() / 2 + Math.sin(angle) * rad,
        vx: 0,
        vy: 0,
        r: 7 + n.weight * 4.5,
        phase: (i * 137) % 100,
      });
    });
    if (viewRef.current.x === 0 && viewRef.current.y === 0 && viewRef.current.k === 1) {
      viewRef.current = { x: 0, y: 0, k: 1 };
    }

    const isShown = (n: RenderNode) => {
      const { visibleIds, cutoff } = propsRef.current;
      if (cutoff != null && n.createdAt > cutoff) return false;
      return true;
      void visibleIds;
    };
    const isLit = (n: RenderNode) => {
      const { visibleIds } = propsRef.current;
      return !visibleIds || visibleIds.has(n.id);
    };

    function step() {
      const { nodes, edges } = propsRef.current;
      const shown = nodes.filter(isShown);
      const byId = new Map(shown.map((n) => [n.id, n]));

      // Make sure every shown node has a sim (new nodes mid-session).
      shown.forEach((n, i) => {
        if (!sims.has(n.id)) {
          const angle = i * 2.39996;
          sims.set(n.id, {
            x: W() / 2 + Math.cos(angle) * 120,
            y: H() / 2 + Math.sin(angle) * 120,
            vx: 0,
            vy: 0,
            r: 7 + n.weight * 4.5,
            phase: (i * 137) % 100,
          });
        }
        sims.get(n.id)!.r = 7 + n.weight * 4.5;
      });

      // Physics — O(n²) repulsion is fine at this scale.
      const arr = shown.map((n) => ({ n, s: sims.get(n.id)! }));
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i].s;
          const b = arr[j].s;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            d2 = dx * dx + dy * dy;
          }
          const d = Math.sqrt(d2);
          const min = a.r + b.r + 26;
          const f = d < min ? (min - d) * 0.06 : 900 / d2;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      // Springs along edges: stronger connection → closer orbit (§1 proximity).
      for (const e of edges) {
        const fa = byId.get(e.from);
        const fb = byId.get(e.to);
        if (!fa || !fb) continue;
        const a = sims.get(e.from)!;
        const b = sims.get(e.to)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const rest = a.r + b.r + 46 + 90 / (0.6 + e.weight);
        const f = (d - rest) * 0.012;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      // Gravity: heavier bodies settle toward center — wounds as gravity wells.
      for (const { n, s } of arr) {
        const pull = 0.0015 * (0.6 + n.weight * 0.35);
        s.vx += (W() / 2 - s.x) * pull;
        s.vy += (H() / 2 - s.y) * pull;
        // Ambient drift, alive but never frantic.
        if (!reduceMotion) {
          s.vx += Math.sin(tick / 90 + s.phase) * 0.012;
          s.vy += Math.cos(tick / 110 + s.phase) * 0.012;
        }
        if (dragRef.current.id !== n.id) {
          s.vx *= 0.86;
          s.vy *= 0.86;
          s.x += s.vx;
          s.y += s.vy;
        }
      }
    }

    function draw() {
      const { nodes, edges, selectedId } = propsRef.current;
      const shown = nodes.filter(isShown);
      const shownIds = new Set(shown.map((n) => n.id));
      const view = viewRef.current;
      const hover = hoverRef.current;

      // Neighborhood highlight: hover (or selection) lights a node + neighbors.
      const focus = hover ?? selectedId;
      let hood: Set<string> | null = null;
      if (focus && shownIds.has(focus)) {
        hood = new Set([focus]);
        for (const e of edges) {
          if (e.from === focus) hood.add(e.to);
          if (e.to === focus) hood.add(e.from);
        }
      }

      ctx!.clearRect(0, 0, W(), H());
      ctx!.save();
      ctx!.translate(view.x, view.y);
      ctx!.scale(view.k, view.k);

      // Edges — hairlines of starlight.
      for (const e of edges) {
        if (!shownIds.has(e.from) || !shownIds.has(e.to)) continue;
        const a = sims.get(e.from);
        const b = sims.get(e.to);
        if (!a || !b) continue;
        const na = shown.find((n) => n.id === e.from)!;
        const nb = shown.find((n) => n.id === e.to)!;
        let alpha = 0.1 + Math.min(0.2, e.weight * 0.04);
        if (hood) alpha = hood.has(e.from) && hood.has(e.to) ? 0.42 : 0.03;
        if (!isLit(na) || !isLit(nb)) alpha = Math.min(alpha, 0.03);
        ctx!.strokeStyle = `${CREAM}${alpha})`;
        ctx!.lineWidth = 0.8;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

      // Nodes.
      for (const n of shown) {
        const s = sims.get(n.id)!;
        let dim = 1;
        if (hood && !hood.has(n.id)) dim = 0.14;
        if (!isLit(n)) dim = Math.min(dim, 0.1);

        let hue = HUES[n.kind] ?? HUES.PATTERN;
        let r = s.r;
        let glow = n.glow;
        if (n.state === "LOOSENING") {
          hue = blend(hue, LOOSE_GOLD, 0.55); // softening toward mocha-gold
          glow *= 0.8;
        } else if (n.state === "INTEGRATED") {
          hue = LOOSE_GOLD;
          r = Math.min(r, 10); // a warm, small, steady light
          glow = 0.5;
        }

        // Halo (recency glow — light, not mass).
        const halo = ctx!.createRadialGradient(s.x, s.y, r * 0.4, s.x, s.y, r * (2.2 + glow * 1.6));
        halo.addColorStop(0, rgba(hue, 0.5 * glow * dim));
        halo.addColorStop(1, rgba(hue, 0));
        ctx!.fillStyle = halo;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r * (2.2 + glow * 1.6), 0, Math.PI * 2);
        ctx!.fill();

        // Body.
        const body = ctx!.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, r * 0.1, s.x, s.y, r);
        body.addColorStop(0, rgba(blend(hue, [254, 244, 234], 0.28), 0.95 * dim));
        body.addColorStop(1, rgba(hue, 0.9 * dim));
        ctx!.fillStyle = body;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx!.fill();

        // Self-reported: the client's own awareness — a gold ring.
        if (n.source === "SELF_REPORTED") {
          ctx!.strokeStyle = rgba([224, 184, 104], 0.9 * dim);
          ctx!.lineWidth = 1.6;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, r + 3.5, 0, Math.PI * 2);
          ctx!.stroke();
        }
        // A pending AI suggestion: quiet dashed ring.
        if (n.hasSuggestion) {
          ctx!.setLineDash([3, 4]);
          ctx!.strokeStyle = rgba(LOOSE_GOLD, 0.8 * dim);
          ctx!.lineWidth = 1.2;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, r + 7, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.setLineDash([]);
        }
        // Selection.
        if (selectedId === n.id) {
          ctx!.strokeStyle = `${CREAM}0.9)`;
          ctx!.lineWidth = 1.4;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, r + 5.5, 0, Math.PI * 2);
          ctx!.stroke();
        }

        // Label — hide small-node labels when zoomed out.
        if (view.k > 0.55 || n.weight > 2.4) {
          ctx!.font = "11px Inter, system-ui, sans-serif";
          ctx!.textAlign = "center";
          ctx!.fillStyle = `${CREAM}${(0.75 * dim).toFixed(2)})`;
          const label = n.label.length > 28 ? `${n.label.slice(0, 28)}…` : n.label;
          ctx!.fillText(label, s.x, s.y + r + 14);
        }
      }
      ctx!.restore();
    }

    function loop() {
      if (!running) return;
      tick++;
      step();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    // ---- interactions ----
    const toWorld = (cx: number, cy: number) => {
      const v = viewRef.current;
      const rect = canvas!.getBoundingClientRect();
      return { x: (cx - rect.left - v.x) / v.k, y: (cy - rect.top - v.y) / v.k };
    };
    const hit = (cx: number, cy: number): string | null => {
      const p = toWorld(cx, cy);
      let best: string | null = null;
      let bestD = Infinity;
      for (const n of propsRef.current.nodes.filter(isShown)) {
        const s = sims.get(n.id);
        if (!s) continue;
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < s.r + 8 && d < bestD) {
          best = n.id;
          bestD = d;
        }
      }
      return best;
    };

    function onPointerDown(e: PointerEvent) {
      canvas!.setPointerCapture(e.pointerId);
      const id = hit(e.clientX, e.clientY);
      dragRef.current = { id, panning: !id, sx: e.clientX, sy: e.clientY };
    }
    function onPointerMove(e: PointerEvent) {
      const d = dragRef.current;
      if (d.id) {
        const p = toWorld(e.clientX, e.clientY);
        const s = sims.get(d.id);
        if (s) {
          s.x = p.x;
          s.y = p.y;
          s.vx = 0;
          s.vy = 0;
        }
      } else if (d.panning && (e.buttons & 1) === 1) {
        viewRef.current.x += e.clientX - d.sx;
        viewRef.current.y += e.clientY - d.sy;
        d.sx = e.clientX;
        d.sy = e.clientY;
      } else {
        hoverRef.current = hit(e.clientX, e.clientY);
        canvas!.style.cursor = hoverRef.current ? "pointer" : "grab";
      }
    }
    function onPointerUp(e: PointerEvent) {
      const d = dragRef.current;
      const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6;
      if (d.id && !moved) propsRef.current.onSelect(d.id);
      else if (!d.id && !moved) propsRef.current.onSelect(null);
      dragRef.current = { id: null, panning: false, sx: 0, sy: 0 };
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const k = Math.min(3.5, Math.max(0.3, v.k * factor));
      const rect = canvas!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      v.x = mx - ((mx - v.x) / v.k) * k;
      v.y = my - ((my - v.y) / v.k) * k;
      v.k = k;
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (pinchRef.current != null) {
          const v = viewRef.current;
          const k = Math.min(3.5, Math.max(0.3, v.k * (d / pinchRef.current)));
          const rect = canvas!.getBoundingClientRect();
          const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          v.x = mx - ((mx - v.x) / v.k) * k;
          v.y = my - ((my - v.y) / v.k) * k;
          v.k = k;
        }
        pinchRef.current = d;
      }
    }
    function onTouchEnd() {
      pinchRef.current = null;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative h-[62vh] min-h-[420px] w-full overflow-hidden rounded-card border border-white/10 md:h-[68vh]"
      style={{ background: "radial-gradient(ellipse at 50% 38%, #241820 0%, #191114 70%)" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
    </div>
  );
}
