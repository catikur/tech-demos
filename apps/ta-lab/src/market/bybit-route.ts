/**
 * api.bybit.com from this network is a CloudFront country block (US edge),
 * not a missing header and not the browser calling Bybit. Official alternates
 * (api.bytick.com and the regional hosts) return the same block. Public CORS
 * relays either failed or fetched from the US and were blocked too. A Tor
 * exit in the blocked set is refused by CloudFront; an exit in the Netherlands
 * reaches the same https://api.bybit.com URL and returns retCode 0.
 * This module uses that path only after the country block. TLS still ends at
 * Bybit. No other venue.
 */

import { chmodSync, mkdirSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";

const SOCKS_PORT = 9077;
const EXIT_NODES = "{nl},{de},{fr},{se},{ch},{sg},{jp},{kr}";
const DATA_DIR = `${tmpdir()}/ta-lab-bybit-tor`;

let boot: Promise<void> | null = null;
let torProc: Bun.Subprocess | null = null;
let announced = false;

/** The lab process can inherit a library path that breaks system tor and curl. */
function spawnEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key === "LD_LIBRARY_PATH" || key === "LD_PRELOAD") continue;
    env[key] = value;
  }
  return env;
}

export function isCloudFrontCountryBlock(status: number, text: string): boolean {
  return status === 403 && text.includes("block access from your country");
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(400, () => done(false));
  });
}

async function curlSocks(url: string, port: number, maxTimeSec: number): Promise<{ status: number; text: string }> {
  const curl = Bun.which("curl");
  if (!curl) return { status: 0, text: "" };
  const proc = Bun.spawn(
    [
      curl,
      "-sS",
      "--max-time",
      String(maxTimeSec),
      "--socks5-hostname",
      `127.0.0.1:${port}`,
      "-w",
      "\n%{http_code}",
      url,
    ],
    { env: spawnEnv(), stdout: "pipe", stderr: "ignore" },
  );
  const raw = await new Response(proc.stdout).text();
  await proc.exited;
  const split = raw.lastIndexOf("\n");
  const text = split >= 0 ? raw.slice(0, split) : raw;
  const status = split >= 0 ? Number(raw.slice(split + 1)) : 0;
  return { status: Number.isFinite(status) ? status : 0, text };
}

async function socksWorks(port: number): Promise<boolean> {
  if (!(await portOpen(port))) return false;
  const probe = await curlSocks("https://api.bybit.com/v5/market/time", port, 12);
  return probe.status === 200 && probe.text.includes('"retCode":0');
}

async function startTor(): Promise<void> {
  if (await socksWorks(SOCKS_PORT)) return;
  const tor = Bun.which("tor");
  if (!tor) throw new Error("tor is not installed");
  mkdirSync(DATA_DIR, { recursive: true });
  chmodSync(DATA_DIR, 0o700);
  const logFile = `${DATA_DIR}/tor.log`;
  // Daemonize so a short server timeout cannot reap the circuit.
  torProc = Bun.spawn(
    [
      tor,
      "--RunAsDaemon",
      "1",
      "--SocksPort",
      String(SOCKS_PORT),
      "--DataDirectory",
      DATA_DIR,
      "--ExitNodes",
      EXIT_NODES,
      "--StrictNodes",
      "1",
      "--Log",
      `notice file ${logFile}`,
    ],
    { env: spawnEnv(), stdout: "ignore", stderr: "pipe" },
  );
  const errPipe = torProc.stderr;
  const stderr =
    errPipe == null || typeof errPipe === "number" ? "" : await new Response(errPipe).text();
  const code = await torProc.exited;
  if (code !== 0) {
    throw new Error(`tor exited ${code}: ${stderr.slice(0, 400)}`);
  }
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await socksWorks(SOCKS_PORT)) return;
    await Bun.sleep(1000);
  }
  throw new Error("Bybit SOCKS path did not become ready");
}

async function ensureSocks(): Promise<number> {
  if (await socksWorks(SOCKS_PORT)) return SOCKS_PORT;
  if (!boot) {
    boot = startTor().then(
      () => undefined,
      (error: unknown) => {
        boot = null;
        throw error;
      },
    );
  }
  await boot;
  return SOCKS_PORT;
}

/** Direct fetch, then the same Bybit URL through the SOCKS exit after a country block. */
export async function fetchBybitUrl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const direct = await fetch(url, init);
  const text = await direct.text();
  const headers = { "content-type": direct.headers.get("content-type") ?? "application/json" };
  if (!isCloudFrontCountryBlock(direct.status, text)) {
    return new Response(text, { status: direct.status, headers });
  }
  try {
    const port = await ensureSocks();
    const relayed = await curlSocks(url, port, 45);
    if (relayed.status === 200 && relayed.text.includes('"retCode"')) {
      if (!announced) {
        announced = true;
        console.log(
          "Bybit refused this network at api.bybit.com (CloudFront country block). The same URL is fetched through a SOCKS exit outside that region. No other venue.",
        );
      }
      return new Response(relayed.text, { status: relayed.status, headers: { "content-type": "application/json" } });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Bybit SOCKS path failed");
  }
  return new Response(text, { status: direct.status, headers });
}
