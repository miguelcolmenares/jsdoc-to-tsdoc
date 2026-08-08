/**
 * `committer` domain — the per-file git commit flow for `--commit-per-file`.
 *
 * @remarks
 * Like `prompter`, `reporter` and `writer`, this domain renders effects for the
 * CLI (here, git commits) and is deliberately absent from the package's root
 * library barrel: a library consumer drives its own version control. The commit
 * message builders are pure; {@link ensureCommittable} and {@link commitFile}
 * are the git-touching effects the commands inject.
 *
 * @packageDocumentation
 * @since 0.1.0
 */

export { commitFile, ensureCommittable } from "@/committer/git";
export {
  convertCommitMessage,
  scaffoldCommitMessage,
} from "@/committer/messages";
