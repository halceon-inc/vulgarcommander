export function rampLegend(label: string, color: (t: number) => string, lo: string, hi: string, width = 120) {
	const steps = 40;
	const rects = Array.from({ length: steps }, (_, i) => {
		const x = (i * width) / steps;
		return `<rect x="${x.toFixed(2)}" y="0" width="${(width / steps + 0.6).toFixed(2)}" height="10" fill="${color(i / (steps - 1))}"/>`;
	}).join("");
	const title = label ? `<span>${label}</span>` : "";
	return `<span class="ramp">${title}<span class="mono">${lo}</span><svg width="${width}" height="10" aria-hidden="true">${rects}</svg><span class="mono">${hi}</span></span>`;
}
