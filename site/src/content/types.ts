// The content contract (content.v1) between `docsite extract` and the generic pages. This file is
// the canonical definition: the CLI imports these types from here and schema/content.v1.schema.json
// mirrors them, with a test keeping the two in step.

/** Tint of a badge or group chip. Mirrors `BadgeTone` in `@/lib/tone`. */
export type Tone = "blue" | "teal" | "amber" | "violet" | "rose" | "neutral";

/** A small labelled pill shown on an item's card and detail page. */
export interface Badge {
  label: string;
  tone?: Tone;
}

/** A named group within a collection and the tone its chip and badges use. */
export interface Group {
  name: string;
  tone: Tone;
}

/** A JSON Schema property, as far as `SchemaTable` renders it. */
export interface ParamProperty {
  type?: string | string[];
  description?: string;
  enum?: (string | number | boolean)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  items?: ParamProperty;
}

/** Parameters of an item, as a JSON Schema object. */
export interface Params {
  properties?: Record<string, ParamProperty>;
  required?: string[];
}

/** One documented thing: a skill, a tool, a component, a document. */
export interface Item {
  slug: string;
  name: string;
  description: string;
  group?: string;
  /** Markdown, rendered on the detail page. */
  body?: string;
  badges?: Badge[];
  /** Key and value pairs shown in the detail page's metadata card. Scalars only. */
  meta?: Record<string, string | number | boolean | null>;
  params?: Params;
}

/** A list of items of one kind, which becomes an index page and a detail route. */
export interface Collection {
  id: string;
  label: string;
  singular: string;
  description?: string;
  groups?: Group[];
  items: Item[];
}

/** A link shown in the site's footer, to a page outside the site. */
export interface MetaLink {
  label: string;
  href: string;
}

/** Facts about the documented project. */
export interface ContentMeta {
  name: string;
  title?: string;
  version: string;
  description: string;
  repository?: string;
  homepage?: string;
  license?: string;
  installCommand?: string;
  /** Footer links to pages outside the site: the license, how to contribute, where to report an issue. */
  links?: MetaLink[];
  /** Free-form usage notes published by the source, for example an MCP server's instructions. */
  instructions?: string;
}

/** The whole document written to `src/content/generated.json`. */
export interface Content {
  schemaVersion: 1;
  generatedAt: string;
  meta: ContentMeta;
  /** Items per collection id. */
  counts: Record<string, number>;
  collections: Collection[];
}
