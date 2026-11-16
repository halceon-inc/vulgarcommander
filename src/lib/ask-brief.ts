import type { RingSeries } from "./firms-db";

function yearStats(year: RingSeries["years"][number]) {
	let total = 0;
	let peakWeek = 0;
	let peak = -1;
	const weeks = year.weeks.map((value, index) => {
		if (value == null) return "-";
		total += value;
		if (value > peak) {
			peak = value;
			peakWeek = index + 1;
		}
		return String(value);
	});
	return { total, peakWeek: peak > 0 ? peakWeek : 0, weeks };
}

function yearLine(year: RingSeries["years"][number]) {
	const stats = yearStats(year);
	const peakLabel = stats.peakWeek > 0 ? String(stats.peakWeek) : "none";
	return `${year.year} total ${stats.total} peak ${peakLabel}: ${stats.weeks.join(",")}`;
}

function weekRanges(weeks: number[]) {
	if (!weeks.length) return "none";
	const parts: string[] = [];
	let start = weeks[0];
	let prev = weeks[0];
	for (const week of weeks.slice(1)) {
		if (week === prev + 1) {
			prev = week;
			continue;
		}
		parts.push(start === prev ? String(start) : `${start}-${prev}`);
		start = prev = week;
	}
	parts.push(start === prev ? String(start) : `${start}-${prev}`);
	return parts.join(", ");
}

function summary(series: RingSeries) {
	const complete = series.years.filter((year) => year.year >= 2001 && year.year <= 2025);
	const stats = complete.map((year) => ({ year: year.year, ...yearStats(year) }));
	const burned = stats.filter((year) => year.total > 0);
	const peaks = burned.map((year) => year.peakWeek).sort((a, b) => a - b);
	const medianPeak = peaks.length ? peaks[Math.floor((peaks.length - 1) / 2)] : 0;
	const weekHits = Array.from({ length: 53 }, () => 0);
	for (const year of burned) {
		year.weeks.forEach((value, index) => {
			if (value !== "-" && Number(value) > 0) weekHits[index + 1] += 1;
		});
	}
	const usual = weekHits
		.map((hits, week) => ({ week, hits }))
		.filter((item) => item.week > 0 && burned.length > 0 && item.hits * 2 >= burned.length)
		.map((item) => item.week);
	return [
		"Summary of complete years 2001-2025. Use this for usual season and likelihood. 2000 and 2026 are incomplete, so they are not part of the rate.",
		`Complete years: ${complete.length}. Years with at least one fire day: ${burned.length}.`,
		`Historical share: ${burned.length} of ${complete.length} complete years burned.`,
		`Median peak week among years that burned: ${medianPeak || "none"}.`,
		`Weeks with fire in at least half of the years that burned: ${weekRanges(usual)}.`,
	];
}

export function fireBrief(series: RingSeries, place: string) {
	const label = place.replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "Unnamed place";
	const lines = series.years.map(yearLine);
	return [
		`Place label: ${label}`,
		`Coordinates: ${series.lat.toFixed(5)}, ${series.lng.toFixed(5)}`,
		`Radius: ${series.miles} miles`,
		"Each count is a fire day: a distinct UTC date with a vegetation detection inside the radius.",
		"Weeks are ISO weeks 1 to 52. A dash means that week is not in the archive.",
		"2000 starts at week 44. 2001 through 2025 are complete. 2026 week 1 is late December 2025 spilling into the next ISO year, and the rest of 2026 is not in the archive.",
		"From 2012, Suomi-NPP VIIRS joins MODIS. A day both sensors recorded stays one day.",
		"Lines are year, year total, peak week, then the 52 week counts.",
		...summary(series),
		...lines,
	].join("\n");
}
