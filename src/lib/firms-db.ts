import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const FIRST_YEAR = 2000;
const LAST_YEAR = 2026;
const RADIUS_MILES = 100;
const EARTH_MILES = 3958.7613;

export type RingYear = {
	year: number;
	weeks: (number | null)[];
};

export type RingSeries = {
	lat: number;
	lng: number;
	miles: number;
	years: RingYear[];
	maxWeek: number;
	maxTotal: number;
};

type CellWeek = {
	lat: number;
	lng: number;
	year: number;
	week: number;
	days: number;
};

let database: DatabaseSync | null = null;

function openDatabase() {
	if (database) return database;
	const file = process.env.FIRMS_DB ?? path.join(process.cwd(), "data", "firms.sqlite");
	database = new DatabaseSync(file, { readOnly: true });
	return database;
}

function weekValue(year: number, week: number, found: number | undefined): number | null {
	if (found != null) return found;
	if (year === 2000 && week < 44) return null;
	if (year > 2025) return null;
	return 0;
}

function milesBetween(lat: number, lng: number, lat0: number, lng0: number) {
	const p1 = (lat * Math.PI) / 180;
	const p2 = (lat0 * Math.PI) / 180;
	const dLat = ((lat - lat0) * Math.PI) / 180;
	const dLng = ((lng - lng0) * Math.PI) / 180;
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

function lngSpans(lo: number, hi: number): [number, number][] {
	if (lo >= -1800 && hi <= 1799) return [[lo, hi]];
	if (lo < -1800) return [[lo + 3600, 1799], [-1800, Math.min(1799, hi)]];
	return [[Math.max(-1800, lo), 1799], [-1800, hi - 3600]];
}

export function ringSeries(lat: number, lng: number): RingSeries {
	const years: RingYear[] = [];
	let maxWeek = 0;
	let maxTotal = 0;
	const empty = { lat, lng, miles: RADIUS_MILES, years, maxWeek, maxTotal };

	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return empty;

	const arc = RADIUS_MILES / EARTH_MILES;
	const dLat = (arc * 180) / Math.PI;
	const cos = Math.cos((lat * Math.PI) / 180);
	const dLng = cos > 0.01 ? dLat / cos : 180;
	const latLo = Math.max(-900, Math.floor((lat - dLat) * 10) - 1);
	const latHi = Math.min(899, Math.floor((lat + dLat) * 10) + 1);
	const lngLo = Math.floor((lng - dLng) * 10) - 1;
	const lngHi = Math.floor((lng + dLng) * 10) + 1;

	const db = openDatabase();
	const query = db.prepare(
		"SELECT lat, lng, year, week, days FROM cell_week WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?",
	);
	const rows: CellWeek[] = [];
	for (const [lo, hi] of lngSpans(lngLo, lngHi)) {
		if (lo <= hi) rows.push(...(query.all(latLo, latHi, lo, hi) as CellWeek[]));
	}

	const byYear = new Map<number, Map<number, number>>();
	for (const row of rows) {
		const cellLat = (row.lat + 0.5) / 10;
		const cellLng = (row.lng + 0.5) / 10;
		if (milesBetween(cellLat, cellLng, lat, lng) > RADIUS_MILES) continue;
		let weeks = byYear.get(row.year);
		if (!weeks) {
			weeks = new Map();
			byYear.set(row.year, weeks);
		}
		weeks.set(row.week, (weeks.get(row.week) ?? 0) + row.days);
	}

	for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
		const found = byYear.get(year);
		const weeks: (number | null)[] = [];
		let total = 0;
		for (let week = 1; week <= 52; week++) {
			const value = weekValue(year, week, found?.get(week));
			weeks.push(value);
			if (value == null) continue;
			total += value;
			if (value > maxWeek) maxWeek = value;
		}
		if (total > maxTotal) maxTotal = total;
		years.push({ year, weeks });
	}

	return { lat, lng, miles: RADIUS_MILES, years, maxWeek, maxTotal };
}
