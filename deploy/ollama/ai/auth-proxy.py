#!/usr/bin/env python3
"""Bearer-token gate in front of the local Ollama server."""

import asyncio
import os

TOKEN = os.environ.get("OLLAMA_TOKEN", "")
BIND = os.environ.get("OLLAMA_BIND", "127.0.0.1")
PORT = int(os.environ.get("OLLAMA_PROXY_PORT", "11434"))
UPSTREAM_HOST = os.environ.get("OLLAMA_UPSTREAM_HOST", "127.0.0.1")
UPSTREAM_PORT = int(os.environ.get("OLLAMA_UPSTREAM_PORT", "11434"))
EXPECTED = f"Bearer {TOKEN}"
MAX_HEADER = 64 * 1024


async def read_headers(reader: asyncio.StreamReader) -> bytes | None:
	buf = b""
	while b"\r\n\r\n" not in buf:
		chunk = await reader.read(4096)
		if not chunk:
			return None
		buf += chunk
		if len(buf) > MAX_HEADER:
			return b""
	return buf


def authorized(raw: bytes) -> bool:
	header = raw.split(b"\r\n\r\n", 1)[0].decode("iso-8859-1", "replace")
	found = []
	for line in header.split("\r\n")[1:]:
		name, sep, value = line.partition(":")
		if sep and name.lower() == "authorization":
			found.append(value.strip())
	return found == [EXPECTED]


def rewrite_host(raw: bytes) -> bytes:
	header, _, rest = raw.partition(b"\r\n\r\n")
	lines = header.decode("iso-8859-1").split("\r\n")
	kept = [line for line in lines if not line.lower().startswith("host:")]
	kept.append(f"Host: {UPSTREAM_HOST}:{UPSTREAM_PORT}")
	return ("\r\n".join(kept) + "\r\n\r\n").encode("iso-8859-1") + rest


async def pipe(src: asyncio.StreamReader, dst: asyncio.StreamWriter) -> None:
	try:
		while True:
			chunk = await src.read(65536)
			if not chunk:
				break
			dst.write(chunk)
			await dst.drain()
	except (ConnectionError, asyncio.IncompleteReadError):
		pass
	try:
		dst.close()
	except Exception:
		pass


async def refuse(writer: asyncio.StreamWriter) -> None:
	body = b"unauthorized\n"
	writer.write(
		b"HTTP/1.1 401 Unauthorized\r\n"
		b"Content-Type: text/plain\r\n"
		b"Content-Length: " + str(len(body)).encode() + b"\r\n"
		b"Connection: close\r\n\r\n" + body
	)
	await writer.drain()


async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
	try:
		raw = await asyncio.wait_for(read_headers(reader), 15)
		if not raw or not authorized(raw):
			await refuse(writer)
			return
		upstream_reader, upstream_writer = await asyncio.open_connection(UPSTREAM_HOST, UPSTREAM_PORT)
		upstream_writer.write(rewrite_host(raw))
		await upstream_writer.drain()
		await asyncio.gather(pipe(reader, upstream_writer), pipe(upstream_reader, writer))
	except Exception:
		pass
	finally:
		try:
			writer.close()
		except Exception:
			pass


async def main() -> None:
	if len(TOKEN) < 16:
		raise SystemExit("OLLAMA_TOKEN must be set")
	server = await asyncio.start_server(handle, BIND, PORT)
	async with server:
		await server.serve_forever()


if __name__ == "__main__":
	asyncio.run(main())
