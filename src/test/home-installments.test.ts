import { describe, expect, it } from "vitest";
import { installmentAmount } from "@/lib/utils";

describe("Home showcase installments", () => {
  it("splits a 2490 price into six installments of 415", () => {
    expect(installmentAmount(2490)).toBe(415);
  });
});
