# a hot mess

A globe for looking up the vegetation-fire history of any place on Earth. Pick a spot and it draws a 100-mile range, then shows that place’s weekly fire calendar from NASA satellites since 2000. You can also ask a question about the place; the answer is grounded in that calendar.

Source: [github.com/halceon-inc/vulgarcommander](https://github.com/halceon-inc/vulgarcommander)

## Using it

- Drag to spin the globe and scroll to zoom, or search for a place at the top.
- Click a place. A pin drops, a 100-mile circle is drawn, and six views open: all years, busy weeks, this year against past years, season shift, the 2012 satellite change, and ask.
- **Back to globe** returns to the overview. It stays available after you pan or zoom away.
- **Set as home** saves the current place in this browser. **Home** jumps back to it. The × beside Home removes it.
- **Download CSV** saves the weekly calendar for the selected place.
- **?** reopens the explanation of the record and how the data was prepared.

## How the record is made

The raw input is NASA FIRMS country-year detections, one row per satellite pixel. Before anything is stored, those files are cut down to a week count:

- Only vegetation fires are kept (type 0). Other hot spots, broken dates, and positions off the planet are dropped.
- Each kept detection is snapped to a 0.1° patch, about 7 miles (11 km) on a side, and a patch counts at most once per UTC day.
- Those days are totaled into ISO weeks. A 53rd week is folded into week 52.
- Confidence, fire brightness, pixel size, and which satellite pass saw the fire are not kept. A stored row is the patch, the year, the week, and the number of fire days.
- From 2012, Suomi-NPP VIIRS is cleaned the same way and added only on days MODIS did not already record. NOAA-20 and NOAA-21 are not included. In 2012, VIIRS starts on day 19.
- The MODIS archive starts in November 2000 (week 44). 2026 is not a full year, so those weeks stay blank instead of being counted as zero.

The map asks the database for patches near the click, then keeps the ones inside 100 miles. That series is what the charts, the CSV, and the question box use.

`scripts/build-modis.py` loads the MODIS zips. `scripts/merge-viirs.py` merges Suomi-NPP on top. The app itself reads the finished table from MotherDuck. It does not ship the raw files or a local database.

## Run it

Requires [Bun](https://bun.sh) and Node 22.23.4 or newer.

```sh
bun install
cp .env.example .env
bun run dev
```

The dev server is at http://127.0.0.1:4321/.

| Variable | Required | What it is |
| --- | --- | --- |
| `PUBLIC_MAPBOX_TOKEN` | yes | Mapbox token for the globe and place search |
| `MOTHERDUCK_TOKEN` | yes | MotherDuck token for the fire table |
| `MOTHERDUCK_HOST` | no | Defaults to `pg.us-west-2-aws.motherduck.com` |
| `OLLAMA_BASE_URL` | for Ask | Base URL of the model server |
| `OLLAMA_TOKEN` | for Ask | Bearer token for that server |
| `OLLAMA_MODEL` | no | Defaults to `gemma4:31b` |

The globe and the charts work without Ollama. Ask returns an error until `OLLAMA_BASE_URL` and `OLLAMA_TOKEN` are set.

```sh
bun run build
bun run preview
```
