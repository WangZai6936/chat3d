export const PORTAL_PUBLIC_ORIGIN: string;
export const PORTAL_DIRECT_ORIGIN: string;
export const KNOWN_DOWNLOAD_ORIGINS: readonly string[];
export const MAX_DOWNLOAD_CANDIDATES: number;
export const MIN_INSTALLER_BYTES: number;
export const MIN_PROBE_BYTES: number;
export const DOWNLOAD_PROBE_BYTES: number;
export const DOWNLOAD_PROBE_TIMEOUT_MS: number;

export function replaceDownloadOrigin(urlString: string, origin: string): string;
export function parseMirrorOrigins(value: unknown): {ok: true; origins: string[]} | {ok: false; error: string};
export function mirrorListForPublishedUrl(input: {endpoint?: string; primary?: string; extraOrigins?: string[]}): string[];
export function sameDownloadUrl(left: unknown, right: unknown): boolean;
export function platformMirrorList(raw: unknown, primary: unknown): unknown[];
export function candidateDownloadUrls(primary: unknown, mirrors?: unknown): string[];
export function installerTotalBytes(status: number, headers?: {get?: (name: string) => string | null} | Record<string, string> | null): number | null;

export interface DownloadProbeSample {
  status: number;
  bytes: number;
  elapsedMs: number;
  totalBytes?: number | null;
  contentType?: string | null;
}

export function scoreDownloadProbe(sample: DownloadProbeSample | null | undefined): {bytesPerMs: number} | null;
export function selectFastestDownloadUrl(
  candidates: readonly string[],
  probe: (url: string, timeoutMs: number) => Promise<DownloadProbeSample | null> | DownloadProbeSample | null,
  options?: {timeoutMs?: number},
): Promise<string>;
