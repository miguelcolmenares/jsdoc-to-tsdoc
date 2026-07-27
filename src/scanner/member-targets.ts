/**
 * The interface or type-literal members a doc comment's `@property` tags could
 * be moved onto.
 *
 * @remarks
 * `@property` is the only JSDoc tag whose removal can destroy prose: it
 * describes a member, and TypeScript has nowhere to put that description except
 * a doc comment on the member itself. Deciding whether removal is safe needs
 * the declaration below the comment, which the transformer pipeline cannot see
 * — it is handed comment text and nothing else. This module answers the
 * question from the AST, so the pipeline can be told rather than made to guess.
 *
 * @since 0.1.0
 */

import * as ts from "typescript";

/**
 * A member a `@property` description could be relocated onto.
 */
export interface MemberTarget {
  /** The member name as written in the source. */
  readonly name: string;
  /** Whether the member already carries its own `/** *\/` comment. */
  readonly hasDocComment: boolean;
  /** Offset at which a doc comment for this member must be inserted. */
  readonly insertPos: number;
  /** The member's own indentation, so an inserted comment lines up with it. */
  readonly indent: string;
}

/**
 * Reads the members a declaration exposes by name, if it has any.
 *
 * @param node - The declaration a doc comment sits on.
 * @returns The member nodes, or `undefined` when the declaration has no named
 * members to document.
 */
function membersOf(node: ts.Node): ts.NodeArray<ts.TypeElement> | undefined {
  if (ts.isInterfaceDeclaration(node)) {
    return node.members;
  }
  if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
    return node.type.members;
  }
  return undefined;
}

/**
 * Describes one member as a relocation target.
 *
 * @param member - The member node.
 * @param sourceFile - The parsed source file it belongs to.
 * @returns The target, or `undefined` for a member with no plain name (an index
 * signature, or a computed key that no `@property` tag could address).
 */
function describeMember(
  member: ts.TypeElement,
  sourceFile: ts.SourceFile,
): MemberTarget | undefined {
  const { name } = member;
  if (name === undefined || !ts.isIdentifier(name)) {
    return undefined;
  }

  const insertPos = member.getStart(sourceFile, /* includeJsDocComment */ false);
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, member.getFullStart()) ?? [];
  const hasDocComment = ranges.some((range) => {
    const text = sourceFile.text.slice(range.pos, range.end);
    return (
      range.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
      text.startsWith("/**") &&
      text !== "/**/"
    );
  });

  const lineStart = sourceFile.getLineStarts()[
    sourceFile.getLineAndCharacterOfPosition(insertPos).line
  ];
  const indent =
    lineStart === undefined
      ? ""
      : (/^[ \t]*/.exec(sourceFile.text.slice(lineStart, insertPos))?.[0] ?? "");

  return { name: name.text, hasDocComment, insertPos, indent };
}

/**
 * Maps every doc comment in a file to the members of the declaration it sits on.
 *
 * @remarks
 * Keyed by the comment's start offset, which is the same key
 * `extractJsDocComments` reports, so a caller holding a comment can look up its
 * structural target without a second parse or a positional guess.
 *
 * Leading trivia repeats on every descendant sharing a node's full start, so
 * one comment is reachable from several nodes. The first node the walk reaches
 * for a given offset is the outermost one — the declaration the comment
 * documents — and later sightings are ignored. Reversing that would resolve a
 * comment above an interface to the interface's first member.
 *
 * Comments over a declaration with no named members are absent from the map
 * rather than present and empty: "nothing to move this onto" and "everything is
 * already documented" lead to opposite decisions, and a caller must not be able
 * to confuse them.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name, used only to pick the TS/TSX dialect.
 * @returns Comment start offset to that declaration's members, in source order.
 */
export function collectMemberTargets(
  sourceText: string,
  fileName: string,
): ReadonlyMap<number, readonly MemberTarget[]> {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const targets = new Map<number, readonly MemberTarget[]>();
  const claimed = new Set<number>();

  const visit = (node: ts.Node): void => {
    const ranges =
      ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];
    for (const range of ranges) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }
      const text = sourceText.slice(range.pos, range.end);
      if (!text.startsWith("/**") || text === "/**/") {
        continue;
      }
      if (claimed.has(range.pos)) {
        continue;
      }
      claimed.add(range.pos);

      const members = membersOf(node);
      if (members === undefined) {
        continue;
      }
      targets.set(
        range.pos,
        members
          .map((member) => describeMember(member, sourceFile))
          .filter((target): target is MemberTarget => target !== undefined),
      );
    }
    node.forEachChild(visit);
  };

  // Start from the statements, not the file. `SourceFile` also reports a full
  // start of 0, so walking it first lets it claim a comment that opens the file
  // and resolve it to a node with no members — silently losing the declaration
  // the comment actually documents.
  sourceFile.forEachChild(visit);

  return targets;
}
