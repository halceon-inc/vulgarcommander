import type { APIRoute } from "astro";
import { ringSeries } from "../../../lib/firms-db";

export const GET: APIRoute = ({ url }) => {
	const lat = Number(url.searchParams.get("lat"));
	const lng = Number(url.searchParams.get("lng"));
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
		return Response.json({ error: "bad coordinates" }, { status: 400 });
	}

	try {
		return Response.json(ringSeries(lat, lng));
	} catch (err) {
		console.error("[rings]", err);
		return Response.json({ error: "fire record unavailable" }, { status: 503 });
	}
};
