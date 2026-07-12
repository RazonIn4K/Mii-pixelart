import { describe, expect, it } from "vitest";

import {
  RequestInputError,
  publicRequestError,
  readBoundedText,
} from "./request-body";

describe("bounded request bodies", () => {
  it("reads a body within the byte limit", async () => {
    await expect(
      readBoundedText(
        new Request("https://example.test", {
          body: "hello",
          method: "POST",
        }),
        5,
      ),
    ).resolves.toBe("hello");
  });

  it("rejects oversized UTF-8 bodies without relying on Content-Length", async () => {
    await expect(
      readBoundedText(
        new Request("https://example.test", {
          body: "é",
          method: "POST",
        }),
        1,
      ),
    ).rejects.toMatchObject({
      message: "Request body is too large.",
      status: 413,
    });
  });

  it("rejects an oversized declared Content-Length before reading", async () => {
    const request = new Request("https://example.test", {
      body: "small",
      headers: { "Content-Length": "100" },
      method: "POST",
    });
    await expect(readBoundedText(request, 10)).rejects.toBeInstanceOf(
      RequestInputError,
    );
  });

  it("does not expose unexpected implementation errors", () => {
    expect(
      publicRequestError(new TypeError("private detail"), "Safe failure."),
    ).toEqual({ message: "Safe failure.", status: 500 });
  });
});
