import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "./server.ts";

const client = new Client({ name: "test-client", version: "1.0.0" });

afterEach(async () => {
  await client.close();
  vi.unstubAllGlobals();
});

describe("createServer", () => {
  it.each([
    ["answer", { question: "Should I use Zod or Valibot?" }],
    ["lookup", { query: "What parameters does useState accept?" }],
  ])("aborts the Perplexity request when the client cancels a %s call", async (name, args) => {
    const requestStarted = Promise.withResolvers<undefined>();
    const requestAborted = Promise.withResolvers<unknown>();
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      requestStarted.resolve(undefined);
      const { signal } = init;
      if (!signal) {
        requestAborted.reject(new Error("fetch received no abort signal"));
        return new Promise(() => {});
      }
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          requestAborted.resolve(signal.reason);
          reject(new Error("request aborted"));
        });
      });
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createServer("test-api-key").connect(serverTransport);
    await client.connect(clientTransport);

    const cancellation = new AbortController();
    const call = client.callTool({ name, arguments: args }, undefined, {
      signal: cancellation.signal,
    });
    await requestStarted.promise;
    cancellation.abort("user interrupted");

    await expect(call).rejects.toThrow("user interrupted");
    await expect(requestAborted.promise).resolves.toBe("user interrupted");
  });
});
