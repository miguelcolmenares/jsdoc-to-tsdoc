import generated from "./generated.json";
import type { Content } from "./types";

// Written by `docsite extract` before every dev and build run. Never edit it by hand.
export const content = generated as unknown as Content;

export const { meta, collections } = content;

export * from "./types";
