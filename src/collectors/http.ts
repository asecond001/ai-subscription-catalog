export type FetchStatus = "ok" | "challenged_or_blocked" | "unreachable";

export interface FetchOutcome {
  ok: boolean;
  status: FetchStatus;
  url: string;
  httpStatus: number | null;
  body: string | null;
  reason: string | null;
}

export type TextFetcher = (url: string) => Promise<FetchOutcome>;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024; // 4 MiB
const USER_AGENT =
  "ai-subscription-catalog/1.0 (+https://github.com/asecond001/ai-subscription-catalog)";

const BLOCKED_HTTP_STATUSES = new Set([401, 403, 429, 503]);

const CHALLENGE_MARKERS = [
  "cf-chl",
  "cf-turnstile",
  "just a moment...",
  "attention required! | cloudflare",
  "g-recaptcha",
  "hcaptcha",
  "verify you are human",
  "checking your browser",
  "enable javascript and cookies to continue",
];

export function detectChallengeBody(html: string): string | null {
  const lower = html.toLowerCase();
  for (const marker of CHALLENGE_MARKERS) {
    if (lower.includes(marker)) {
      return marker;
    }
  }
  return null;
}

async function readResponseWithLimit(
  response: Response,
  limitBytes: number
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const parsedLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(parsedLength) && parsedLength > limitBytes) {
      throw new Error(
        `Response content-length ${parsedLength} exceeds ${limitBytes} byte limit`
      );
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > limitBytes) {
      throw new Error(`Response body exceeds ${limitBytes} byte limit`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > limitBytes) {
          await reader.cancel();
          throw new Error(`Response stream exceeds ${limitBytes} byte limit`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export function createDefaultFetcher(
  customFetch: typeof fetch = fetch
): TextFetcher {
  return async (url: string): Promise<FetchOutcome> => {
    try {
      const response = await customFetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (BLOCKED_HTTP_STATUSES.has(response.status)) {
        return {
          ok: false,
          status: "challenged_or_blocked",
          url,
          httpStatus: response.status,
          body: null,
          reason: `HTTP ${response.status} blocked or rate-limited`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: "unreachable",
          url,
          httpStatus: response.status,
          body: null,
          reason: `HTTP ${response.status}`,
        };
      }

      const body = await readResponseWithLimit(response, MAX_RESPONSE_BYTES);
      const challengeMarker = detectChallengeBody(body);
      if (challengeMarker !== null) {
        return {
          ok: false,
          status: "challenged_or_blocked",
          url,
          httpStatus: response.status,
          body: null,
          reason: `Challenge marker detected (${challengeMarker})`,
        };
      }

      return {
        ok: true,
        status: "ok",
        url,
        httpStatus: response.status,
        body,
        reason: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: "unreachable",
        url,
        httpStatus: null,
        body: null,
        reason: message,
      };
    }
  };
}
