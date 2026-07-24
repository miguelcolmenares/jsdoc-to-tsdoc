import { describe, expect, it } from "vitest";

import {
  isRemovableTag,
  JSDOC_ONLY_TAGS,
  leadingTag,
  REDUNDANT_TAGS,
  TAG_RENAMES,
} from "@/parser/tag-registry";

describe("tag-registry", () => {
  it("freezes the rename table to preserve determinism", () => {
    expect(Object.isFrozen(TAG_RENAMES)).toBe(true);
  });

  it("maps @return to @returns", () => {
    expect(TAG_RENAMES["@return"]).toBe("@returns");
  });

  describe("leadingTag", () => {
    it("extracts and lowercases the leading block tag", () => {
      expect(leadingTag("@Param name - value")).toBe("@param");
    });

    it("returns undefined for prose lines", () => {
      expect(leadingTag("Just a summary sentence.")).toBeUndefined();
    });

    it("tolerates leading whitespace", () => {
      expect(leadingTag("   @returns value")).toBe("@returns");
    });
  });

  describe("isRemovableTag", () => {
    it("is true for redundant tags", () => {
      for (const tag of REDUNDANT_TAGS) {
        expect(isRemovableTag(tag)).toBe(true);
      }
    });

    it("is true for JSDoc-only tags", () => {
      for (const tag of JSDOC_ONLY_TAGS) {
        expect(isRemovableTag(tag)).toBe(true);
      }
    });

    it("is case-insensitive", () => {
      expect(isRemovableTag("@Async")).toBe(true);
    });

    it("is false for standard TSDoc tags", () => {
      expect(isRemovableTag("@param")).toBe(false);
      expect(isRemovableTag("@remarks")).toBe(false);
    });
  });
});
