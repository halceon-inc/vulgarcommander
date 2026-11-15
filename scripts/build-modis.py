#!/usr/bin/env python3
"""made script to load modis country-year csvs into data/modis.sqlite (used sqlite3)

all the veggie detections of 0 type are snapped to a 0.1deg cell and counted once per
utc date
each stored row is how many of those dates fall in an iso week
week 53 is folded into week 52
this script is only for modis so suomi-npp satalite data is not included
-sushant
"""

from __future__ import annotations

import math
import sqlite3
import sys
import time
import zipfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASETS = ROOT / "datasets" / "modis"
DB_PATH = ROOT / "data" / "firms.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS cell_week (
	lat INTEGER NOT NULL,
	lng INTEGER NOT NULL,
	year INTEGER NOT NULL,
	week INTEGER NOT NULL,
	days INTEGER NOT NULL,
	PRIMARY KEY (lat, lng, year, week)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS modis_ingested (
	year INTEGER PRIMARY KEY,
	rows INTEGER NOT NULL,
	cell_days INTEGER NOT NULL
);
"""


def week_slot(day: date) -> tuple[int, int]:
	thursday = day + timedelta(days=4 - day.isoweekday())
	iso_year = thursday.year
	jan4 = date(iso_year, 1, 4)
	monday = jan4 - timedelta(days=jan4.isoweekday() - 1)
	week = (day - monday).days // 7 + 1
	if week > 52:
		week = 52
	elif week < 1:
		week = 1
	return iso_year, week
def cell_index(raw: bytes) -> int | None:
	try:
		return math.floor(float(raw) * 10)
	except ValueError:
		return None


def ingest_zip(path: Path, year: int) -> tuple[int, set[int]]:
	seen: set[int] = set()
	kept = 0
	jan1 = date(year, 1, 1)
	with zipfile.ZipFile(path) as archive:
		for name in archive.namelist():
			if not name.endswith(".csv"):
				continue
			with archive.open(name) as handle:
				header = handle.readline().strip().split(b",")
				try:
					lat_at = header.index(b"latitude")
					lng_at = header.index(b"longitude")
					date_at = header.index(b"acq_date")
					type_at = header.index(b"type")
				except ValueError:
					print(f"  skip {name}: missing columns", file=sys.stderr)
					continue
				need = max(lat_at, lng_at, date_at, type_at)
				for line in handle:
					parts = line.split(b",", need + 1)
					if len(parts) <= need or parts[type_at].strip() != b"0":
						continue
					stamp = parts[date_at]
					if len(stamp) < 10 or stamp[4:5] != b"-" or stamp[7:8] != b"-":
						continue
					try:
						day = date(int(stamp[0:4]), int(stamp[5:7]), int(stamp[8:10]))
					except ValueError:
						continue
					lat_i = cell_index(parts[lat_at])
					lng_i = cell_index(parts[lng_at])
					if lat_i is None or lng_i is None or not (-900 <= lat_i <= 899 and -1800 <= lng_i <= 1799):
						continue
					doy = (day - jan1).days
					if doy < 0 or doy > 365:
						continue
					seen.add(((lat_i + 900) * 3600 + (lng_i + 1800)) * 366 + doy)
					kept += 1
	return kept, seen


def write_year(conn: sqlite3.Connection, year: int, kept: int, seen: set[int]) -> None:
	jan1 = date(year, 1, 1)
	counts: dict[tuple[int, int, int, int], int] = {}
	for key in seen:
		cell, doy = divmod(key, 366)
		lat_i = cell // 3600 - 900
		lng_i = cell % 3600 - 1800
		iso_year, week = week_slot(jan1 + timedelta(days=doy))
		slot = (lat_i, lng_i, iso_year, week)
		counts[slot] = counts.get(slot, 0) + 1

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
			"INSERT INTO modis_ingested (year, rows, cell_days) VALUES (?, ?, ?)",
			(year, kept, len(seen)),
		)
		conn.execute("COMMIT")
	except Exception:
		conn.execute("ROLLBACK")
		raise





def main() -> None:
	DB_PATH.parent.mkdir(parents=True, exist_ok=True)
	conn = sqlite3.connect(DB_PATH, isolation_level=None)
	conn.executescript(SCHEMA)
	conn.execute("PRAGMA journal_mode = WAL")
	conn.execute("PRAGMA synchronous = NORMAL")
	done = {row[0] for row in conn.execute("SELECT year FROM modis_ingested")}

	for year in range(2000, 2026):
		if year in done:
			print(f"{year} modis already ingested", flush=True)
			continue
		path = DATASETS / f"modis_{year}_all_countries.zip"
		if not path.is_file():
			raise SystemExit(f"missing {path}")
		started = time.perf_counter()
		kept, seen = ingest_zip(path, year)
		write_year(conn, year, kept, seen)
		print(f"{year} rows {kept:,} cell-days {len(seen):,} in {time.perf_counter() - started:.0f}s", flush=True)

	total, days = conn.execute("SELECT COUNT(*), SUM(days) FROM cell_week").fetchone()
	print(f"cell_week rows {total:,} cell-days {days:,}", flush=True)
	conn.close()


if __name__ == "__main__":
	main()
