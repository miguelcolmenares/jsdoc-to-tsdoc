/**
 * Enumeration of an interface's (or type-literal alias's) members as
 * individually documentable declarations, for `scaffold --members`.
 *
 * @remarks
 * `member-targets.ts` answers a different question: given a comment that
 * already exists above a declaration, which of its members could a
 * `@property` tag's description be *relocated* onto? That module is keyed by
 * the comment's position, so a declaration with no comment at all — the
 * common case `scaffold` runs against — has nothing to key by.
 *
 * This module instead starts from the declaration itself and lists every
 * member as an insertion target of its own, whether or not the declaration
 * (or any member) already carries documentation. It reuses `member-targets.ts`'s
 * {@link membersOf} and {@link keyOf} for "what are the members" and "what name
 * would address one", and `insertion-location.ts`'s {@link locateInsertion} /
 * {@link readLeadingComment} for "where does a comment go" — the same
 * primitives `export-inventory.ts` uses for a declaration's own header, applied
 * one level down.
 *
 * @since 0.3.0
 */

import * as ts from "typescript";

import {
  hasReturnValue,
  readParameters,
  type ExportParameter,
} from "@/scanner/declaration-classifier";
import {
  locateInsertion,
  readLeadingComment,
} from "@/scanner/insertion-location";
import { keyOf, membersOf } from "@/scanner/member-targets";

/**
 * One interface or type-literal member, described as an individually
 * documentable declaration.
 */
export interface MemberDeclaration {
  /** The member name, as a `@property` tag would address it. */
  readonly name: string;
  /** Whether the member already carries its own `/** *\/` doc comment. */
  readonly hasDocComment: boolean;
  /** Offset at which a doc comment for this member must be inserted. */
  readonly insertPos: number;
  /** Offset at which the replaced span ends (see {@link locateInsertion}). */
  readonly insertEnd: number;
  /** The member's own indentation, so an inserted comment lines up with it. */
  readonly indent: string;
  /** Whether the member is the first thing on its line. */
  readonly ownsLine: boolean;
  /** 1-based line number of the member, for reporting. */
  readonly line: number;
  /**
   * Whether the member's declared type is itself callable — a method
   * signature (`onSubmit(data: FormData): void`) or a property typed as a
   * function (`onSubmit: (data: FormData) => void`).
   *
   * @remarks
   * Read from syntax alone, never from what the name suggests: a callback
   * prop gets `@param`/`@returns` tags the same way a function declaration
   * does, and a plain data property never does, regardless of what either is
   * named.
   */
  readonly isFunctionLike: boolean;
  /** Parameters, when {@link isFunctionLike} is `true`. */
  readonly parameters: readonly ExportParameter[];
  /** Whether the member's call signature returns a value. */
  readonly hasReturnValue: boolean;
}

/**
 * Reads a member's callable signature, if its declared type has one.
 *
 * @param member - The member to inspect.
 * @returns The signature node to read parameters and a return type from, or
 * `undefined` when the member is a plain data property.
 */
function signatureOf(
  member: ts.TypeElement,
): ts.FunctionTypeNode | ts.MethodSignature | undefined {
  if (ts.isMethodSignature(member)) {
    return member;
  }
  if (
    ts.isPropertySignature(member) &&
    member.type !== undefined &&
    ts.isFunctionTypeNode(member.type)
  ) {
    return member.type;
  }
  return undefined;
}

/**
 * Describes one member as a documentable declaration.
 *
 * @param member - The member node.
 * @param sourceFile - The parsed source file it belongs to.
 * @returns The declaration, or `undefined` for a member no `@property` tag
 * could address — an index signature, or a computed key that is not a
 * literal (see {@link keyOf}).
 */
function describeMember(
  member: ts.TypeElement,
  sourceFile: ts.SourceFile,
): MemberDeclaration | undefined {
  const name = keyOf(member.name);
  if (name === undefined) {
    return undefined;
  }

  const { insertPos, insertEnd, indent, line, ownsLine } = locateInsertion(
    sourceFile,
    member,
  );
  const signature = signatureOf(member);

  return {
    name,
    hasDocComment: readLeadingComment(sourceFile, member)?.kind === "doc",
    insertPos,
    insertEnd,
    indent,
    ownsLine,
    line,
    isFunctionLike: signature !== undefined,
    parameters: signature ? readParameters(signature) : [],
    hasReturnValue: signature ? hasReturnValue(signature) : false,
  };
}

/**
 * Enumerates the members of one interface or type-literal alias as
 * individually documentable declarations.
 *
 * @param statement - The interface or type-alias declaration to inspect —
 * always a node `describeStatement` classified `"interface"` or
 * `"type-alias"`.
 * @param sourceFile - The parsed source file the statement belongs to.
 * @returns The declaration's members, in source order. Empty when the
 * declaration has no members, or none can be addressed by name (an interface
 * of nothing but index signatures, or a non-object-literal type alias).
 */
export function collectMemberDeclarations(
  statement: ts.Node,
  sourceFile: ts.SourceFile,
): readonly MemberDeclaration[] {
  const members = membersOf(statement);
  if (members === undefined) {
    return [];
  }
  return members
    .map((member) => describeMember(member, sourceFile))
    .filter((member): member is MemberDeclaration => member !== undefined);
}
