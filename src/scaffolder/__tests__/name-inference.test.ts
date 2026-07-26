import { describe, expect, it } from "vitest";

import {
  inferComponentSummary,
  inferFunctionSummary,
  inferGroupSummary,
  inferHookSummary,
  inferNounSummary,
  splitIdentifier,
} from "@/scaffolder/name-inference";

describe("splitIdentifier", () => {
  it("splits camelCase and PascalCase", () => {
    expect(splitIdentifier("submitContactForm")).toEqual([
      "submit",
      "contact",
      "form",
    ]);
    expect(splitIdentifier("HeroSection")).toEqual(["hero", "section"]);
  });

  it("splits kebab-case and snake_case", () => {
    expect(splitIdentifier("lead-form-config")).toEqual([
      "lead",
      "form",
      "config",
    ]);
    expect(splitIdentifier("MAX_RETRIES")).toEqual(["max", "retries"]);
  });

  it("keeps an acronym run together", () => {
    expect(splitIdentifier("parseHTTPResponse")).toEqual([
      "parse",
      "http",
      "response",
    ]);
  });

  it("splits a digit run from a following capital", () => {
    expect(splitIdentifier("base64Encode")).toEqual(["base64", "encode"]);
  });

  it("returns an empty list for an empty name", () => {
    expect(splitIdentifier("")).toEqual([]);
  });
});

describe("inferFunctionSummary", () => {
  it("conjugates a known leading verb", () => {
    expect(inferFunctionSummary("submitContactForm")).toBe(
      "Submits the contact form.",
    );
    expect(inferFunctionSummary("getUser")).toBe("Gets the user.");
  });

  it("uses the es form after a sibilant verb", () => {
    expect(inferFunctionSummary("fetchOrders")).toBe("Fetches the orders.");
  });

  it("uses the ies form for a consonant + y verb", () => {
    expect(inferFunctionSummary("applyPatch")).toBe("Applies the patch.");
  });

  it("renders a predicate without an article", () => {
    expect(inferFunctionSummary("isValidEmail")).toBe(
      "Reports whether valid email.",
    );
    expect(inferFunctionSummary("hasAccess")).toBe("Reports whether access.");
  });

  it("falls back to a noun phrase for an unknown verb", () => {
    expect(inferFunctionSummary("salesforceWizard")).toBe("Salesforce wizard.");
  });

  it("handles a bare verb with no object", () => {
    expect(inferFunctionSummary("parse")).toBe("Parses the value.");
  });

  it("returns a TODO for an empty name", () => {
    expect(inferFunctionSummary("")).toBe("TODO(tsdoc): describe this export.");
  });
});

describe("inferComponentSummary", () => {
  it("describes what the component renders", () => {
    expect(inferComponentSummary("HeroSection")).toBe(
      "Renders the hero section.",
    );
  });
});

describe("inferHookSummary", () => {
  it("drops the use prefix", () => {
    expect(inferHookSummary("useHash")).toBe("React hook for the hash.");
  });

  it("handles a bare use name", () => {
    expect(inferHookSummary("use")).toBe("React hook.");
  });
});

describe("inferNounSummary", () => {
  it("humanizes the identifier without a redundant kind noun", () => {
    expect(inferNounSummary("LeadFormConfig")).toBe("Lead form config.");
    expect(inferNounSummary("MAX_RETRIES")).toBe("Max retries.");
  });

  it("returns a TODO for an empty name", () => {
    expect(inferNounSummary("")).toBe("TODO(tsdoc): describe this export.");
  });
});

describe("inferGroupSummary", () => {
  it("joins two names with and", () => {
    expect(inferGroupSummary(["MAX_RETRIES", "MIN_RETRIES"])).toBe(
      "Max retries and min retries.",
    );
  });

  it("comma-separates three or more names", () => {
    expect(inferGroupSummary(["alpha", "beta", "gamma"])).toBe(
      "Alpha, beta and gamma.",
    );
  });

  it("degrades to a single noun phrase for one name", () => {
    expect(inferGroupSummary(["leadStatus"])).toBe("Lead status.");
  });

  it("returns a TODO when no usable name is present", () => {
    expect(inferGroupSummary([])).toBe("TODO(tsdoc): describe this export.");
    expect(inferGroupSummary([""])).toBe("TODO(tsdoc): describe this export.");
  });
});
