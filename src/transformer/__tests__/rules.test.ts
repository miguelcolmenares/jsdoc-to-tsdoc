import { describe, expect, it } from "vitest";

import {
  addHyphenSeparator,
  convertAccessTags,
  convertFileOverview,
  escapeBareAtSign,
  fenceExampleBlocks,
  foldDottedParam,
  removeJsdocOnlyTags,
  removeRedundantTags,
  removeTypeBraces,
  renameTags,
  stripOptionalParamBrackets,
  stripPrefixTags,
  stripReturnPromise,
} from "@/transformer/rules";
import type { Rule, RuleContext } from "@/transformer";

/** Joins lines into a multi-line comment for readable fixtures. */
const comment = (...lines: string[]): string => lines.join("\n");

/**
 * Runs a rule with the default context. Most rules read only the comment; the
 * ones that read the context take the overrides here, so the default stays the
 * conservative one every other test asserts against.
 */
const apply = (
  rule: Rule,
  text: string,
  context: Partial<RuleContext> = {},
): string => rule.apply(text, { lite: false, ...context });

describe("fenceExampleBlocks", () => {
  it("fences a body TSDoc would misparse", () => {
    const input = comment(
      "/**",
      " * @example",
      " * const r = f({ a: 1 });",
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(
      comment(
        "/**",
        " * @example",
        " * ```typescript",
        " * const r = f({ a: 1 });",
        " * ```",
        " */",
      ),
    );
  });

  // An `@` inside a word is `tsdoc-at-sign-in-word`, so an email in sample
  // code breaks the comment as surely as a brace does.
  it("fences a body whose only hazard is an at sign inside a word", () => {
    const input = comment("/**", " * @example", " * send('a@b.com')", " */");

    expect(apply(fenceExampleBlocks, input)).toContain("```typescript");
  });

  // Fencing every example would rewrite comments that were never broken. The
  // hand migration on osa-nextjs left 48 such bodies exactly as written.
  it("leaves a body TSDoc parses cleanly", () => {
    const input = comment(
      "/**",
      " * @example",
      ' * toPath("/uploads/x.png")',
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(input);
  });

  it("leaves an already fenced body alone", () => {
    const input = comment(
      "/**",
      " * @example",
      " * ```typescript",
      " * const r = f({ a: 1 });",
      " * ```",
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(input);
  });

  it("closes the fence before the blank line and the next tag", () => {
    const input = comment(
      "/**",
      " * @example",
      " * const r = f({ a: 1 });",
      " *",
      " * @returns Nothing.",
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(
      comment(
        "/**",
        " * @example",
        " * ```typescript",
        " * const r = f({ a: 1 });",
        " * ```",
        " *",
        " * @returns Nothing.",
        " */",
      ),
    );
  });

  it("fences each example in a comment that has several", () => {
    const input = comment(
      "/**",
      " * @example",
      " * f({ a: 1 })",
      " * @example",
      " * g({ b: 2 })",
      " */",
    );

    const output = apply(fenceExampleBlocks, input);

    expect(output.match(/```typescript/g)).toHaveLength(2);
    expect(output.match(/```$/gm)).toHaveLength(2);
  });

  it("leaves a comment with no example alone", () => {
    const input = comment("/**", " * @param a - The { thing }.", " */");

    expect(apply(fenceExampleBlocks, input)).toBe(input);
  });

  it("is a no-op on its own output", () => {
    const input = comment(
      "/**",
      " * @example",
      " * const r = f({ a: 1 });",
      " */",
    );
    const once = apply(fenceExampleBlocks, input);

    expect(apply(fenceExampleBlocks, once)).toBe(once);
  });

  // Caught by running the rule over this repo. `buildStub` leads its example
  // with a prose caption and fences only the code below it; wrapping that body
  // would nest a fence inside a fence and turn the sentence into code.
  it("leaves a body that fences its own code below a caption", () => {
    const input = comment(
      "/**",
      " * @example",
      " * The stub for `submitContactForm(prevState)` — one `@param` each:",
      " *",
      " * ```typescript",
      " * buildStub(submitContactForm);",
      " * ```",
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(input);
  });

  // Review round 1: `/^@[a-zA-Z]/` treated a decorator in sample code as a
  // block tag, so the body "ended" at the decorator, `last` fell below `first`,
  // and the example was skipped entirely — left unfenced, still failing check.
  it("fences an example whose code opens with a decorator", () => {
    const input = comment(
      "/**",
      " * @example",
      " * @Component({ selector: 'app-root' })",
      " * class AppComponent {}",
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(
      comment(
        "/**",
        " * @example",
        " * ```typescript",
        " * @Component({ selector: 'app-root' })",
        " * class AppComponent {}",
        " * ```",
        " */",
      ),
    );
  });

  // The terminator still has to be a terminator: a real block tag ends the body
  // and must stay outside the fence.
  it("still ends the body at a real block tag", () => {
    const input = comment(
      "/**",
      " * @example",
      " * f({ a: 1 })",
      " * @returns Nothing.",
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(
      comment(
        "/**",
        " * @example",
        " * ```typescript",
        " * f({ a: 1 })",
        " * ```",
        " * @returns Nothing.",
        " */",
      ),
    );
  });

  // An inline code span makes its content literal, so TSDoc parses it cleanly.
  // Treating it as a hazard would fence a caption that is prose, not code.
  it("ignores hazards that sit inside an inline code span", () => {
    const input = comment(
      "/**",
      " * @example",
      " * Pass `{ retries: 3 }` to the second argument.",
      " */",
    );

    expect(apply(fenceExampleBlocks, input)).toBe(input);
  });
});

describe("escapeBareAtSign", () => {
  it("backticks a whole npm scope named mid-sentence", () => {
    const input = comment(
      "/**",
      " * Install @scope/pkg from the registry.",
      " */",
    );

    expect(apply(escapeBareAtSign, input)).toBe(
      comment("/**", " * Install `@scope/pkg` from the registry.", " */"),
    );
  });

  // The dominant real-world case: a TypeScript path alias in a re-export header
  // ("import from @/lib/thing"). `@` is followed by `/`, which TSDoc reports as
  // tsdoc-at-sign-without-tag-name.
  it("backticks a TypeScript path alias mid-sentence", () => {
    const input = comment(
      "/**",
      " * New code should import from @/lib/ccds-api instead.",
      " */",
    );

    expect(apply(escapeBareAtSign, input)).toBe(
      comment(
        "/**",
        " * New code should import from `@/lib/ccds-api` instead.",
        " */",
      ),
    );
  });

  // A path alias inside quotes on a line that opens with a real block tag: the
  // opening `@deprecated` stays put, the aliases get escaped.
  it("escapes path aliases after a line-opening tag, leaving the tag intact", () => {
    const input = comment(
      "/**",
      ' * @deprecated Import from "@/types" not "@/types/common"',
      " */",
    );

    expect(apply(escapeBareAtSign, input)).toBe(
      comment(
        "/**",
        ' * @deprecated Import from "`@/types`" not "`@/types/common`"',
        " */",
      ),
    );
  });

  it("keeps a trailing sentence period outside the backticks", () => {
    const input = comment("/**", " * Use the barrel at @/lib.", " */");

    expect(apply(escapeBareAtSign, input)).toBe(
      comment("/**", " * Use the barrel at `@/lib`.", " */"),
    );
  });

  // A trailing slash is part of a path alias, not sentence punctuation, so it
  // stays inside the backticks — trimming it would corrupt the token.
  it("keeps a trailing slash inside the backticks", () => {
    const input = comment("/**", " * Files live under @/lib/ here.", " */");

    expect(apply(escapeBareAtSign, input)).toBe(
      comment("/**", " * Files live under `@/lib/` here.", " */"),
    );
  });

  it("backticks a mid-word at sign, as in an email address", () => {
    const input = comment("/**", " * Ping ops@corp for access.", " */");

    expect(apply(escapeBareAtSign, input)).toBe(
      comment("/**", " * Ping ops`@corp` for access.", " */"),
    );
  });

  it("backticks a decorator named mid-sentence", () => {
    const input = comment(
      "/**",
      " * Guarded by the @Injectable decorator.",
      " */",
    );

    expect(apply(escapeBareAtSign, input)).toBe(
      comment("/**", " * Guarded by the `@Injectable` decorator.", " */"),
    );
  });

  it("wraps only the token, never the word that follows it", () => {
    const input = comment("/**", " * Contact @support for help.", " */");

    expect(apply(escapeBareAtSign, input)).toBe(
      comment("/**", " * Contact `@support` for help.", " */"),
    );
  });

  it("leaves a real block tag that opens its line untouched", () => {
    const input = comment("/**", " * @returns the parsed value", " */");

    expect(apply(escapeBareAtSign, input)).toBe(input);
  });

  // A line-opening token is a real block tag by position — even an unknown one,
  // which may be a project custom the config legitimately defines.
  it("leaves an unknown tag that opens its line untouched", () => {
    const input = comment("/**", " * @internalNote revisit this", " */");

    expect(apply(escapeBareAtSign, input)).toBe(input);
  });

  it("leaves a standard tag mentioned mid-prose alone", () => {
    const input = comment("/**", " * See the @remarks block below.", " */");

    expect(apply(escapeBareAtSign, input)).toBe(input);
  });

  it("does not touch an at sign inside an existing code span", () => {
    const input = comment("/**", " * Use `@support` as the handle.", " */");

    expect(apply(escapeBareAtSign, input)).toBe(input);
  });

  it("does not touch an at sign inside a fenced block", () => {
    const input = comment(
      "/**",
      " * @example",
      " * ```typescript",
      " * const to = 'ops@corp';",
      " * ```",
      " */",
    );

    expect(apply(escapeBareAtSign, input)).toBe(input);
  });

  it("escapes a mid-line token while leaving the line's opening tag intact", () => {
    const input = comment(
      "/**",
      " * @remarks Reach @support for onboarding.",
      " */",
    );

    expect(apply(escapeBareAtSign, input)).toBe(
      comment("/**", " * @remarks Reach `@support` for onboarding.", " */"),
    );
  });

  it("is idempotent", () => {
    const input = comment("/**", " * Contact @support for help.", " */");
    const once = apply(escapeBareAtSign, input);

    expect(apply(escapeBareAtSign, once)).toBe(once);
  });
});

describe("foldDottedParam", () => {
  it("folds several dotted children into the parent's description", () => {
    const input = comment(
      "/**",
      " * @param params - Request parameters",
      " * @param params.endpoint - API endpoint path",
      " * @param params.method - HTTP method",
      " * @returns API response",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment(
        "/**",
        " * @param params - Request parameters (endpoint: API endpoint path, method: HTTP method)",
        " * @returns API response",
        " */",
      ),
    );
  });

  it("folds a single dotted child, preserving its description", () => {
    const input = comment(
      "/**",
      " * @param options - Query options",
      " * @param options.variables - GraphQL variables",
      " * @returns Response",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment(
        "/**",
        " * @param options - Query options (variables: GraphQL variables)",
        " * @returns Response",
        " */",
      ),
    );
  });

  it("absorbs a wrapped child description onto one folded line", () => {
    const input = comment(
      "/**",
      " * @param options - Fetch options",
      " * @param options.revalidate - ISR seconds;",
      " *   pass `0` to skip caching",
      " * @returns payload",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment(
        "/**",
        " * @param options - Fetch options (revalidate: ISR seconds; pass `0` to skip caching)",
        " * @returns payload",
        " */",
      ),
    );
  });

  it("groups children under their own parent when two objects are documented", () => {
    const input = comment(
      "/**",
      " * @param a - First",
      " * @param a.x - A x",
      " * @param b - Second",
      " * @param b.y - B y",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment(
        "/**",
        " * @param a - First (x: A x)",
        " * @param b - Second (y: B y)",
        " */",
      ),
    );
  });

  it("handles two-level nesting by keeping the full child path", () => {
    const input = comment(
      "/**",
      " * @param opts - Options",
      " * @param opts.retry.max - Max retries",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment(
        "/**",
        " * @param opts - Options (retry.max: Max retries)",
        " */",
      ),
    );
  });

  it("handles JSDoc array-element syntax on the parent", () => {
    const input = comment(
      "/**",
      " * @param items - The rows",
      " * @param items[].id - Row id",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment("/**", " * @param items - The rows (id: Row id)", " */"),
    );
  });

  it("synthesizes a parent line when only children are documented", () => {
    const input = comment(
      "/**",
      " * @param params.slug - Event slug",
      " * @returns Event data",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment(
        "/**",
        " * @param params - (slug: Event slug)",
        " * @returns Event data",
        " */",
      ),
    );
  });

  it("appends a hyphen when the parent has no description of its own", () => {
    const input = comment(
      "/**",
      " * @param params",
      " * @param params.a - First",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment("/**", " * @param params - (a: First)", " */"),
    );
  });

  // The anchor for a wrapped parent description is a continuation line, which
  // carries no ` - ` — the list must append there without a spurious separator.
  it("appends to a wrapped parent description without inserting a hyphen", () => {
    const input = comment(
      "/**",
      " * @param params - Query parameters that span",
      " *   two lines of prose",
      " * @param params.slug - Category slug",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment(
        "/**",
        " * @param params - Query parameters that span",
        " *   two lines of prose (slug: Category slug)",
        " */",
      ),
    );
  });

  it("folds a child that carries no description to its bare name", () => {
    const input = comment(
      "/**",
      " * @param params - Opts",
      " * @param params.flag",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(
      comment("/**", " * @param params - Opts (flag)", " */"),
    );
  });

  it("leaves a comment with no dotted params untouched", () => {
    const input = comment(
      "/**",
      " * @param a - First",
      " * @param b - Second",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(input);
  });

  it("does not touch a dotted param inside a fenced example", () => {
    const input = comment(
      "/**",
      " * @example",
      " * ```typescript",
      " * // @param params.endpoint - path",
      " * ```",
      " */",
    );

    expect(apply(foldDottedParam, input)).toBe(input);
  });

  it("is idempotent", () => {
    const input = comment(
      "/**",
      " * @param params - Request parameters",
      " * @param params.endpoint - API endpoint path",
      " */",
    );
    const once = apply(foldDottedParam, input);

    expect(apply(foldDottedParam, once)).toBe(once);
  });
});

describe("removeTypeBraces", () => {
  it("strips a type brace from @param", () => {
    expect(
      apply(removeTypeBraces, "/** @param {string} name - The name */"),
    ).toBe("/** @param name - The name */");
  });

  it("strips a type brace from @returns", () => {
    expect(
      apply(removeTypeBraces, "/** @returns {boolean} Whether valid */"),
    ).toBe("/** @returns Whether valid */");
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
    expect(apply(removeTypeBraces, input)).toBe(input);
  });
});

describe("stripOptionalParamBrackets", () => {
  it("removes [name=default] brackets", () => {
    expect(
      apply(stripOptionalParamBrackets, "/** @param [limit=100] - Max */"),
    ).toBe("/** @param limit - Max */");
  });

  it("removes [name] brackets", () => {
    expect(
      apply(stripOptionalParamBrackets, "/** @param [name] - The name */"),
    ).toBe("/** @param name - The name */");
  });
});

describe("renameTags", () => {
  it("renames @return to @returns", () => {
    expect(apply(renameTags, "/** @return the value */")).toBe(
      "/** @returns the value */",
    );
  });

  it("renames @template to @typeParam", () => {
    expect(apply(renameTags, "/** @template T - The element */")).toBe(
      "/** @typeParam T - The element */",
    );
  });

  it("ignores unmapped tags", () => {
    expect(apply(renameTags, "/** @remarks note */")).toBe(
      "/** @remarks note */",
    );
  });
});

describe("stripReturnPromise", () => {
  it("removes Promise<T> with a description", () => {
    expect(
      apply(
        stripReturnPromise,
        "/** @returns Promise<User | null> - The user */",
      ),
    ).toBe("/** @returns The user */");
  });

  it("removes a bare Promise<T> return", () => {
    const input = comment("/**", " * @returns Promise<void>", " */");
    expect(apply(stripReturnPromise, input)).toBe(
      comment("/**", " * @returns", " */"),
    );
  });

  it("handles nested generics without leaving a stray angle bracket", () => {
    expect(
      apply(
        stripReturnPromise,
        "/** @returns Promise<Array<User>> - the users */",
      ),
    ).toBe("/** @returns the users */");
    const bare = comment(
      "/**",
      " * @returns Promise<Map<string, User>>",
      " */",
    );
    expect(apply(stripReturnPromise, bare)).toBe(
      comment("/**", " * @returns", " */"),
    );
  });
});

describe("addHyphenSeparator", () => {
  it("inserts a hyphen when missing", () => {
    expect(apply(addHyphenSeparator, "/** @param name The user name */")).toBe(
      "/** @param name - The user name */",
    );
  });

  it("converts a colon separator to a hyphen", () => {
    expect(
      apply(addHyphenSeparator, "/** @param query: string search */"),
    ).toBe("/** @param query - string search */");
  });

  it("leaves an existing hyphen untouched", () => {
    expect(apply(addHyphenSeparator, "/** @param name - The name */")).toBe(
      "/** @param name - The name */",
    );
  });

  it("leaves a name-only @param untouched", () => {
    expect(apply(addHyphenSeparator, "/** @param name */")).toBe(
      "/** @param name */",
    );
  });
});

describe("convertAccessTags", () => {
  it("maps @access private to @internal", () => {
    expect(apply(convertAccessTags, "/** @access private */")).toBe(
      "/** @internal */",
    );
  });

  it("maps @access protected to @protected", () => {
    expect(apply(convertAccessTags, "/** @access protected */")).toBe(
      "/** @protected */",
    );
  });

  it("maps the @private shorthand to @internal", () => {
    expect(apply(convertAccessTags, "/** @private */")).toBe(
      "/** @internal */",
    );
  });
});

describe("convertFileOverview", () => {
  it("converts @module and drops its path", () => {
    const input = comment("/**", " * @module lib/foo", " */");
    expect(apply(convertFileOverview, input)).toBe(
      comment("/**", " * @packageDocumentation", " */"),
    );
  });

  it("converts @fileoverview and relocates its prose to a summary line", () => {
    const input = comment("/**", " * @fileoverview HTTP utilities.", " */");
    expect(apply(convertFileOverview, input)).toBe(
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
    expect(apply(convertFileOverview, input)).toBe(input);
  });

  it("expands a single-line @fileoverview into a multi-line comment", () => {
    expect(
      apply(convertFileOverview, "/** @fileoverview HTTP utilities. */"),
    ).toBe(
      comment("/**", " * @packageDocumentation", " * HTTP utilities.", " */"),
    );
  });

  it("emits @packageDocumentation once when @fileoverview precedes @module", () => {
    const input = comment(
      "/**",
      " * @fileoverview HTTP utilities.",
      " * @module lib/http",
      " */",
    );
    expect(apply(convertFileOverview, input)).toBe(
      comment("/**", " * @packageDocumentation", " * HTTP utilities.", " */"),
    );
  });

  it("keeps the prose when @module precedes @fileoverview", () => {
    const input = comment(
      "/**",
      " * @module lib/http",
      " * @fileoverview HTTP utilities.",
      " */",
    );
    expect(apply(convertFileOverview, input)).toBe(
      comment("/**", " * @packageDocumentation", " * HTTP utilities.", " */"),
    );
  });

  it("does not add a second tag when @packageDocumentation is already present", () => {
    const input = comment(
      "/**",
      " * @packageDocumentation",
      " * HTTP utilities.",
      " * @module lib/http",
      " */",
    );
    expect(apply(convertFileOverview, input)).toBe(
      comment("/**", " * @packageDocumentation", " * HTTP utilities.", " */"),
    );
  });

  it("still converts when the only @packageDocumentation is example text", () => {
    const input = comment(
      "/**",
      " * @module lib/http",
      " * @example",
      " * ```ts",
      " * @packageDocumentation",
      " * ```",
      " */",
    );
    expect(apply(convertFileOverview, input)).toBe(
      comment(
        "/**",
        " * @packageDocumentation",
        " * @example",
        " * ```ts",
        " * @packageDocumentation",
        " * ```",
        " */",
      ),
    );
  });

  it("drops a repeated @module without leaving an empty tag behind", () => {
    const input = comment(
      "/**",
      " * @module lib/http",
      " * @module lib/http/client",
      " */",
    );
    expect(apply(convertFileOverview, input)).toBe(
      comment("/**", " * @packageDocumentation", " */"),
    );
  });
});

describe("removeRedundantTags", () => {
  it("drops an @async line", () => {
    const input = comment("/**", " * Does a thing.", " * @async", " */");
    expect(apply(removeRedundantTags, input)).toBe(
      comment("/**", " * Does a thing.", " */"),
    );
  });

  it("drops @extends and @implements", () => {
    const input = comment(
      "/**",
      " * @extends Base",
      " * @implements Runnable",
      " */",
    );
    expect(apply(removeRedundantTags, input)).toBe(comment("/**", " */"));
  });
});

describe("removeJsdocOnlyTags", () => {
  it("drops a @property line the caller authorized", () => {
    const input = comment("/**", " * @property name - The name", " */");
    expect(
      apply(removeJsdocOnlyTags, input, { removableProperties: ["name"] }),
    ).toBe(comment("/**", " */"));
  });

  // The description on a @property is its only copy, and TSDoc has no such
  // tag. Unauthorized, the prose stays in the comment as a list item: keeping
  // the tag verbatim would survive `convert` only to fail `check` with
  // tsdoc-undefined-tag.
  it("demotes a @property the caller said nothing about to prose", () => {
    const input = comment("/**", " * @property name - The name", " */");
    const demoted = comment("/**", " * - `name` — The name", " */");
    expect(apply(removeJsdocOnlyTags, input)).toBe(demoted);
    expect(apply(removeJsdocOnlyTags, input, { removableProperties: [] })).toBe(
      demoted,
    );
  });

  it("deletes a @property carrying no description either way", () => {
    const input = comment("/**", " * @property name", " */");
    expect(apply(removeJsdocOnlyTags, input)).toBe(comment("/**", " */"));
  });

  it("authorizes each @property by name, not the tag as a family", () => {
    const input = comment(
      "/**",
      " * @property kept - Still needed",
      " * @property gone - Already on the member",
      " */",
    );
    expect(
      apply(removeJsdocOnlyTags, input, { removableProperties: ["gone"] }),
    ).toBe(comment("/**", " * - `kept` — Still needed", " */"));
  });

  // A wrapped description must leave with its tag; the tail alone would read as
  // an unattributed sentence in the summary.
  it("removes the continuation lines of a @property it drops", () => {
    const input = comment(
      "/**",
      " * @property backgroundImage - Proxied URL for the banner",
      " *   background image, resolved at build time",
      " * @property height - Banner height",
      " */",
    );
    expect(
      apply(removeJsdocOnlyTags, input, {
        removableProperties: ["backgroundImage"],
      }),
    ).toBe(comment("/**", " * - `height` — Banner height", " */"));
  });

  // A wrapped description that cannot move is folded onto one list item rather
  // than left as a bullet followed by a dangling continuation line.
  it("folds a wrapped description it demotes", () => {
    const input = comment(
      "/**",
      " * @property backgroundImage - Proxied URL for the banner",
      " *   background image, resolved at build time",
      " */",
    );
    expect(apply(removeJsdocOnlyTags, input)).toBe(
      comment(
        "/**",
        " * - `backgroundImage` — Proxied URL for the banner background image, resolved at build time",
        " */",
      ),
    );
  });

  // The regression this pins: a name spelling the reader does not return is a
  // description the rule would delete through the JSDoc-only branch.
  it("preserves a description whose name uses a non-identifier spelling", () => {
    const input = comment(
      "/**",
      " * @property ['foo-bar'] - Still real documentation",
      " */",
    );
    expect(apply(removeJsdocOnlyTags, input)).toBe(
      comment("/**", " * - `foo-bar` \u2014 Still real documentation", " */"),
    );
  });

  it("keeps prose from a tag that names nothing, without a bare list item", () => {
    const input = comment("/**", " * @property - Just a description", " */");
    expect(apply(removeJsdocOnlyTags, input)).toBe(
      comment("/**", " * Just a description", " */"),
    );
  });

  // A mid-line tag has no unambiguous end, so the reader skips it. It must then
  // survive rather than fall through to the blanket JSDoc-only deletion.
  it("never deletes a @property the reader did not account for", () => {
    const input = "/** Summary. @property id - The id. */";
    expect(apply(removeJsdocOnlyTags, input)).toBe(input);
  });

  it("drops a @typedef line", () => {
    const input = comment("/**", " * @typedef {Object} Foo", " */");
    expect(apply(removeJsdocOnlyTags, input)).toBe(comment("/**", " */"));
  });
});

describe("stripPrefixTags", () => {
  it("reduces @description to plain prose", () => {
    expect(apply(stripPrefixTags, "/** @description Formats a value. */")).toBe(
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
    expect(apply(rule, fenced)).toBe(fenced);
  });
});
