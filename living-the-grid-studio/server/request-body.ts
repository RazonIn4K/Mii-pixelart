export class RequestInputError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
    this.name = "RequestInputError";
  }
}

export async function readBoundedText(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new RequestInputError(413, "Request body is too large.");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best-effort once the request is already rejected.
        }
        throw new RequestInputError(413, "Request body is too large.");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

export function publicRequestError(
  error: unknown,
  fallback: string,
): { message: string; status: number } {
  return error instanceof RequestInputError
    ? { message: error.message, status: error.status }
    : { message: fallback, status: 500 };
}
