/**
 * Shared LeetCode GraphQL proxy (Node 18+). Used by Vite dev/preview and serverless (e.g. Vercel /api).
 */

const UPSTREAM_URL = "https://leetcode.com/graphql";
/** Limit request size to reduce abuse (GraphQL payloads are small). */
const MAX_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 28_000;

/**
 * @param {Buffer} bodyBuffer
 * @param {string} contentType
 */
export async function forwardToLeetCode(bodyBuffer, contentType) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": contentType || "application/json",
        Accept: "application/json",
      },
      body: bodyBuffer,
      signal: controller.signal,
    });
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type") || "application/json";
    return { status: upstream.status, contentType: ct, body: text };
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
export function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    const onData = (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        cleanup();
        const err = new Error("Payload too large");
        err.code = "PAYLOAD_TOO_LARGE";
        reject(err);
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };

    const onError = (e) => {
      cleanup();
      reject(e);
    };

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  if (!res.headersSent) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
  }
  res.end(body);
}

/**
 * Node-style HTTP handler: POST body forwarded upstream; response body/status/content-type preserved.
 * Does not forward client cookies or arbitrary headers to LeetCode.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
export async function handleNodeGraphqlProxy(req, res) {
  try {
    if (req.method !== "POST") {
      res.writeHead(405, {
        Allow: "POST",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const rawCt = req.headers["content-type"];
    const ct = typeof rawCt === "string" ? rawCt : "application/json";
    const baseCt = ct.split(";")[0].trim().toLowerCase();
    if (baseCt !== "application/json") {
      sendJson(res, 415, {
        error: "Unsupported Media Type",
        message: "Content-Type must be application/json",
      });
      return;
    }

    let body;
    try {
      body = await readRequestBody(req, MAX_BODY_BYTES);
    } catch (e) {
      if (e && e.code === "PAYLOAD_TOO_LARGE") {
        sendJson(res, 413, { error: "Payload too large" });
        return;
      }
      sendJson(res, 400, { error: "Invalid request body" });
      return;
    }

    if (!body.length) {
      sendJson(res, 400, { error: "Empty body" });
      return;
    }

    let result;
    try {
      result = await forwardToLeetCode(body, ct);
    } catch (e) {
      const aborted = e && e.name === "AbortError";
      sendJson(res, aborted ? 504 : 502, {
        error: aborted ? "Gateway timeout" : "Bad gateway",
        message: aborted
          ? "LeetCode did not respond in time"
          : "Could not reach LeetCode",
      });
      return;
    }

    res.writeHead(result.status, {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
    });
    res.end(result.body);
  } catch {
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    } else {
      res.destroy();
    }
  }
}
