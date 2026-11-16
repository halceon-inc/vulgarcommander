export type GlobeStatus = {
	text: string;
	showReset: boolean;
};

export const IDLE_HINT = "Click anywhere on the globe to see its fire history";

let status: GlobeStatus = { text: IDLE_HINT, showReset: false };
let hexOpen = false;
let vignetteClose = false;

const statusListeners = new Set<(status: GlobeStatus) => void>();
const hexListeners = new Set<(open: boolean) => void>();
const vignetteListeners = new Set<(close: boolean) => void>();
const resetListeners = new Set<() => void>();

export function setStatus(text: string, showReset = status.showReset) {
	status = { text, showReset };
	for (const listener of statusListeners) listener(status);
}

export function watchStatus(listener: (status: GlobeStatus) => void) {
	statusListeners.add(listener);
	listener(status);
}

export function setHexOpen(open: boolean) {
	hexOpen = open;
	for (const listener of hexListeners) listener(open);
}

export function watchHex(listener: (open: boolean) => void) {
	hexListeners.add(listener);
	listener(hexOpen);
}

export function setVignetteClose(close: boolean) {
	vignetteClose = close;
	for (const listener of vignetteListeners) listener(close);
}

export function watchVignette(listener: (close: boolean) => void) {
	vignetteListeners.add(listener);
	listener(vignetteClose);
}

export function requestReset() {
	for (const listener of resetListeners) listener();
}

export function onReset(listener: () => void) {
	resetListeners.add(listener);
}
