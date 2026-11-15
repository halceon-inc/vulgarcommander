#!/usr/bin/env python3
"""script to merge snpp celldays that modis did not already record.

a given date both sensors saw stays one day 
only the new dates are added onto cell_week table
years already listed in viirs_ingested are skipped
-sushant
"""

from __future__ import annotations

import importlib.util
import sqlite3
import time
from datetime import date, timedelta
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
	"build_modis",
	Path(__file__).resolve().parent / "build-modis.py",
)
_modis = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_modis)
DB_PATH = _modis.DB_PATH
ingest_zip = _modis.ingest_zip
week_slot = _modis.week_slot

ROOT = Path(__file__).resolve().parents[1]
VIIRS = ROOT / "datasets" / "s-npp"
MODIS = ROOT / "datasets" / "modis"
VIIRS_START_DOY = 19


def week_counts(year: int, keys: set[int]) -> dict[tuple[int, int, int, int], int]:
	jan1 = date(year, 1, 1)
	counts: dict[tuple[int, int, int, int], int] = {}
	for key in keys:
		cell, doy = divmod(key, 366)
		lat_i = cell // 3600 - 900
		lng_i = cell % 3600 - 1800
		iso_year, week = week_slot(jan1 + timedelta(days=doy))
		slot = (lat_i, lng_i, iso_year, week)
		counts[slot] = counts.get(slot, 0) + 1
	return counts


def main() -> None:
	conn = sqlite3.connect(DB_PATH, isolation_level=None)
	conn.execute(
		"""
		CREATE TABLE IF NOT EXISTS viirs_ingested (
			year INTEGER PRIMARY KEY,
			rows INTEGER NOT NULL,
			new_cell_days INTEGER NOT NULL
		)
		"""
	)
	conn.execute("PRAGMA journal_mode = WAL")
	conn.execute("PRAGMA synchronous = NORMAL")
	done = {row[0] for row in conn.execute("SELECT year FROM viirs_ingested")}

	for year in range(2012, 2026):
		if year in done:
			print(f"{year} already merged", flush=True)
			continue
		modis_path = MODIS / f"modis_{year}_all_countries.zip"
		viirs_path = VIIRS / f"viirs-snpp_{year}_all_countries.zip"
		if not modis_path.is_file() or not viirs_path.is_file():
			raise SystemExit(f"missing zip for {year}")

		started = time.perf_counter()
		_, modis_days = ingest_zip(modis_path, year)
		viirs_rows, viirs_days = ingest_zip(viirs_path, year)
		if year == 2012:
			viirs_days = {key for key in viirs_days if key % 366 >= VIIRS_START_DOY}
		novel = viirs_days - modis_days
		counts = week_counts(year, novel)

		conn.execute("BEGIN")
		try:
			conn.executemany(
				"""
				INSERT INTO cell_week (lat, lng, year, week, days)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT (lat, lng, year, week) DO UPDATE SET days = days + excluded.days
				""",
				((lat, lng, iso_year, week, days) for (lat, lng, iso_year, week), days in counts.items()),
			)
			conn.execute(
				"INSERT INTO viirs_ingested (year, rows, new_cell_days) VALUES (?, ?, ?)",
				(year, viirs_rows, len(novel)),
			)
			conn.execute("COMMIT")
		except Exception:
			conn.execute("ROLLBACK")
			raise
		print(
			f"{year} viirs rows {viirs_rows:,} new cell-days {len(novel):,} in {time.perf_counter() - started:.0f}s",
			flush=True,
		)

	total, days, too_many = conn.execute(
		"SELECT COUNT(*), SUM(days), SUM(days > 14) FROM cell_week"
	).fetchone()
	print(f"cell_week rows {total:,} cell-days {days:,} weeks over 14 days {too_many}", flush=True)
	conn.close()


if __name__ == "__main__":
	main()
