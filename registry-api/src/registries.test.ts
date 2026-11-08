import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseNumber, REGISTRIES } from "./registries";

test("registry numbers are normalised like the Resolver does", () => {
  assert.equal(normaliseNumber(" eid-1000-0001"), "EID10000001");
  assert.equal(normaliseNumber("b1984/000101"), "B1984000101");
});

test("each registry maps to a Citizen 360 ID type", () => {
  assert.deepEqual(
    Object.values(REGISTRIES).map((r) => r.idType),
    ["NIS", "EID", "GRO_BIRTH", "PASSPORT"],
  );
});
