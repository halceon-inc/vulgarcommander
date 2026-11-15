import type { RingSeries, RingYear } from "../lib/firms-db";

const NS = "http://www.w3.org/2000/svg";
const SEAM_YEAR = 2012;
const SATELLITES = [
	{ name: "Terra", start: 1999.96, kind: "modis" },
	{ name: "Aqua", start: 2002.34, kind: "modis" },
	{ name: "S-NPP", start: 2011.82, kind: "viirs" },
	{ name: "NOAA-20", start: 2017.88, kind: "viirs" },
	{ name: "NOAA-21", start: 2022.86, kind: "viirs" },
];

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

function full(n: number) {
	return Math.round(n).toLocaleString("en-US");
}

function tickLabel(value: number) {
	if (value >= 1_000_000) return `${+(value / 1_000_000).toPrecision(3)}M`;
	if (value >= 1000) return `${+(value / 1000).toPrecision(3)}k`;
	return String(+value.toPrecision(3));
}

function totalOf(year: RingYear) {
	return year.weeks.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function mean(values: number[]) {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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

function meanWeek(years: RingYear[], week: number) {
	return mean(years.map((year) => year.weeks[week] ?? 0));
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

function logTicks(lo: number, hi: number) {
	const steps = hi - lo > 2.2 ? [1] : [1, 2, 5];
	const ticks: number[] = [];
	for (let power = Math.floor(lo); power <= Math.ceil(hi); power++) {
		for (const step of steps) {
			const value = step * 10 ** power;
			const v = Math.log10(value);
			if (v >= lo - 1e-9 && v <= hi + 1e-9) ticks.push(value);
		}
	}
	return ticks;
}

function drawScatter(host: HTMLElement, series: RingSeries, tip: HTMLElement, legend: HTMLElement) {
	host.replaceChildren();
	const years = series.years.filter((year) => year.weeks.every((value) => value != null));
	const beforeYears = years.filter((year) => year.year < SEAM_YEAR);
	const afterYears = years.filter((year) => year.year >= SEAM_YEAR);
	const points = Array.from({ length: 52 }, (_, week) => ({
		week,
		before: meanWeek(beforeYears, week),
		after: meanWeek(afterYears, week),
	})).filter((point) => point.before > 0 && point.after > 0);

	if (points.length < 2) {
		host.dataset.state = "empty";
		host.textContent = "Not enough weeks with fire on both sides of 2012";
		legend.replaceChildren();
		return;
	}

	host.dataset.state = "ready";
	const fit = ols(
		points.map((point) => Math.log10(point.before)),
		points.map((point) => Math.log10(point.after)),
	);
	const yAt = (value: number) => 10 ** (fit.a + fit.b * Math.log10(value));
	const xMin = Math.min(...points.map((point) => point.before));
	const xMax = Math.max(...points.map((point) => point.before));
	const logs = points.flatMap((point) => [Math.log10(point.before), Math.log10(point.after)]);
	let lo = Math.min(...logs);
	let hi = Math.max(...logs);
	const pad = Math.max(0.12, (hi - lo) * 0.08);
	lo -= pad;
	hi += pad;
	if (hi - lo < 0.6) {
		const mid = (hi + lo) / 2;
		lo = mid - 0.3;
		hi = mid + 0.3;
	}

	const width = 342;
	const height = 334;
	const left = 48;
	const top = 12;
	const plot = height - top - 40;
	const pos = (value: number) => ((Math.log10(value) - lo) / (hi - lo)) * plot;
	const xOf = (value: number) => left + pos(value);
	const yOf = (value: number) => top + plot - pos(value);
	const clampLog = (v: number) => Math.min(hi, Math.max(lo, v));

	const svg = el(host, "svg", {
		viewBox: `0 0 ${width} ${height}`,
		role: "img",
		"aria-label": "Each week of the year, mean fire days before 2012 against mean fire days from 2012 on, within 100 miles.",
	});

	el(svg, "rect", { x: left, y: top, width: plot, height: plot, class: "seam-plot" });
	for (const value of logTicks(lo, hi)) {
		const x = xOf(value);
		const y = yOf(value);
		el(svg, "line", { x1: left, x2: left + plot, y1: y, y2: y, class: "seam-hair" });
		el(svg, "line", { x1: x, x2: x, y1: top, y2: top + plot, class: "seam-hair" });
		text(svg, tickLabel(value), { x: left - 7, y: y + 3.5, class: "seam-mono", "text-anchor": "end" });
		text(svg, tickLabel(value), { x, y: top + plot + 15, class: "seam-mono", "text-anchor": "middle" });
	}
	text(svg, "Before 2012 →", { x: left + plot, y: height - 4, class: "seam-label", "text-anchor": "end" });
	text(svg, "From 2012 →", {
		x: 0,
		y: 0,
		class: "seam-label",
		"text-anchor": "end",
		transform: `translate(11,${top}) rotate(-90)`,
	});

	el(svg, "path", { d: `M${left} ${top + plot}L${left + plot} ${top}`, class: "seam-one" });
	const along = left + plot * 0.8;
	text(svg, "same on both sides", {
		x: 0,
		y: 0,
		class: "seam-label seam-halo",
		"text-anchor": "middle",
		transform: `translate(${along + 5},${top + plot - plot * 0.8 + 5}) rotate(-45)`,
	});

	const above = points.filter((point) => point.after > point.before).length;
	const cornerNote = above >= points.length / 2 ? "More from 2012" : "More before 2012";
	if (above >= points.length / 2) {
		text(svg, cornerNote, { x: left + 8, y: top + 16, class: "seam-label seam-corner" });
	} else {
		text(svg, cornerNote, { x: left + plot - 8, y: top + plot - 10, class: "seam-label seam-corner", "text-anchor": "end" });
	}

	const fx0 = xOf(xMin);
	const fx1 = xOf(xMax);
	const fy0 = top + plot - ((clampLog(Math.log10(yAt(xMin))) - lo) / (hi - lo)) * plot;
	const fy1 = top + plot - ((clampLog(Math.log10(yAt(xMax))) - lo) / (hi - lo)) * plot;
	el(svg, "path", { d: `M${fx0} ${fy0}L${fx1} ${fy1}`, class: "seam-fit" });

	const dots = el(svg, "g", {});
	for (const point of points) {
		el(dots, "circle", { cx: xOf(point.before), cy: yOf(point.after), r: 3.2, class: "seam-pt" });
	}
	const ring = el(svg, "circle", { r: 6, class: "seam-ring", visibility: "hidden" });
	const hits = el(svg, "g", {});
	points.forEach((point, i) => {
		el(hits, "circle", {
			cx: xOf(point.before),
			cy: yOf(point.after),
			r: 8,
			fill: "transparent",
			"data-i": i,
		});
	});
	hits.addEventListener("pointermove", (event) => {
		const target = event.target;
		if (!(target instanceof SVGElement) || target.dataset.i == null || !(event instanceof PointerEvent)) return;
		const point = points[Number(target.dataset.i)];
		ring.setAttribute("cx", String(xOf(point.before)));
		ring.setAttribute("cy", String(yOf(point.after)));
		ring.setAttribute("visibility", "visible");
		tip.innerHTML = `<b>Week ${point.week + 1}</b><br>Before 2012: <b>${point.before.toFixed(1)}</b> fire days<br>From 2012: <b>${point.after.toFixed(1)}</b> fire days`;
		tip.hidden = false;
		placeTip(tip, event);
	});
	hits.addEventListener("pointerleave", () => {
		ring.setAttribute("visibility", "hidden");
		tip.hidden = true;
	});

	legend.innerHTML = [
		`<span><i class="sw point"></i>Week of year</span>`,
		`<span><i class="sw dash"></i>1 : 1</span>`,
		`<span><i class="sw now"></i>Fit <span class="mono">${(10 ** fit.a).toFixed(1)} × before<sup>${fit.b.toFixed(2)}</sup></span></span>`,
	].join("");
}

export function drawSeam(
	host: HTMLElement,
	scatter: HTMLElement,
	series: RingSeries,
	tip: HTMLElement,
	legend: HTMLElement,
	scatterLegend: HTMLElement,
	readout: HTMLElement,
) {
	host.replaceChildren();
	tip.hidden = true;

	const years = series.years.filter((year) => year.weeks.every((value) => value != null));
	const rows = years.map((year) => ({ year: year.year, total: totalOf(year) }));
	const positive = rows.filter((row) => row.total > 0).map((row) => row.total);
	if (!rows.length || !positive.length) {
		host.dataset.state = "empty";
		host.textContent = "No fire days in a full year";
		legend.replaceChildren();
		readout.textContent = "No fire days in a full year of the archive.";
		drawScatter(scatter, series, tip, scatterLegend);
		return;
	}

	host.dataset.state = "ready";
	const beforeRows = rows.filter((row) => row.year < SEAM_YEAR);
	const afterRows = rows.filter((row) => row.year >= SEAM_YEAR);
	const beforeMean = mean(beforeRows.map((row) => row.total));
	const afterMean = mean(afterRows.map((row) => row.total));

	if (beforeRows.length && afterRows.length && beforeMean > 0) {
		const ratio = afterMean / beforeMean;
		const change =
			ratio >= 1.05
				? `<b>${ratio.toFixed(1)}×</b> as many once VIIRS joined`
				: ratio <= 0.95
					? `<b>${Math.round((1 - ratio) * 100)}% fewer</b> even with VIIRS`
					: `<b>about the same</b> even with VIIRS`;
		readout.innerHTML = `Fire days per year averaged <b>${full(beforeMean)}</b> before 2012 and <b>${full(afterMean)}</b> from 2012 on, ${change}.`;
	} else if (afterRows.length) {
		readout.innerHTML = `No fire days before 2012. From 2012 on, the area averaged <b>${full(afterMean)}</b> a year.`;
	} else {
		readout.textContent = "The record ends before VIIRS joins in 2012.";
	}

	const width = 640;
	const height = 334;
	const left = 56;
	const right = 16;
	const top = 30;
	const plotH = 200;
	const plotW = width - left - right;
	const first = rows[0].year;
	const last = rows[rows.length - 1].year;
	const domainStart = first - 0.35;
	const domainEnd = last + 0.35;
	const xOf = (year: number) => left + ((year - domainStart) / (domainEnd - domainStart)) * plotW;
	const allLogs = [...positive, ...(beforeMean > 0 ? [beforeMean] : []), ...(afterMean > 0 ? [afterMean] : [])].map(
		(value) => Math.log10(value),
	);
	let lo = Math.floor(Math.min(...allLogs));
	let hi = Math.ceil(Math.max(...allLogs));
	if (hi === lo) hi += 1;
	const yOf = (value: number) => {
		const v = Math.log10(Math.max(1, value));
		return top + plotH - ((v - lo) / (hi - lo)) * plotH;
	};
	const base = top + plotH;

	const svg = el(host, "svg", {
		viewBox: `0 0 ${width} ${height}`,
		role: "img",
		"aria-label": `Merged fire days per year on a log scale, ${first} to ${last}, with the 2012 VIIRS seam and the satellites in orbit, within 100 miles.`,
	});

	const defs = el(svg, "defs", {});
	const grad = el(defs, "linearGradient", { id: "seam-area-grad", x1: 0, x2: 0, y1: 0, y2: 1 });
	el(grad, "stop", { offset: "0%", "stop-color": "#d95926", "stop-opacity": 0.2 });
	el(grad, "stop", { offset: "100%", "stop-color": "#d95926", "stop-opacity": 0 });

	const seamX = xOf(SEAM_YEAR);
	const showSeam = first < SEAM_YEAR && last >= SEAM_YEAR;
	el(svg, "rect", { x: left, y: top, width: plotW, height: plotH, class: "seam-plot" });
	if (showSeam) {
		el(svg, "rect", { x: seamX, y: top, width: left + plotW - seamX, height: plotH, class: "seam-era" });
	}

	for (let power = lo; power <= hi; power++) {
		const y = yOf(10 ** power);
		el(svg, "line", { x1: left, x2: left + plotW, y1: y, y2: y, class: power === lo ? "seam-axis" : "seam-hair" });
		text(svg, tickLabel(10 ** power), { x: left - 8, y: y + 3.5, class: "seam-mono", "text-anchor": "end" });
	}
	const ticks = [2001, 2005, 2010, 2015, 2020, 2025, ...(showSeam ? [SEAM_YEAR] : [])];
	for (const year of ticks) {
		if (year < first || year > last) continue;
		const x = xOf(year);
		const isSeam = year === SEAM_YEAR;
		el(svg, "line", { x1: x, x2: x, y1: base, y2: base + 4, class: "seam-axis" });
		text(svg, String(year), { x, y: base + 16, class: isSeam ? "seam-mono ink" : "seam-mono", "text-anchor": "middle" });
	}

	if (showSeam) {
		text(svg, "MODIS ONLY", { x: (left + seamX) / 2, y: top - 10, class: "seam-era-label", "text-anchor": "middle" });
		text(svg, "MODIS + VIIRS", {
			x: (seamX + left + plotW) / 2,
			y: top - 10,
			class: "seam-era-label",
			"text-anchor": "middle",
		});
		el(svg, "line", { x1: seamX, x2: seamX, y1: top - 4, y2: base, class: "seam-mark" });
	}

	const segments: { year: number; total: number }[][] = [];
	let current: { year: number; total: number }[] = [];
	for (const row of rows) {
		if (row.total <= 0) {
			if (current.length) segments.push(current);
			current = [];
			continue;
		}
		current.push(row);
	}
	if (current.length) segments.push(current);
	for (const segment of segments) {
		const line = segment.map((row, i) => `${i ? "L" : "M"}${xOf(row.year).toFixed(1)} ${yOf(row.total).toFixed(1)}`).join("");
		const x0 = xOf(segment[0].year).toFixed(1);
		const x1 = xOf(segment[segment.length - 1].year).toFixed(1);
		el(svg, "path", { d: `${line}L${x1} ${base}L${x0} ${base}Z`, class: "seam-area" });
	}

	const levels = [
		{ rows: beforeRows, value: beforeMean, x0: xOf(first), x1: showSeam ? seamX : xOf(last) },
		{ rows: afterRows, value: afterMean, x0: showSeam ? seamX : xOf(first), x1: xOf(last) },
	];
	for (const level of levels) {
		if (!level.rows.length || level.value <= 0) continue;
		const y = yOf(level.value);
		el(svg, "line", { x1: level.x0, x2: level.x1, y1: y, y2: y, class: "seam-level" });
		text(svg, `avg ${full(level.value)}`, {
			x: level.x1 - 6,
			y: y + 14,
			class: "seam-label seam-halo",
			"text-anchor": "end",
		});
	}

	for (const segment of segments) {
		const line = segment.map((row, i) => `${i ? "L" : "M"}${xOf(row.year).toFixed(1)} ${yOf(row.total).toFixed(1)}`).join("");
		el(svg, "path", { d: line, class: "seam-line" });
	}

	const guide = el(svg, "line", { y1: top, y2: base, class: "seam-guide", visibility: "hidden" });
	for (const row of rows) {
		if (row.total > 0) el(svg, "circle", { cx: xOf(row.year), cy: yOf(row.total), r: 3, class: "seam-dot" });
	}
	const ring = el(svg, "circle", { r: 6, class: "seam-ring", visibility: "hidden" });

	const satTop = base + 32;
	const satGap = 12;
	SATELLITES.forEach((sat, i) => {
		const y = satTop + i * satGap;
		const x0 = xOf(Math.max(domainStart, sat.start));
		const x1 = xOf(domainEnd);
		el(svg, "rect", { x: x0, y: y - 3, width: Math.max(1, x1 - x0), height: 6, rx: 3, class: `seam-sat ${sat.kind}` });
		text(svg, sat.name, { x: left - 8, y: y + 3.5, class: "seam-sat-label", "text-anchor": "end" });
	});

	const hits = el(svg, "g", {});
	const slot = plotW / (domainEnd - domainStart);
	rows.forEach((row, i) => {
		el(hits, "rect", {
			x: xOf(row.year) - slot / 2,
			y: top,
			width: slot,
			height: plotH,
			fill: "transparent",
			"data-i": i,
		});
	});
	hits.addEventListener("pointermove", (event) => {
		const target = event.target;
		if (!(target instanceof SVGElement) || target.dataset.i == null || !(event instanceof PointerEvent)) return;
		const row = rows[Number(target.dataset.i)];
		const x = String(xOf(row.year));
		guide.setAttribute("x1", x);
		guide.setAttribute("x2", x);
		guide.setAttribute("visibility", "visible");
		if (row.total > 0) {
			ring.setAttribute("cx", x);
			ring.setAttribute("cy", String(yOf(row.total)));
			ring.setAttribute("visibility", "visible");
		} else {
			ring.setAttribute("visibility", "hidden");
		}
		const era = row.year < SEAM_YEAR ? "MODIS only" : "MODIS + VIIRS";
		const count = row.total === 0 ? "No fire days" : `<b>${full(row.total)}</b> fire days`;
		tip.innerHTML = `<b>${row.year}</b> · ${era}<br>${count}`;
		tip.hidden = false;
		placeTip(tip, event);
	});
	hits.addEventListener("pointerleave", () => {
		guide.setAttribute("visibility", "hidden");
		ring.setAttribute("visibility", "hidden");
		tip.hidden = true;
	});

	legend.innerHTML = [
		`<span><i class="sw now"></i>Fire days</span>`,
		`<span><i class="sw dash"></i>Era average</span>`,
		`<span><i class="sw modis"></i>MODIS in orbit</span>`,
		`<span><i class="sw viirs"></i>VIIRS in orbit</span>`,
	].join("");
	drawScatter(scatter, series, tip, scatterLegend);
}
