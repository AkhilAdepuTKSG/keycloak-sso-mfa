import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesFormat, normalise } from "./ids";
import { nextVersion, withLock } from "./lock";

test("normalise strips separators and upper-cases; emails are lower-cased", () => {
  assert.equal(normalise("EID", " eid-1000-0001 "), "EID10000001");
  assert.equal(normalise("PASSPORT", "r 100.0001"), "R1000001");
  assert.equal(normalise("EMAIL", "Fairweather.Family@Example.ORG"), "fairweather.family@example.org");
});

test("formats tell the ID types apart", () => {
  assert.ok(matchesFormat("NIS", "4000001"));
  assert.ok(!matchesFormat("NIS", "100000001"));
  assert.ok(matchesFormat("NATIONAL_ID", "100000001"));
  assert.ok(matchesFormat("PASSPORT", "R1000001"));
  assert.ok(!matchesFormat("PASSPORT", "4000001"));
  assert.ok(matchesFormat("GRO_BIRTH", "B1984000101"));
});

test("versions never repeat", () => {
  const a = nextVersion();
  const b = nextVersion();
  assert.ok(b > a);
});

test("withLock serialises work on the same key", async () => {
  const order: string[] = [];
  const slow = withLock("NIS:4000001", async () => {
    await new Promise((r) => setTimeout(r, 30));
    order.push("first");
  });
  const fast = withLock("NIS:4000001", async () => {
    order.push("second");
  });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ["first", "second"]);
});
