import { describe, expect, it } from "vitest";

import {
  addHyphenSeparator,
  convertAccessTags,
  convertFileOverview,
  removeJsdocOnlyTags,
  removeRedundantTags,
  removeTypeBraces,
  renameTags,
  stripOptionalParamBrackets,
  stripPrefixTags,
  stripReturnPromise,
} from "@/transformer/rules";

/** Joins lines into a multi-line comment for readable fixtures. */
const comment = (...lines: string[]): string => lines.join("\n");

describe("removeTypeBraces", () => {
  it("strips a type brace from @param", () => {
    expect(removeTypeBraces.apply("/** @param {string} name - The name */")).toBe(
      "/** @param name - The name */",
    );
  });

  it("strips a type brace from @returns", () => {
    expect(removeTypeBraces.apply("/** @returns {boolean} Whether valid */")).toBe(
      "/** @returns Whether valid */",
    );
  });

  it("leaves fenced example code untouched", () => {
    const input = comment(
      "/**",
      " * @example",
      " * ```ts",
      " * @param {x} y",
      " * ```",
      " */",
    );
    expect(removeTypeBraces.apply(input)).toBe(input);
  });
});

describe("stripOptionalParamBrackets", () => {
  it("removes [name=default] brackets", () => {
    expect(
      stripOptionalParamBrackets.apply("/** @param [limit=100] - Max */"),
    ).toBe("/** @param limit - Max */");
  });

  it("removes [name] brackets", () => {
    expect(stripOptionalParamBrackets.apply("/** @param [name] - The name */")).toBe(
      "/** @param name - The name */",
    );
  });
});

describe("renameTags", () => {
  it("renames @return to @returns", () => {
    expect(renameTags.apply("/** @return the value */")).toBe(
      "/** @returns the value */",
    );
  });

  it("renames @template to @typeParam", () => {
    expect(renameTags.apply("/** @template T - The element */")).toBe(
      "/** @typeParam T - The element */",
    );
  });

  it("ignores unmapped tags", () => {
    expect(renameTags.apply("/** @remarks note */")).toBe("/** @remarks note */");
  });
});

describe("stripReturnPromise", () => {
  it("removes Promise<T> with a description", () => {
    expect(
      stripReturnPromise.apply("/** @returns Promise<User | null> - The user */"),
    ).toBe("/** @returns The user */");
  });

  it("removes a bare Promise<T> return", () => {
    const input = comment("/**", " * @returns Promise<void>", " */");
    expect(stripReturnPromise.apply(input)).toBe(
      comment("/**", " * @returns", " */"),
    );
  });
});

describe("addHyphenSeparator", () => {
  it("inserts a hyphen when missing", () => {
    expect(addHyphenSeparator.apply("/** @param name The user name */")).toBe(
      "/** @param name - The user name */",
    );
  });

  it("converts a colon separator to a hyphen", () => {
    expect(addHyphenSeparator.apply("/** @param query: string search */")).toBe(
      "/** @param query - string search */",
    );
  });

  it("leaves an existing hyphen untouched", () => {
    expect(addHyphenSeparator.apply("/** @param name - The name */")).toBe(
      "/** @param name - The name */",
    );
  });

  it("leaves a name-only @param untouched", () => {
    expect(addHyphenSeparator.apply("/** @param name */")).toBe("/** @param name */");
  });
});

describe("convertAccessTags", () => {
  it("maps @access private to @internal", () => {
    expect(convertAccessTags.apply("/** @access private */")).toBe("/** @internal */");
  });

  it("maps @access protected to @protected", () => {
    expect(convertAccessTags.apply("/** @access protected */")).toBe(
      "/** @protected */",
    );
  });

  it("maps the @private shorthand to @internal", () => {
    expect(convertAccessTags.apply("/** @private */")).toBe("/** @internal */");
  });
});

describe("convertFileOverview", () => {
  it("converts @module and drops its path", () => {
    const input = comment("/**", " * @module lib/foo", " */");
    expect(convertFileOverview.apply(input)).toBe(
      comment("/**", " * @packageDocumentation", " */"),
    );
  });

  it("converts @fileoverview and relocates its prose to a summary line", () => {
    const input = comment("/**", " * @fileoverview HTTP utilities.", " */");
    expect(convertFileOverview.apply(input)).toBe(
      comment("/**", " * @packageDocumentation", " * HTTP utilities.", " */"),
    );
  });

  it("leaves a @module line inside a fenced block untouched", () => {
    const input = comment(
      "/**",
      " * @example",
      " * ```ts",
      " * @module lib/x",
      " * ```",
      " */",
    );
    expect(convertFileOverview.apply(input)).toBe(input);
  });
});

describe("removeRedundantTags", () => {
  it("drops an @async line", () => {
    const input = comment("/**", " * Does a thing.", " * @async", " */");
    expect(removeRedundantTags.apply(input)).toBe(
      comment("/**", " * Does a thing.", " */"),
    );
  });

  it("drops @extends and @implements", () => {
    const input = comment("/**", " * @extends Base", " * @implements Runnable", " */");
    expect(removeRedundantTags.apply(input)).toBe(comment("/**", " */"));
  });
});

describe("removeJsdocOnlyTags", () => {
  it("drops a @property line", () => {
    const input = comment("/**", " * @property name - The name", " */");
    expect(removeJsdocOnlyTags.apply(input)).toBe(comment("/**", " */"));
  });

  it("drops a @typedef line", () => {
    const input = comment("/**", " * @typedef {Object} Foo", " */");
    expect(removeJsdocOnlyTags.apply(input)).toBe(comment("/**", " */"));
  });
});

describe("stripPrefixTags", () => {
  it("reduces @description to plain prose", () => {
    expect(stripPrefixTags.apply("/** @description Formats a value. */")).toBe(
      "/** Formats a value. */",
    );
  });
});

describe("fenced-code safety", () => {
  const fenced = comment(
    "/**",
    " * @example",
    " * ```ts",
    " * @param name The value",
    " * @return {x} y",
    " * @async",
    " * @description keep me",
    " * @access private",
    " * ```",
    " */",
  );

  it.each([
    ["add-hyphen-separator", addHyphenSeparator],
    ["rename-tags", renameTags],
    ["strip-return-promise", stripReturnPromise],
    ["convert-access-tags", convertAccessTags],
    ["remove-redundant-tags", removeRedundantTags],
    ["remove-jsdoc-only-tags", removeJsdocOnlyTags],
    ["strip-prefix-tags", stripPrefixTags],
    ["strip-optional-param-brackets", stripOptionalParamBrackets],
  ])("%s leaves fenced example code untouched", (_name, rule) => {
    expect(rule.apply(fenced)).toBe(fenced);
  });
});
