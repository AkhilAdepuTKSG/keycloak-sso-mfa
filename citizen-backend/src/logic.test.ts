import { test } from "node:test";
import assert from "node:assert/strict";
import { enrolSchema } from "./nis";

test("enrolSchema accepts valid NIS registration input", () => {
  assert.equal(
    enrolSchema.safeParse({ dateOfBirth: "1990-01-01", employmentStatus: "EMPLOYED", address: "12 Main St" }).success,
    true,
  );
  assert.equal(
    enrolSchema.safeParse({ dateOfBirth: "1990-01-01", employmentStatus: "SELF_EMPLOYED" }).success,
    true,
  );
});

test("enrolSchema rejects bad input", () => {
  assert.equal(enrolSchema.safeParse({ dateOfBirth: "1990-01-01", employmentStatus: "BOGUS" }).success, false);
  assert.equal(enrolSchema.safeParse({ employmentStatus: "EMPLOYED" }).success, false); // missing dob
  assert.equal(enrolSchema.safeParse({}).success, false);
});
