import { niceTicks } from './Stats';

/**
 * The analytics screens' charts, in plain SVG — the dataviz rules: one axis, 2px lines with
 * ringed end-dots, bars ≤ 24px with a 4px rounded end and a square base, hairline recessive
 * grid, a legend for two or more series, text in text colours (never the series colour),
 * and a hover / keyboard layer — a crosshair + one tooltip for every series on lines, a
 * per-bar tooltip on bars. All text goes in with textContent.
 */

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 220;
const PAD = { left: 44, right: 16, top: 12, bottom: 26 };

export interface Series {
  name: string;
  /** A CSS colour (a categorical slot's custom property). */
  color: string;
  values: number[];
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

function frame(ticks: number[], top: number, format: (n: number) => string, root: SVGSVGElement) {
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  for (const t of ticks) {
    root.appendChild(
      svg('line', {
        x1: PAD.left,
        x2: W - PAD.right,
        y1: y(t),
        y2: y(t),
        class: t === 0 ? 'chart-base' : 'chart-grid',
      })
    );
    const label = svg('text', {
      x: PAD.left - 8,
      y: y(t) + 4,
      'text-anchor': 'end',
      class: 'chart-tick',
    });
    label.textContent = format(t);
    root.appendChild(label);
  }
  return y;
}

function xLabels(labels: string[], x: (i: number) => number, root: SVGSVGElement) {
  // Five or so labels along the bottom; the tooltip names every day.
  const every = Math.max(1, Math.ceil(labels.length / 6));
  labels.forEach((text, i) => {
    if (i % every !== 0 && i !== labels.length - 1) return;
    // The ends hug the plot's edges so they are never clipped.
    const anchor = i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle';
    const label = svg('text', { x: x(i), y: H - 8, 'text-anchor': anchor, class: 'chart-tick' });
    label.textContent = text;
    root.appendChild(label);
  });
}

function tooltip(box: HTMLElement): HTMLDivElement {
  const tip = div('chart-tip');
  tip.hidden = true;
  box.appendChild(tip);
  return tip;
}

/** Places the tooltip next to x (0…W in chart units) inside the box. */
function place(tip: HTMLDivElement, box: HTMLElement, xUnits: number) {
  const width = box.clientWidth || W;
  const px = (xUnits / W) * width;
  tip.style.left = `${Math.min(Math.max(px + 12, 0), width - tip.offsetWidth - 4)}px`;
  if (px + 12 + tip.offsetWidth > width)
    tip.style.left = `${Math.max(px - tip.offsetWidth - 12, 0)}px`;
}

function tipRow(value: string, name: string, color?: string): HTMLDivElement {
  const row = div('chart-tip-row');
  if (color) {
    const key = div('chart-tip-key');
    key.style.background = color;
    row.appendChild(key);
  }
  const v = document.createElement('strong');
  v.textContent = value;
  row.append(v, document.createTextNode(` ${name}`));
  return row;
}

function legend(series: Series[], mark: 'line' | 'rect'): HTMLDivElement {
  const box = div('chart-legend');
  for (const s of series) {
    const item = div('chart-legend-item');
    const key = div(mark === 'line' ? 'chart-legend-line' : 'chart-legend-rect');
    key.style.background = s.color;
    item.append(key, document.createTextNode(s.name));
    box.appendChild(item);
  }
  return box;
}

/** A line per series over the same x labels (one unit: one axis). */
export function lineChart(
  title: string,
  labels: string[],
  series: Series[],
  format: (n: number) => string
): HTMLElement {
  const card = div('chart-card');
  card.appendChild(div('chart-title', title));
  if (series.length > 1) card.appendChild(legend(series, 'line'));
  const box = div('chart-box');
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: 0 });
  root.setAttribute('aria-label', `${title}: ${series.map(s => s.name).join(', ')}`);
  const max = Math.max(0, ...series.flatMap(s => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = frame(ticks, top, format, root);
  const n = labels.length;
  const x = (i: number) => PAD.left + (n <= 1 ? 0.5 : i / (n - 1)) * (W - PAD.left - PAD.right);
  xLabels(labels, x, root);

  for (const s of series) {
    root.appendChild(
      svg('path', {
        d: s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''),
        fill: 'none',
        stroke: s.color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    );
    const last = s.values.length - 1;
    if (last >= 0)
      root.appendChild(
        svg('circle', {
          cx: x(last),
          cy: y(s.values[last]),
          r: 4,
          fill: s.color,
          class: 'chart-dot',
        })
      );
  }

  const cross = svg('line', {
    y1: PAD.top,
    y2: H - PAD.bottom,
    class: 'chart-cross',
    visibility: 'hidden',
  });
  root.appendChild(cross);
  box.appendChild(root);
  const tip = tooltip(box);
  let shown = -1;
  const show = (i: number) => {
    shown = Math.max(0, Math.min(n - 1, i));
    cross.setAttribute('x1', String(x(shown)));
    cross.setAttribute('x2', String(x(shown)));
    cross.setAttribute('visibility', 'visible');
    tip.replaceChildren(
      div('chart-tip-head', labels[shown]),
      ...series.map(s => tipRow(format(s.values[shown]), s.name, s.color))
    );
    tip.hidden = false;
    place(tip, box, x(shown));
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  root.addEventListener('pointermove', e => {
    const rect = root.getBoundingClientRect();
    const units = ((e.clientX - rect.left) / rect.width) * W;
    show(Math.round(((units - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1)));
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('blur', hide);
  root.addEventListener('focus', () => show(n - 1));
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') show(shown - 1);
    else if (e.key === 'ArrowRight') show(shown + 1);
  });
  card.appendChild(box);
  return card;
}

/** One column per x label, one series (the title names it). */
export function barChart(
  title: string,
  labels: string[],
  values: number[],
  color: string,
  format: (n: number) => string
): HTMLElement {
  const card = div('chart-card');
  card.appendChild(div('chart-title', title));
  const box = div('chart-box');
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  root.setAttribute('aria-label', title);
  const ticks = niceTicks(Math.max(0, ...values));
  const y = frame(ticks, ticks[ticks.length - 1], format, root);
  const n = labels.length;
  const slot = (W - PAD.left - PAD.right) / Math.max(1, n);
  const width = Math.min(24, Math.max(2, slot - 2));
  const x = (i: number) => PAD.left + slot * (i + 0.5);
  xLabels(labels, x, root);
  const tip = tooltip(box);
  values.forEach((v, i) => {
    const top = y(v);
    const base = y(0);
    const h = base - top;
    if (h > 0) {
      const r = Math.min(4, h, width / 2);
      const l = x(i) - width / 2;
      root.appendChild(
        svg('path', {
          // A 4px rounded data end, square at the baseline.
          d: `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${l + width - r}Q${l + width},${top} ${l + width},${top + r}V${base}Z`,
          fill: color,
          class: 'chart-bar',
        })
      );
    }
    // The hit target: the whole slot, not the painted pixels.
    const hit = svg('rect', {
      x: PAD.left + slot * i,
      y: PAD.top,
      width: slot,
      height: H - PAD.top - PAD.bottom,
      fill: 'transparent',
      tabindex: 0,
    });
    const show = () => {
      tip.replaceChildren(div('chart-tip-head', labels[i]), tipRow(format(v), title));
      tip.hidden = false;
      place(tip, box, x(i));
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', () => (tip.hidden = true));
    hit.addEventListener('blur', () => (tip.hidden = true));
    root.appendChild(hit);
  });
  box.prepend(root);
  card.appendChild(box);
  return card;
}

/** Ranked horizontal bars (a funnel, a top list): the name, the bar, the value at its tip. */
export function barList(
  title: string,
  items: { name: string; value: number; note?: string }[],
  color: string,
  format: (n: number) => string,
  empty: string
): HTMLElement {
  const card = div('chart-card');
  card.appendChild(div('chart-title', title));
  if (items.length === 0) {
    card.appendChild(div('chart-empty', empty));
    return card;
  }
  const max = Math.max(...items.map(i => i.value), 1);
  for (const item of items) {
    const row = div('chart-row');
    row.title = `${item.name}: ${format(item.value)}${item.note ? ` · ${item.note}` : ''}`;
    row.appendChild(div('chart-row-name', item.name));
    const track = div('chart-row-track');
    const bar = div('chart-row-bar');
    bar.style.width = `${Math.max(1, (item.value / max) * 100)}%`;
    bar.style.background = color;
    track.appendChild(bar);
    row.appendChild(track);
    row.appendChild(
      div(
        'chart-row-value',
        item.note ? `${format(item.value)} · ${item.note}` : format(item.value)
      )
    );
    card.appendChild(row);
  }
  return card;
}
