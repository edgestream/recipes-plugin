import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

export interface HostedFetchPolicyOptions {
  readonly allowedHosts: readonly string[];
  /** Test-only direct imports may use any public hostname. */
  readonly allowAnyPublicHost?: boolean;
  readonly account: string;
  readonly maxRequestsPerAccount?: number;
  readonly maxRequestsGlobal?: number;
  readonly maxConcurrentPerAccount?: number;
  readonly maxConcurrentGlobal?: number;
  readonly lookup?: (host: string) => Promise<readonly { address: string; family: number }[]>;
  /** Deterministic-test transport; production always uses the pinned socket client. */
  readonly transport?: typeof fetch;
}

/**
 * Hosted-only HTTP client. It resolves once, rejects non-public results and pins
 * that exact address in the socket lookup callback, closing the DNS rebinding gap.
 */
export class HostedFetchPolicy {
  readonly #allowedHosts: ReadonlySet<string>;
  readonly #allowAnyPublicHost: boolean;
  readonly #account: string;
  readonly #lookup: NonNullable<HostedFetchPolicyOptions["lookup"]>;
  readonly #transport: typeof fetch | undefined;
  readonly #limits: Required<Omit<HostedFetchPolicyOptions, "allowedHosts" | "allowAnyPublicHost" | "account" | "lookup" | "transport">>;
  static #accounts = new Map<string, { requests: number; active: number }>();
  static #global = { requests: 0, active: 0 };

  constructor(options: HostedFetchPolicyOptions) {
    this.#allowedHosts = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
    this.#allowAnyPublicHost = options.allowAnyPublicHost ?? false;
    this.#account = options.account;
    this.#lookup = options.lookup ?? (async (host) => dnsLookup(host, { all: true, verbatim: true }));
    this.#transport = options.transport;
    this.#limits = {
      maxRequestsPerAccount: options.maxRequestsPerAccount ?? 30,
      maxRequestsGlobal: options.maxRequestsGlobal ?? 300,
      maxConcurrentPerAccount: options.maxConcurrentPerAccount ?? 2,
      maxConcurrentGlobal: options.maxConcurrentGlobal ?? 20,
    };
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input);
    this.assertUrl(url);
    const addresses = await this.#lookup(url.hostname);
    if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw new TypeError("Recipe source address is not public.");
    const selected = addresses[0]!;
    this.acquire();
    try {
      if (this.#transport) {
        const response = await this.#transport(url, { ...init, headers: scrubHeaders(init?.headers) });
        this.release();
        return response;
      }
      return await this.request(url, selected, init);
    } catch (error) {
      this.release();
      throw error;
    }
  };

  private assertUrl(url: URL): void {
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || (url.port !== "" && url.port !== (url.protocol === "https:" ? "443" : "80")) || (!this.#allowAnyPublicHost && !this.#allowedHosts.has(url.hostname.toLowerCase()))) {
      throw new TypeError("Hosted recipe imports require an allowed public HTTP(S) URL.");
    }
  }

  private acquire(): void {
    const account = HostedFetchPolicy.#accounts.get(this.#account) ?? { requests: 0, active: 0 };
    if (account.requests >= this.#limits.maxRequestsPerAccount || HostedFetchPolicy.#global.requests >= this.#limits.maxRequestsGlobal) throw new Error("Hosted recipe request budget exhausted.");
    if (account.active >= this.#limits.maxConcurrentPerAccount || HostedFetchPolicy.#global.active >= this.#limits.maxConcurrentGlobal) throw new Error("Hosted recipe request concurrency limit reached.");
    account.requests++;
    account.active++;
    HostedFetchPolicy.#accounts.set(this.#account, account);
    HostedFetchPolicy.#global.requests++;
    HostedFetchPolicy.#global.active++;
  }

  private release(): void {
    const account = HostedFetchPolicy.#accounts.get(this.#account);
    if (account) account.active--;
    HostedFetchPolicy.#global.active--;
  }

  private request(url: URL, address: { address: string; family: number }, init?: RequestInit): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const headers = scrubHeaders(init?.headers);
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        method: init?.method ?? "GET",
        headers: Object.fromEntries(headers),
        signal: init?.signal ?? undefined,
        // Node 24 asks custom DNS resolvers for all addresses. In that mode the
        // callback must receive an address array; returning the legacy scalar
        // form makes Node attempt to parse an undefined address.
        lookup: (_host, options, callback) => options.all
          ? callback(null, [address])
          : callback(null, address.address, address.family),
      }, (response) => {
        const decoded = decode(response);
        const responseHeaders = new Headers(response.headers as Record<string, string>);
        responseHeaders.delete("content-encoding"); responseHeaders.delete("content-length");
        let released = false;
        const release = () => { if (!released) { released = true; this.release(); } };
        decoded.once("end", release).once("error", release).once("close", release);
        resolve(new Response(Readable.toWeb(decoded) as ReadableStream, { status: response.statusCode ?? 500, ...(response.statusMessage === undefined ? {} : { statusText: response.statusMessage }), headers: responseHeaders }));
      });
      request.once("error", reject);
      if (init?.body) request.end(init.body as never); else request.end();
    });
  }
}

function scrubHeaders(value: HeadersInit | undefined): Headers {
  const headers = new Headers(value);
  headers.delete("authorization"); headers.delete("cookie"); headers.delete("proxy-authorization");
  return headers;
}

function decode(response: IncomingMessage): Readable {
  const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "gzip") return response.pipe(createGunzip());
  if (encoding === "deflate") return response.pipe(createInflate());
  if (encoding === "br") return response.pipe(createBrotliDecompress());
  return response;
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return isPublicV4(address);
  if (isIP(address) !== 6) return false;
  const value = ipv6Value(address);
  if (value === undefined) return false;
  // IPv4-compatible and IPv4-mapped IPv6 must receive exactly the IPv4 policy.
  if (value <= 0xffffffffn || (value >> 32n) === 0xffffn) return isPublicV4(`${Number((value >> 24n) & 255n)}.${Number((value >> 16n) & 255n)}.${Number((value >> 8n) & 255n)}.${Number(value & 255n)}`);
  return !inV6(value, 0n, 128) && !inV6(value, 1n, 128) && !inV6(value, 0xfe80n << 112n, 10) && !inV6(value, 0xfc00n << 112n, 7) && !inV6(value, 0xff00n << 112n, 8) && !inV6(value, 0x20010db8n << 96n, 32);
}

function isPublicV4(address: string): boolean {
  const [a = -1, b = -1, c = -1] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113) || a >= 224);
}
function ipv6Value(value: string): bigint | undefined {
  const [left, right = ""] = value.toLowerCase().split("::");
  const leftParts = left ? left.split(":") : []; const rightParts = right ? right.split(":") : [];
  const parts = [...leftParts, ...Array(Math.max(0, 8 - leftParts.length - rightParts.length)).fill("0"), ...rightParts];
  if (parts.length !== 8) return undefined;
  try { return parts.reduce((result, part) => (result << 16n) + BigInt(`0x${part || "0"}`), 0n); } catch { return undefined; }
}
function inV6(value: bigint, prefix: bigint, bits: number): boolean { return (value >> BigInt(128 - bits)) === (prefix >> BigInt(128 - bits)); }
