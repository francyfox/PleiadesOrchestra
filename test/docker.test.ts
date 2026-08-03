import { afterAll, beforeAll, expect, test } from "bun:test";
import { $ } from "bun";

const IMAGE = "albedo-llm-test";
const CONTAINER = "albedo-llm-test-container";
const HOST_PORT = 8099;
const API_KEY = "test-key";
const BASE_URL = `http://localhost:${HOST_PORT}`;

async function waitForHealth(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("llama-server did not become healthy in time");
}

beforeAll(async () => {
  await $`docker build -t ${IMAGE} ${import.meta.dir}/..`;
  await $`docker rm -f ${CONTAINER}`.nothrow();
  await $`docker run -d --name ${CONTAINER} -p ${HOST_PORT}:8080 -e LLM_API_KEY=${API_KEY} -e CTX_SIZE=512 ${IMAGE}`;
  await waitForHealth(5 * 60 * 1000);
}, 15 * 60 * 1000);

afterAll(async () => {
  await $`docker rm -f ${CONTAINER}`.nothrow();
});

test("health endpoint responds", async () => {
  const res = await fetch(`${BASE_URL}/health`);
  expect(res.status).toBe(200);
});

test("rejects requests without api key", async () => {
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  expect(res.status).toBe(401);
});

test(
  "chat completion works with api key",
  async () => {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Say OK." }],
        max_tokens: 16,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.choices?.[0]?.message?.content).toBeTruthy();
  },
  60_000,
);
