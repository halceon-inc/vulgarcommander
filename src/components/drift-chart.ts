import type { RingSeries, RingYear } from "../lib/firms-db";
import { rampLegend } from "./ramp-legend";

const NS = "http://www.w3.org/2000/svg";
const SEQ = ["#3a2115", "#572a16", "#783517", "#9c431a", "#c1541f", "#e06a31", "#ef8d58", "#f6b28a", "#fbd9c2"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

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

function clamp(value: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, value));
}

function full(n: number) {
	return Math.round(n).toLocaleString("en-US");
}

function compact(n: number) {
	const value = Math.round(n);
	const short = (v: number) => v.toFixed(1).replace(/\.0$/, "");
	if (value >= 1_000_000) return `${short(value / 1_000_000)}M`;
	if (value >= 10_000) return `${Math.round(value / 1000)}k`;
	if (value >= 1000) return `${short(value / 1000)}k`;
	return String(value);
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

function seasonColor(total: number, min: number, max: number) {
	const lo = Math.sqrt(min);
	const hi = Math.sqrt(max);
	const t = hi === lo ? 1 : (Math.sqrt(total) - lo) / (hi - lo);
	return lerp(SEQ, 0.12 + 0.88 * t);
}

function doyLabel(day: number) {
	const d = clamp(Math.round(day), 1, 365);
	let month = 0;
	while (month < 11 && d >= MONTH_START[month + 1]) month += 1;
	return `${MONTHS[month]} ${d - MONTH_START[month] + 1}`;
}

function weekDay(week: number) {
	return Math.min(365, (week + 1) * 7);
}

function cumulative(year: RingYear) {
	const values: number[] = [];
	let total = 0;
	for (const value of year.weeks) {
		total += value ?? 0;
		values.push(total);
	}
	return { total, values };
}

function quantileDay(values: number[], total: number, p: number) {
	if (total <= 0) return null;
	const target = total * p;
	for (let week = 0; week < values.length; week++) {
		if (values[week] >= target) return weekDay(week);
	}
	return weekDay(values.length - 1);
}

function ols(xs: number[], ys: number[]) {
	const n = xs.length;
	let mx = 0;
	let my = 0;
	for (let i = 0; i < n; i++) {
		mx += xs[i];
		my += ys[i];
	}
	mx /= n;
	my /= n;
	let sxy = 0;
	let sxx = 0;
	for (let i = 0; i < n; i++) {
		sxy += (xs[i] - mx) * (ys[i] - my);
		sxx += (xs[i] - mx) * (xs[i] - mx);
	}
	const slope = sxx === 0 ? 0 : sxy / sxx;
	return { a: my - slope * mx, b: slope };
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

function ratePhrase(days: number, edge: "start" | "end") {
	const amount = `${Math.abs(days).toFixed(1)} days every 10 years`;
	if (Math.abs(days) < 0.05) return `the ${edge} held steady`;
	if (days < 0) return `the ${edge} moved earlier by <b>${amount}</b>`;
	return `the ${edge} moved later by <b>${amount}</b>`;
}

export function drawDrift(host: HTMLElement, series: RingSeries, tip: HTMLElement, legend: HTMLElement, readout: HTMLElement) {
	host.replaceChildren();
	tip.hidden = true;

	const years = series.years.filter((year) => year.weeks.every((value) => value != null));
	if (!years.length) {
		host.dataset.state = "empty";
		host.textContent = "No full year in the archive";
		readout.replaceChildren();
		legend.replaceChildren();
		return;
	}

	host.dataset.state = "ready";
	const rows = years.map((year) => {
		const cum = cumulative(year);
		return {
			year: year.year,
			total: cum.total,
			q10: quantileDay(cum.values, cum.total, 0.1),
			q25: quantileDay(cum.values, cum.total, 0.25),
			q50: quantileDay(cum.values, cum.total, 0.5),
			q75: quantileDay(cum.values, cum.total, 0.75),
			q90: quantileDay(cum.values, cum.total, 0.9),
		};
	});
	const burned = rows.filter((row) => row.total > 0 && row.q10 != null && row.q90 != null && row.q50 != null);
	const totals = burned.map((row) => row.total);
	const minTotal = totals.length ? Math.min(...totals) : 0;
	const maxTotal = totals.length ? Math.max(...totals) : 0;

	const width = 900;
	const rowH = 15;
	const top = 24;
	const left = 58;
	const right = 18;
	const height = top + rowH * rows.length + 54;
	const plotW = width - left - right;
	const xOf = (day: number) => left + ((clamp(day, 1, 365) - 1) / 364) * plotW;

	const svg = el(host, "svg", {
		viewBox: `0 0 ${width} ${height}`,
		role: "img",
		"aria-label": "Span of each fire season, from the week 10 percent of fire days were reached to the week 90 percent were reached, within 100 miles.",
	});

	for (let month = 0; month < 12; month++) {
		const x = xOf(MONTH_START[month]);
		el(svg, "line", { x1: x, x2: x, y1: top - 6, y2: top + rowH * rows.length, class: "drift-hair" });
		text(svg, MONTHS[month], { x: x + 3, y: 14, class: "drift-label" });
	}

	const marks = el(svg, "g", {});
	rows.forEach((row, i) => {
		const y = top + i * rowH + rowH / 2;
		text(svg, String(row.year), { x: left - 8, y: y + 3.5, class: "drift-year", "text-anchor": "end" });
		if (row.q10 == null || row.q90 == null || row.q25 == null || row.q75 == null || row.q50 == null) {
			text(svg, "no fire days", { x: left + plotW / 2, y: y + 3.5, class: "drift-label", "text-anchor": "middle" });
			return;
		}
		const color = seasonColor(row.total, minTotal, maxTotal);
		el(marks, "rect", {
			x: xOf(row.q10),
			y: y - 1.5,
			width: Math.max(1.5, xOf(row.q90) - xOf(row.q10)),
			height: 3,
			rx: 1.5,
			fill: color,
			class: "drift-bar",
			style: `--i:${i}`,
		});
		el(marks, "rect", {
			x: xOf(row.q25),
			y: y - 4.5,
			width: Math.max(1.5, xOf(row.q75) - xOf(row.q25)),
			height: 9,
			rx: 2,
			fill: color,
			class: "drift-bar",
			style: `--i:${i}`,
		});
		el(marks, "line", { x1: xOf(row.q50), x2: xOf(row.q50), y1: y - 5.5, y2: y + 5.5, class: "drift-tick", style: `--i:${i}` });
		el(marks, "rect", {
			x: left,
			y: top + i * rowH,
			width: plotW,
			height: rowH,
			fill: "transparent",
			"data-i": i,
		});
	});

	const fitRows = burned.filter((row): row is typeof row & { q10: number; q50: number; q90: number } => row.q10 != null && row.q50 != null && row.q90 != null);
	let startRate = 0;
	let endRate = 0;
	if (fitRows.length >= 2) {
		const xs = fitRows.map((row) => row.year - years[0].year);
		const start = ols(xs, fitRows.map((row) => row.q10));
		const end = ols(xs, fitRows.map((row) => row.q90));
		startRate = start.b * 10;
		endRate = end.b * 10;
		const first = fitRows[0];
		const last = fitRows[fitRows.length - 1];
		const y0 = top + rows.findIndex((row) => row.year === first.year) * rowH + rowH / 2;
		const y1 = top + rows.findIndex((row) => row.year === last.year) * rowH + rowH / 2;
		const dayAt = (fit: { a: number; b: number }, year: number) => fit.a + fit.b * (year - years[0].year);
		el(svg, "path", {
			d: `M${xOf(dayAt(start, first.year))} ${y0}L${xOf(dayAt(start, last.year))} ${y1}`,
			class: "drift-trend",
		});
		el(svg, "path", {
			d: `M${xOf(dayAt(end, first.year))} ${y0}L${xOf(dayAt(end, last.year))} ${y1}`,
			class: "drift-trend",
		});
		const labelY = top + rowH * rows.length + 16;
		const startX = Math.max(xOf(dayAt(start, last.year)), left + 118);
		const endX = Math.min(xOf(dayAt(end, last.year)), left + plotW - 118);
		const crowded = endX - startX < 40;
		text(svg, "Season start", {
			x: crowded ? left : startX,
			y: labelY,
			class: "drift-label ink",
			"text-anchor": crowded ? "start" : "end",
		});
		text(svg, `${startRate < 0 ? "−" : "+"}${Math.abs(startRate).toFixed(1)} days per 10 yrs`, {
			x: crowded ? left : startX,
			y: labelY + 13,
			class: "drift-year",
			"text-anchor": crowded ? "start" : "end",
		});
		text(svg, "Season end", {
			x: crowded ? left + plotW : endX,
			y: labelY,
			class: "drift-label ink",
			"text-anchor": crowded ? "end" : "start",
		});
		text(svg, `${endRate < 0 ? "−" : "+"}${Math.abs(endRate).toFixed(1)} days per 10 yrs`, {
			x: crowded ? left + plotW : endX,
			y: labelY + 13,
			class: "drift-year",
			"text-anchor": crowded ? "end" : "start",
		});
	}

	marks.addEventListener("pointermove", (event) => {
		const target = event.target;
		if (!(target instanceof SVGElement) || target.dataset.i == null || !(event instanceof PointerEvent)) return;
		const row = rows[Number(target.dataset.i)];
		if (row.q10 == null || row.q50 == null || row.q90 == null) return;
		tip.innerHTML = `<b>${row.year}</b> · ${full(row.total)} fire days<br>10% by ${doyLabel(row.q10)}<br>Half by ${doyLabel(row.q50)}<br>90% by ${doyLabel(row.q90)}<br>${row.q90 - row.q10} days from start to end`;
		tip.hidden = false;
		placeTip(tip, event);
	});
	marks.addEventListener("pointerleave", () => {
		tip.hidden = true;
	});

	if (fitRows.length >= 2) {
		const first = years[0].year;
		const last = years[years.length - 1].year;
		readout.innerHTML = `From ${first} to ${last}, ${ratePhrase(startRate, "start")} and ${ratePhrase(endRate, "end")}.`;
	} else {
		readout.textContent = "Too few years with fire to read a shift.";
	}

	legend.innerHTML = [
		`<span><i class="sw thin"></i>Main fire season (middle 80% of fires)</span>`,
		`<span><i class="sw core"></i>Peak (middle half)</span>`,
		`<span><i class="sw tick"></i>Date half the year's fires had happened</span>`,
		`<span><i class="sw dash"></i>Trend over the years</span>`,
		burned.length
			? rampLegend("Year total", (t) => lerp(SEQ, 0.12 + 0.88 * t), compact(minTotal), compact(maxTotal), 80)
			: "",
	].join("");
}
