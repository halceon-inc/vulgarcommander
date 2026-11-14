import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
	const localTime = new Date()
		.toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' })
		.replace(' ', 'T');

	return new Response(JSON.stringify({ status: 'ok', time: localTime }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
