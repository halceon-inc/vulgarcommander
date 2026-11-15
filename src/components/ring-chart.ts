import type { RingSeries } from "../lib/firms-db";
import { rampLegend } from "./ramp-legend";

const NS = "http://www.w3.org/2000/svg";
const SEQ = ["#3a2115", "#572a16", "#783517", "#9c431a", "#c1541f", "#e06a31", "#ef8d58", "#f6b28a", "#fbd9c2"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const GAP = (16 * Math.PI) / 180;

function el(parent: Element, tag: string, attrs: Record<string, string | number>) {
	const node = document.createElementNS(NS, tag);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
	parent.appendChild(node);
	return node;
}

function text(parent: Element, value: string, attrs: Record<string, string | number>) {
	const node = el(parent, "text", attrs);
	node.textContent = value;
	return node;
}

function hexRgb(h: string) {
	return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function lerp(stops: string[], t: number) {
	const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(scaled));
	const f = scaled - i;
	const a = hexRgb(stops[i]);
	const b = hexRgb(stops[i + 1]);
	return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

function seqColor(value: number, max: number) {
	if (max <= 0) return SEQ[SEQ.length - 1];
	return lerp(SEQ, Math.log1p(value) / Math.log1p(max));
}

function ang(week: number) {
	return -Math.PI / 2 + GAP / 2 + (week / 52) * (2 * Math.PI - GAP);
}

function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
	const c0 = Math.cos(a0);
	const s0 = Math.sin(a0);
	const c1 = Math.cos(a1);
	const s1 = Math.sin(a1);
	const large = a1 - a0 > Math.PI ? 1 : 0;
	return `M${(cx + r1 * c0).toFixed(2)} ${(cy + r1 * s0).toFixed(2)}A${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${large} 1 ${(cx + r1 * c1).toFixed(2)} ${(cy + r1 * s1).toFixed(2)}L${(cx + r0 * c1).toFixed(2)} ${(cy + r0 * s1).toFixed(2)}A${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${large} 0 ${(cx + r0 * c0).toFixed(2)} ${(cy + r0 * s0).toFixed(2)}Z`;
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
	return `M${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}`;
}

function placeTip(tip: HTMLElement, event: PointerEvent) {
	const width = tip.offsetWidth;
	const height = tip.offsetHeight;
	let x = event.clientX + 14;
	let y = event.clientY + 14;
	if (x + width > window.innerWidth - 8) x = event.clientX - width - 14;
	if (y + height > window.innerHeight - 8) y = event.clientY - height - 14;
	tip.style.left = `${Math.max(4, x)}px`;
	tip.style.top = `${Math.max(4, y)}px`;
}

const SIZE = 620;

function full(n: number) {
	return Math.round(n).toLocaleString("en-US");
}

function monthOfWeek(week: number) {
	const day = Math.min(365, week * 7 + 4);
	let month = 0;
	while (month < 11 && day >= MONTH_START[month + 1]) month += 1;
	return MONTHS[month];
}

export function drawRingLegend(legend: HTMLElement, maxWeek: number) {
	const max = Math.max(maxWeek, 1);
	const t0 = Math.log1p(1) / Math.log1p(max);
	const ramp = rampLegend("Fire days per week", (t) => lerp(SEQ, t0 + (1 - t0) * t), "1", full(max));
	legend.innerHTML = `${ramp}<span><i class="sw zero"></i>None</span><span><i class="sw pending"></i>Not in the archive</span><span><i class="sw era"></i>Suomi-NPP joins, 2012</span><span>Years are marked in the gap at the top</span>`;
}

function ringReadout(readout: HTMLElement, series: RingSeries) {
	const complete = series.years.filter((year) => year.weeks.every((value) => value != null));
	if (!complete.length) {
		readout.textContent = "No full year in the archive yet.";
		return;
	}
	const weekly = Array.from({ length: 52 }, (_, week) => complete.reduce((sum, year) => sum + (year.weeks[week] ?? 0), 0) / complete.length);
	const total = weekly.reduce((sum, value) => sum + value, 0);
	if (total <= 0) {
		readout.textContent = `No fire days within 100 miles from ${complete[0].year} to ${complete[complete.length - 1].year}.`;
		return;
	}
	let running = 0;
	let q25 = -1;
	let q75 = -1;
	weekly.forEach((value, week) => {
		running += value;
		if (q25 < 0 && running >= total * 0.25) q25 = week;
		if (q75 < 0 && running >= total * 0.75) q75 = week;
	});
	const from = monthOfWeek(q25);
	const to = monthOfWeek(q75);
	const span = from === to ? `in <b>${from}</b>` : `between <b>${from}</b> and <b>${to}</b>`;
	readout.innerHTML = `On average this area logs <b>${full(total)}</b> fire days a year. Half of them fall ${span}.`;
}

export function drawRingChart(host: HTMLElement, series: RingSeries, tip: HTMLElement, legend?: HTMLElement, readout?: HTMLElement) {
	host.replaceChildren();
	host.dataset.state = "ready";
	if (legend) drawRingLegend(legend, series.maxWeek);
	if (readout) ringReadout(readout, series);

	const size = SIZE;
	const cx = size / 2;
	const cy = size / 2;
	const outer = size / 2 - 24;
	const inner = size * 0.135;
	const totals = series.years.map((year) =>
		year.weeks.reduce<number>((sum, value) => sum + (value ?? 0), 0),
	);
	const maxTotal = Math.max(series.maxTotal, 1);
	const weights = totals.map((total) => 0.42 + Math.sqrt(total / maxTotal));
	const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
	let radius = inner;
	const rings = weights.map((weight) => {
		const thickness = (weight / weightSum) * (outer - inner);
		const ring = { r0: radius, r1: radius + thickness };
		radius += thickness;
		return ring;
	});

	const svg = el(host, "svg", {
		viewBox: `0 0 ${size} ${size}`,
		width: "100%",
		height: "100%",
		role: "img",
		"aria-label": "Fire-scar rings within 100 miles. One ring per year, January at the top. Ring width follows the year's fire days.",
	});
	svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

	const cells = el(svg, "g", {});
	series.years.forEach((year, i) => {
		const ring = rings[i];
		for (let week = 0; week < 52; week++) {
			const value = year.weeks[week];
			const path = el(cells, "path", {
				d: sector(
					cx,
					cy,
					ring.r0 + 0.4,
					ring.r1 - 0.4,
					ang(week),
					ang(week + 1) + (week < 51 ? 0.004 : 0),
				),
				"data-i": i,
				"data-w": week,
			});
			if (value == null) path.setAttribute("class", "ring-pending");
			else if (value === 0) path.setAttribute("class", "ring-zero");
			else path.setAttribute("fill", seqColor(value, series.maxWeek));
		}
	});

	const viirs = series.years.findIndex((year) => year.year === 2012);
	if (viirs >= 0) {
		el(svg, "path", {
			d: arc(cx, cy, rings[viirs].r0, ang(0), ang(52)),
			class: "ring-era",
		});
	}

	for (let month = 0; month < 12; month++) {
		const a = ang((MONTH_START[month] - 1) / 7);
		el(svg, "line", {
			x1: cx + (outer + 3) * Math.cos(a),
			y1: cy + (outer + 3) * Math.sin(a),
			x2: cx + (outer + 8) * Math.cos(a),
			y2: cy + (outer + 8) * Math.sin(a),
			class: "ring-tick",
		});
		const label = ang((MONTH_START[month] + 14) / 7);
		text(svg, MONTHS[month], {
			x: cx + (outer + 16) * Math.cos(label),
			y: cy + (outer + 16) * Math.sin(label) + 4,
			class: "ring-month",
			"text-anchor": "middle",
			"font-size": 13,
		});
	}

	series.years.forEach((year, i) => {
		if (year.year % 5 !== 0) return;
		const ring = rings[i];
		text(svg, String(year.year).slice(2), {
			x: cx,
			y: cy - (ring.r0 + ring.r1) / 2 + 4,
			class: "ring-year",
			"text-anchor": "middle",
			"font-size": 11,
		});
	});

	el(svg, "circle", { cx, cy, r: inner - 6, class: "ring-core" });
	const title = text(svg, "", {
		x: cx,
		y: cy - 2,
		class: "ring-read",
		"text-anchor": "middle",
		"font-size": 20,
	});
	const detail = text(svg, "", {
		x: cx,
		y: cy + 17,
		class: "ring-sub",
		"text-anchor": "middle",
		"font-size": 11.5,
	});

	const complete = totals.filter((_, i) => series.years[i].weeks.every((value) => value != null));
	const mean = complete.length ? complete.reduce((sum, total) => sum + total, 0) / complete.length : 0;
	const first = series.years[0];
	const last = [...series.years].reverse().find((year) => year.weeks.every((value) => value != null));

	function rest() {
		title.textContent = first && last ? `${first.year}–${String(last.year).slice(2)}` : "";
		detail.textContent = `${mean >= 10 ? full(mean) : mean.toFixed(1)} fire days a year`;
	}
	rest();

	const highlight = el(svg, "path", { class: "ring-hl", d: "" });

	cells.addEventListener("pointermove", (event) => {
		const target = event.target;
		if (!(target instanceof SVGElement) || target.dataset.i == null || !(event instanceof PointerEvent)) return;
		const i = Number(target.dataset.i);
		const week = Number(target.dataset.w);
		const year = series.years[i];
		const ring = rings[i];
		const value = year.weeks[week];
		highlight.setAttribute("d", sector(cx, cy, ring.r0, ring.r1, ang(0), ang(52)));
		title.textContent = String(year.year);
		detail.textContent = value == null ? "no record" : `week ${week + 1} · ${value === 1 ? "1 day" : `${value} days`}`;
		const count = value == null ? "Not in the archive" : value === 0 ? "No fire days" : value === 1 ? "1 fire day" : `${value} fire days`;
		tip.innerHTML = `<b>${year.year}</b> · week ${week + 1}<br>${count}<br>Year total <b>${full(totals[i])}</b>`;
		tip.hidden = false;
		placeTip(tip, event);
	});

	cells.addEventListener("pointerleave", () => {
		highlight.setAttribute("d", "");
		rest();
		tip.hidden = true;
	});
}

export function clearRingTip(tip: HTMLElement) {
	tip.hidden = true;
	tip.replaceChildren();
}
