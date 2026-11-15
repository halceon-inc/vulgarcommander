import type { RingSeries, RingYear } from "../lib/firms-db";

const NS = "http://www.w3.org/2000/svg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const PERCENTILES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

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

function axisFmt(n: number) {
	if (n !== 0 && Math.abs(n) < 10) return String(Math.round(n * 10) / 10);
	const value = Math.round(n);
	const compact = (v: number) => v.toFixed(1).replace(/\.0$/, "");
	if (value >= 1_000_000) return `${compact(value / 1_000_000)}M`;
	if (value >= 10_000) return `${Math.round(value / 1000)}k`;
	if (value >= 1000) return `${compact(value / 1000)}k`;
	return String(value);
}

function niceStep(value: number) {
	if (value <= 0) return 1;
	const power = 10 ** Math.floor(Math.log10(value));
	const n = value / power;
	const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
	return step * power;
}

function quant(sorted: number[], p: number) {
	if (!sorted.length) return 0;
	const index = (sorted.length - 1) * p;
	const lo = Math.floor(index);
	const hi = Math.ceil(index);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
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
	return values;
}

function isComplete(year: RingYear) {
	return year.weeks.every((value) => value != null);
}

function lastObserved(year: RingYear) {
	let index = -1;
	year.weeks.forEach((value, week) => {
		if (value != null) index = week;
	});
	return index;
}

function spread<T extends { y: number }>(items: T[], minGap: number, lo: number, hi: number) {
	items.sort((a, b) => a.y - b.y);
	for (let i = 1; i < items.length; i++) {
		if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
	}
	if (items.length && items[items.length - 1].y > hi) {
		items[items.length - 1].y = hi;
		for (let i = items.length - 2; i >= 0; i--) {
			if (items[i + 1].y - items[i].y < minGap) items[i].y = items[i + 1].y - minGap;
		}
	}
	if (items.length && items[0].y < lo) {
		items[0].y = lo;
		for (let i = 1; i < items.length; i++) {
			if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
		}
	}
	return items;
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

export function drawRace(host: HTMLElement, series: RingSeries, tip: HTMLElement, legend: HTMLElement, readout: HTMLElement) {
	host.replaceChildren();
	tip.hidden = true;

	const complete = series.years.filter(isComplete);
	const latest = series.years[series.years.length - 1];
	const partialIndex = latest && !isComplete(latest) ? lastObserved(latest) : -1;
	const subject = partialIndex > 0 ? latest : complete[complete.length - 1];
	if (!subject) {
		host.dataset.state = "empty";
		host.textContent = "No full year in the archive";
		readout.replaceChildren();
		legend.replaceChildren();
		return;
	}

	host.dataset.state = "ready";
	const partial = subject === latest && partialIndex > 0;
	const upto = partial ? partialIndex : subject.weeks.length - 1;
	const history = complete.filter((year) => year.year < subject.year);
	const subjectCum = cumulative(subject);
	const historyCum = history.map((year) => ({ year: year.year, cum: cumulative(year) }));
	const rq = PERCENTILES.map(() => [] as number[]);
	for (let week = 0; week < 52; week++) {
		const column = historyCum.map((year) => year.cum[week]).sort((a, b) => a - b);
		PERCENTILES.forEach((p, i) => rq[i].push(quant(column, p)));
	}

	const rankNow = historyCum.filter((year) => year.cum[upto] < subjectCum[upto]).length;
	const analogs = historyCum
		.map((year) => {
			let sum = 0;
			for (let week = 0; week <= upto; week++) {
				const delta = Math.log1p(year.cum[week]) - Math.log1p(subjectCum[week]);
				sum += delta * delta;
			}
			return { year, dist: sum / (upto + 1) };
		})
		.sort((a, b) => a.dist - b.dist || b.year.year - a.year.year)
		.slice(0, 2)
		.map((item) => item.year);
	const maxYear = historyCum.reduce<(typeof historyCum)[number] | null>(
		(best, year) => (!best || year.cum[51] > best.cum[51] ? year : best),
		null,
	);

	const width = 780;
	const height = 400;
	const left = 52;
	const right = 118;
	const top = 28;
	const bottom = 36;
	const plotW = width - left - right;
	const plotH = height - top - bottom;
	const peak = Math.max(rq[6]?.[51] ?? 0, subjectCum[upto], 0);
	const step = niceStep((peak * 1.02) / 5);
	const ymax = Math.max(step, Math.ceil((peak * 1.02) / step) * step);
	const tickCount = Math.round(ymax / step);
	const xOf = (day: number) => left + ((day - 1) / 364) * plotW;
	const yOf = (value: number) => top + plotH - (value / ymax) * plotH;

	const svg = el(host, "svg", {
		viewBox: `0 0 ${width} ${height}`,
		role: "img",
		"aria-label": history.length
			? `Cumulative fire days by week, ${subject.year} against ${history[0].year} to ${history[history.length - 1].year}, within 100 miles.`
			: `Cumulative fire days by week for ${subject.year}, within 100 miles.`,
	});

	const seenTicks = new Set<string>();
	for (let i = 0; i <= tickCount; i++) {
		const value = step * i;
		const y = yOf(value);
		const label = axisFmt(value);
		el(svg, "line", {
			x1: left,
			x2: left + plotW,
			y1: y,
			y2: y,
			class: i ? "race-hair" : "race-axis",
		});
		if (seenTicks.has(label)) continue;
		seenTicks.add(label);
		text(svg, label, {
			x: left - 6,
			y: y + 3.5,
			class: "race-mono",
			"text-anchor": "end",
		});
	}
	for (let month = 0; month < 12; month++) {
		const x = xOf(MONTH_START[month]);
		el(svg, "line", { x1: x, x2: x, y1: top + plotH, y2: top + plotH + 4, class: "race-axis" });
		text(svg, MONTHS[month], {
			x: xOf(MONTH_START[month] + 14),
			y: height - 10,
			class: "race-label",
			"text-anchor": "middle",
		});
	}

	function band(lo: number, hi: number, name: string) {
		let d = "";
		for (let week = 0; week < 52; week++) {
			d += `${week ? "L" : "M"}${xOf(weekDay(week)).toFixed(1)} ${yOf(rq[hi][week]).toFixed(1)}`;
		}
		for (let week = 51; week >= 0; week--) {
			d += `L${xOf(weekDay(week)).toFixed(1)} ${yOf(rq[lo][week]).toFixed(1)}`;
		}
		el(svg, "path", { d: `${d}Z`, class: `race-band ${name}` });
	}

	function line(values: number[], count: number, name: string) {
		let d = "";
		for (let week = 0; week < count; week++) {
			d += `${week ? "L" : "M"}${xOf(weekDay(week)).toFixed(1)} ${yOf(values[week]).toFixed(1)}`;
		}
		return el(svg, "path", { d, class: `race-line ${name}` });
	}

	if (history.length) {
		band(0, 6, "b0");
		band(1, 5, "b1");
		band(2, 4, "b2");
		line(rq[3], 52, "med");
	}
	for (const analog of analogs) line(analog.cum, 52, "analog");

	const markerDay = weekDay(upto);
	const markerX = xOf(markerDay);
	el(svg, "line", { x1: markerX, x2: markerX, y1: top, y2: top + plotH, class: "race-hair" });
	line(subjectCum, upto + 1, "now");
	const markerY = yOf(subjectCum[upto]);
	el(svg, "circle", { cx: markerX, cy: markerY, r: 4.5, class: "race-dot" });
	const labelAbove = markerY > top + 34;
	text(svg, partial ? `${subject.year} so far, ${axisFmt(subjectCum[upto])}` : `${subject.year}, ${axisFmt(subjectCum[upto])}`, {
		x: markerX - 8,
		y: labelAbove ? markerY - 12 : markerY + 18,
		class: "race-label ink race-halo",
		"text-anchor": "end",
	});
	const nearEnd = markerX > left + plotW * 0.72;
	text(svg, partial ? doyLabel(markerDay) : `end of ${subject.year}`, {
		x: nearEnd ? markerX - 6 : markerX,
		y: top - 8,
		class: "race-label",
		"text-anchor": nearEnd ? "end" : "middle",
	});

	if (history.length && maxYear && maxYear.cum[51] > 0) {
		const labels = [
			{ y: yOf(rq[6][51]), s: `max, ${maxYear.year}`, c: "race-label" },
			{ y: yOf(rq[3][51]), s: "median", c: "race-label" },
			...analogs.map((year) => ({ y: yOf(year.cum[51]), s: `${year.year} analog`, c: "race-label analog" })),
		];
		for (const label of spread(labels, 15, top + 12, top + plotH - 10)) {
			text(svg, label.s, { x: left + plotW + 8, y: label.y + 3.5, class: label.c });
		}
	}

	const cross = el(svg, "line", { class: "race-cross", y1: top, y2: top + plotH, x1: -9, x2: -9 });
	const hit = el(svg, "rect", { x: left, y: top, width: plotW, height: plotH, fill: "transparent" });
	hit.addEventListener("pointermove", (event) => {
		if (!(event instanceof PointerEvent)) return;
		const box = hit.getBoundingClientRect();
		if (box.width <= 0) return;
		const day = clamp(Math.round(((event.clientX - box.left) / box.width) * 364) + 1, 1, 365);
		const week = clamp(Math.floor((day - 1) / 7), 0, 51);
		const x = xOf(weekDay(week));
		cross.setAttribute("x1", String(x));
		cross.setAttribute("x2", String(x));
		let html = `<b>Week ${week + 1}</b> · ${doyLabel(weekDay(week))}`;
		if (week <= upto) {
			html += `<br>${subject.year}: <b>${full(subjectCum[week])}</b> fire days, above ${historyCum.filter((year) => year.cum[week] < subjectCum[week]).length} of ${history.length} years`;
		}
		if (history.length) {
			html += `<br>Median: <b>${full(rq[3][week])}</b><br>10th to 90th: <b>${full(rq[1][week])}</b> to <b>${full(rq[5][week])}</b>`;
		}
		for (const analog of analogs) html += `<br>${analog.year}: <b>${full(analog.cum[week])}</b>`;
		tip.innerHTML = html;
		tip.hidden = false;
		placeTip(tip, event);
	});
	hit.addEventListener("pointerleave", () => {
		cross.setAttribute("x1", "-9");
		cross.setAttribute("x2", "-9");
		tip.hidden = true;
	});

	const earlier = `${history.length} earlier year${history.length === 1 ? "" : "s"}`;
	const analogSentence =
		analogs.length >= 2
			? ` The closest past seasons are <b>${analogs[0].year}</b> and <b>${analogs[1].year}</b>.`
			: analogs.length === 1
				? ` The closest past season is <b>${analogs[0].year}</b>.`
				: "";
	if (!history.length) {
		readout.innerHTML = partial
			? `By week ${upto + 1}, ${subject.year} has logged <b>${full(subjectCum[upto])}</b> fire days. There is no earlier full year to compare.`
			: `By the end of ${subject.year}, this area had logged <b>${full(subjectCum[upto])}</b> fire days. There is no earlier full year to compare.`;
	} else if (partial) {
		readout.innerHTML = `By week ${upto + 1}, ${subject.year} has logged <b>${full(subjectCum[upto])}</b> fire days, more than <b>${rankNow} of the ${earlier}</b> had by this week.${analogSentence}`;
	} else {
		readout.innerHTML = `By the end of ${subject.year}, this area had logged <b>${full(subjectCum[upto])}</b> fire days, more than <b>${rankNow} of the ${earlier}</b> had by then.${analogSentence}`;
	}

	const span = history.length ? `${history[0].year}–${history[history.length - 1].year}` : "";
	const legendItems = [`<span><i class="sw now"></i>${subject.year}</span>`];
	if (analogs.length) legendItems.push(`<span><i class="sw line"></i>Closest past years</span>`);
	if (history.length) {
		legendItems.push(
			`<span><i class="sw dash"></i>Median of ${span}</span>`,
			`<span><i class="sw band b2"></i>25th to 75th</span>`,
			`<span><i class="sw band b1"></i>10th to 90th</span>`,
			`<span><i class="sw band b0"></i>Lowest to highest</span>`,
		);
	}
	legend.innerHTML = legendItems.join("");
}
