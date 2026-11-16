import type { RingSeries, RingYear } from "../lib/firms-db";
import { rampLegend } from "./ramp-legend";

const NS = "http://www.w3.org/2000/svg";
const SEQ = ["#3a2115", "#572a16", "#783517", "#9c431a", "#c1541f", "#e06a31", "#ef8d58", "#f6b28a", "#fbd9c2"];
const DIV = ["#9ec5f4", "#5598e7", "#256abf", "#1b4577", "#353d42", "#703030", "#b44040", "#e66767", "#f6aaa7"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

export type CalendarMode = "count" | "departure";

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

function fmt(n: number) {
	return Math.round(n).toLocaleString("en-US");
}

function ordinal(n: number) {
	const suffix = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`;
}

function yearTotal(year: RingYear) {
	return year.weeks.reduce<number>((sum, value) => sum + (value ?? 0), 0);
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

function rampSvg(stops: string[], width: number) {
	const rects = Array.from({ length: 40 }, (_, i) => {
		const x = (i * width) / 40;
		return `<rect x="${x.toFixed(2)}" y="0" width="${(width / 40 + 0.6).toFixed(2)}" height="10" fill="${lerp(stops, i / 39)}"/>`;
	}).join("");
	return `<svg width="${width}" height="10" aria-hidden="true">${rects}</svg>`;
}

function countLegend(maxWeek: number) {
	const max = Math.max(maxWeek, 1);
	const t0 = Math.log1p(1) / Math.log1p(max);
	return rampLegend("Fire days per week", (t) => lerp(SEQ, t0 + (1 - t0) * t), "1", fmt(max));
}

function doyLabel(week: number) {
	const day = Math.min(365, week * 7 + 4);
	let month = 0;
	while (month < 11 && day >= MONTH_START[month + 1]) month += 1;
	return `${MONTHS[month]} ${day - MONTH_START[month] + 1}`;
}

export function drawCalendar(
	host: HTMLElement,
	series: RingSeries,
	tip: HTMLElement,
	legend: HTMLElement,
	table: HTMLElement,
	mode: CalendarMode,
	readout: HTMLElement,
) {
	host.replaceChildren();
	host.dataset.state = "ready";

	const years = series.years;
	const totals = years.map(yearTotal);
	const complete = years.filter((year) => year.weeks.every((value) => value != null));
	const clim = Array.from({ length: 52 }, (_, week) => {
		if (!complete.length) return 0;
		const sum = complete.reduce((total, year) => total + (year.weeks[week] ?? 0), 0);
		return sum / complete.length;
	});
	const maxClim = Math.max(...clim, 0);

	function percentile(year: RingYear, week: number) {
		const value = year.weeks[week];
		if (value == null) return null;
		let less = 0;
		let same = 0;
		let n = 0;
		let max = 0;
		for (const other of complete) {
			if (other === year) continue;
			const sample = other.weeks[week];
			if (sample == null) continue;
			n += 1;
			if (sample > max) max = sample;
			if (sample < value) less += 1;
			else if (sample === value) same += 1;
		}
		if (!n || (value === 0 && max === 0)) return null;
		return (less + 0.5 * same) / n;
	}

	const width = 960;
	const left = 86;
	const right = 176;
	const top = 58;
	const row = 15;
	const cellW = (width - left - right) / 52;
	const height = top + row * years.length + 8;
	const gap = cellW > 7 ? 1 : 0.5;
	const barX = left + 52 * cellW + 10;
	const barW = right - 58;
	const maxTotal = Math.max(...totals, 1);
	const topYears = [...years].sort((a, b) => yearTotal(b) - yearTotal(a)).slice(0, 3);

	const svg = el(host, "svg", {
		viewBox: `0 0 ${width} ${height}`,
		width: "100%",
		height: "100%",
		role: "img",
		"aria-label":
			mode === "count"
				? "Calendar of weekly fire days within 100 miles, one row per year, coloured by count."
				: "Calendar of weekly fire days within 100 miles, one row per year, coloured by how unusual that week is.",
	});

	for (let month = 0; month < 12; month++) {
		const x = left + ((MONTH_START[month] - 1) / 7) * cellW;
		el(svg, "line", { x1: x, x2: x, y1: 16, y2: top - 4, class: "cal-hair" });
		text(svg, MONTHS[month], { x: x + 3, y: 12, class: "cal-label", "font-size": 12 });
	}

	for (let week = 0; week < 52; week++) {
		const bar = maxClim > 0 ? (clim[week] / maxClim) * 28 : 0;
		if (bar <= 0.4) continue;
		el(svg, "rect", {
			x: left + week * cellW,
			y: top - 6 - bar,
			width: Math.max(0.5, cellW - gap),
			height: bar,
			class: "cal-bar cal-clim",
			style: `--d:${(week * 0.008).toFixed(3)}s`,
		});
	}
	text(svg, "typical", { x: left - 8, y: top - 8, class: "cal-label", "text-anchor": "end", "font-size": 11 });

	const viirs = years.findIndex((year) => year.year === 2012);
	const yA = top;
	const yB = viirs >= 0 ? top + row * viirs : top;
	const yC = top + row * years.length;
	if (viirs > 0) {
		el(svg, "path", { d: `M14 ${yA + 1}H8V${yB - 2}H14`, class: "cal-axis" });
		el(svg, "path", { d: `M14 ${yB + 2}H8V${yC - 1}H14`, class: "cal-axis" });
		text(svg, "Older camera", {
			x: 0,
			y: 0,
			class: "cal-label",
			"text-anchor": "middle",
			"font-size": 11,
			transform: `translate(22,${(yA + yB) / 2}) rotate(-90)`,
		});
		text(svg, "Older + sharper camera", {
			x: 0,
			y: 0,
			class: "cal-label",
			"text-anchor": "middle",
			"font-size": 11,
			transform: `translate(22,${(yB + yC) / 2}) rotate(-90)`,
		});
	}

	const cells = el(svg, "g", {});
	years.forEach((year, i) => {
		const y = top + i * row;
		text(svg, String(year.year), {
			x: left - 8,
			y: y + row - 3.5,
			class: "cal-year",
			"text-anchor": "end",
			"font-size": 11,
		});
		for (let week = 0; week < 52; week++) {
			const value = year.weeks[week];
			const rect = el(cells, "rect", {
				x: left + week * cellW,
				y,
				width: Math.max(0.5, cellW - gap),
				height: row - 1,
				rx: 1.5,
				"data-i": i,
				"data-w": week,
				style: `--d:${(i * 0.018 + week * 0.006).toFixed(3)}s`,
			});
			if (value == null) {
				rect.setAttribute("class", "cal-pending");
				continue;
			}
			if (mode === "count") {
				if (value === 0) rect.setAttribute("class", "cal-zero");
				else rect.setAttribute("fill", seqColor(value, series.maxWeek));
				continue;
			}
			const rank = percentile(year, week);
			if (rank == null) rect.setAttribute("class", "cal-zero");
			else rect.setAttribute("fill", lerp(DIV, rank));
		}

		const len = (totals[i] / maxTotal) * barW;
		el(cells, "rect", {
			x: barX,
			y: y + 2,
			width: Math.max(1, len),
			height: row - 5,
			rx: 1.5,
			class: "cal-bar",
			"data-i": i,
			"data-bar": 1,
			style: `--d:${(0.2 + i * 0.02).toFixed(3)}s`,
		});
		if (topYears.includes(year)) {
			text(svg, fmt(totals[i]), {
				x: barX + len + 4,
				y: y + row - 3.5,
				class: "cal-year",
				"font-size": 10,
			});
		}
	});
	text(svg, "year total", { x: barX, y: top - 8, class: "cal-label", "font-size": 11 });

	const highlight = el(svg, "rect", { class: "cal-hl", width: 0, height: 0 });

	cells.addEventListener("pointermove", (event) => {
		const target = event.target;
		if (!(target instanceof SVGElement) || target.dataset.i == null || !(event instanceof PointerEvent)) return;
		const i = Number(target.dataset.i);
		const year = years[i];
		if (target.dataset.bar) {
			highlight.setAttribute("width", "0");
			tip.innerHTML = `<b>${year.year}</b><br>${fmt(totals[i])} fire days`;
			tip.hidden = false;
			placeTip(tip, event);
			return;
		}
		const week = Number(target.dataset.w);
		const value = year.weeks[week];
		const rank = percentile(year, week);
		highlight.setAttribute("x", String(Number(target.getAttribute("x")) - 0.5));
		highlight.setAttribute("y", String(Number(target.getAttribute("y")) - 0.5));
		highlight.setAttribute("width", String(Number(target.getAttribute("width")) + 1));
		highlight.setAttribute("height", String(row));
		highlight.setAttribute("rx", "2");
		const count = value == null ? "Not in the archive" : value === 0 ? "No fire days" : value === 1 ? "1 fire day" : `${fmt(value)} fire days`;
		const unusual = rank == null ? "" : `<br>${ordinal(Math.round(rank * 100))} percentile for this week`;
		tip.innerHTML = `<b>${year.year}</b> · week ${week + 1}<br>${count}${unusual}`;
		tip.hidden = false;
		placeTip(tip, event);
	});
	cells.addEventListener("pointerleave", () => {
		highlight.setAttribute("width", "0");
		tip.hidden = true;
	});

	const busiest = complete.length ? complete.reduce((best, year) => (yearTotal(year) > yearTotal(best) ? year : best)) : null;
	const peakWeek = clim.indexOf(maxClim);
	if (!busiest || maxClim <= 0) {
		readout.textContent = "No fire days in a full year of the archive.";
	} else if (mode === "count") {
		readout.innerHTML = `<b>${busiest.year}</b> had the most fire days, <b>${fmt(yearTotal(busiest))}</b>. A typical year is busiest around <b>${doyLabel(peakWeek)}</b>.`;
	} else {
		const hot = complete
			.map((year) => ({
				year: year.year,
				n: year.weeks.filter((_, week) => (percentile(year, week) ?? 0) >= 0.9).length,
			}))
			.sort((a, b) => b.n - a.n || b.year - a.year)[0];
		readout.innerHTML =
			hot && hot.n > 0
				? `Each week is compared with the same week in other years. <b>${hot.year}</b> had the most unusually busy weeks: <b>${hot.n}</b> of its 52 weeks were among the busiest 10% on record.`
				: "Each week is compared with the same week in other years.";
	}

	const margin = `<span><i class="sw bar"></i>Bars: typical week on top, year total on the right</span>`;
	if (mode === "count") {
		legend.innerHTML = `${countLegend(series.maxWeek)}<span><i class="sw zero"></i>No fires</span><span><i class="sw pending"></i>No data yet</span>${margin}`;
	} else {
		legend.innerHTML = `<span>Quieter than usual</span><span>${rampSvg(DIV, 150)}</span><span>Busier than usual</span><span><i class="sw zero"></i>Never burns that week</span><span><i class="sw pending"></i>No data yet</span>${margin}`;
	}

	const rows = years
		.map((year, i) => {
			let peak = 0;
			let peakValue = -1;
			year.weeks.forEach((value, week) => {
				if (value != null && value > peakValue) {
					peakValue = value;
					peak = week;
				}
			});
			const peakLabel = peakValue > 0 ? `week ${peak + 1}` : "—";
			return `<tr><td>${year.year}</td><td>${fmt(totals[i])}</td><td>${peakLabel}</td></tr>`;
		})
		.join("");
	table.innerHTML = `<table><thead><tr><th>Year</th><th>Fire days</th><th>Peak week</th></tr></thead><tbody>${rows}</tbody></table>`;
}
