import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, formatFriendCode, normalizeFriendCode, randomFriendCode } from "../../src/features/streaks/friendCodes";
describe("friend codes", () => {
  it("normalizes optional prefix, case, spaces and hyphens", () => {
    for (const value of ["CW-7K9M-2X4P", "cw 7k9m 2x4p", "7k9m2x4p", "7K9M-2X4P"]) expect(normalizeFriendCode(value)).toBe("7K9M2X4P");
    expect(formatFriendCode("7K9M2X4P")).toBe("CW-7K9M-2X4P");
  });
  it("rejects ambiguous, partial and malformed inputs", () => {
    for (const value of ["", "7K9M", "CW-7K9M-2X4O", "0K9M2X4P", "1K9M2X4P", "IK9M2X4P", "../7K9M2X4P", "7K9M2X4PP"]) expect(() => normalizeFriendCode(value)).toThrow();
  });
  it("uses eight characters from the 32-character alphabet", () => {
    expect(CODE_ALPHABET.length).toBe(32);
    for (let i = 0; i < 50; i++) expect(randomFriendCode()).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
  });
});
