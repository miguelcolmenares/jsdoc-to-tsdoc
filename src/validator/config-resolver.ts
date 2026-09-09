/**
 * Nearest-ancestor `tsdoc.json` resolution for a `check` run.
 *
 * @remarks
 * A monorepo can have a `tsdoc.json` per package — different custom tags,
 * different scopes — rather than the single project-root file every command
 * assumed before this module existed. This resolves, for each file `check`
 * validates, which `tsdoc.json` applies to it: walk up from the file's own
 * directory toward the project root, the same nearest-ancestor model ESLint's
 * flat config and TypeScript's `tsconfig.json` both use, and use the first
 * `tsdoc.json` found. The root itself is the boundary — the walk never
 * continues past it — so a file outside every package still resolves to the
 * project's own config exactly as {@link createTsdocValidator} resolved it
 * before per-file resolution existed.
 *
 * A project with a single root `tsdoc.json` and no nested ones resolves every
 * file to that same root config on the first walk, and every other file in
 * the same directory then hits the cache — the identical validator instance,
 * built once, that {@link createTsdocValidator} would have produced for the
 * whole run. Both the walk and the built validator are cached so a repo with
 * hundreds of files under one config pays the filesystem cost once per
 * directory, not once per file.
 *
 * @since 0.3.0
 */

import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createTsdocValidator,
  type TsdocValidator,
} from "@/validator/tsdoc-validator";

/**
 * Resolves, then caches, the {@link TsdocValidator} that applies to each file
 * under one project root.
 *
 * @remarks
 * Built once per `check` run via {@link createTsdocValidatorResolver} and
 * reused across every file the run inspects. Never shared across runs — the
 * cache assumes the filesystem does not change out from under it, which holds
 * for the lifetime of a single command invocation and not beyond.
 */
export interface TsdocValidatorResolver {
  /**
   * Returns the validator that applies to `filePath`.
   *
   * @remarks
   * Resolution walks up from `filePath`'s own directory toward the project
   * root, returning the validator built from the nearest ancestor directory
   * that contains a `tsdoc.json`. When none is found by the time the walk
   * reaches the root, the root's own validator is returned — present or
   * absent `tsdoc.json` alike — which is the single-config behavior this
   * resolver must reproduce exactly when a project has no nested configs.
   *
   * @param filePath - Absolute path of the file about to be validated, in the
   * same form as `root` was given to {@link createTsdocValidatorResolver}.
   * Only its directory is used; the file need not exist yet.
   * @returns The resolved validator, built at most once per distinct
   * configuration directory for the lifetime of this resolver.
   */
  forFile(filePath: string): Promise<TsdocValidator>;

  /**
   * Returns the validator that applies to a directory directly, rather than
   * to one of the files inside it.
   *
   * @remarks
   * The primitive {@link forFile} builds on: `forFile` resolves `dirname(filePath)`
   * and delegates here. Exposed separately so a caller can resolve the
   * project root's own config up front — the pre-flight sanity check `check`
   * always ran before per-file resolution existed — and have that same,
   * already-cached validator reused for every file that resolves to it.
   *
   * @param dir - Absolute directory to resolve from.
   * @returns The resolved validator.
   */
  forDirectory(dir: string): Promise<TsdocValidator>;

  /**
   * Every distinct `tsdoc.json` this resolver has loaded so far that could not
   * be applied (parse failure, permission error), paired with its directory.
   *
   * @remarks
   * `check` uses this to decide whether to abort the run: a broken config
   * anywhere in the tree would silently turn its scope's custom tags into
   * violations, so the run refuses to report on files it cannot trust rather
   * than mixing trustworthy and untrustworthy results in one summary.
   *
   * @returns One entry per broken config encountered, in resolution order.
   */
  brokenConfigs(): readonly {
    readonly dir: string;
    readonly validator: TsdocValidator;
  }[];
}

/**
 * Tests whether `dir` directly contains a `tsdoc.json`.
 *
 * @param dir - The absolute directory to probe.
 * @returns `true` when `<dir>/tsdoc.json` exists.
 */
async function hasTsdocJson(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, "tsdoc.json"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a resolver that finds, loads and caches the nearest-ancestor
 * `tsdoc.json` for each file under `root`.
 *
 * @param root - The absolute project root `check` was invoked against. The
 * directory walk never continues past this directory.
 * @returns A {@link TsdocValidatorResolver} scoped to one `check` run.
 */
export function createTsdocValidatorResolver(
  root: string,
): TsdocValidatorResolver {
  // Maps a directory that was walked to the config directory it resolved to,
  // so a directory is only ever walked once regardless of how many files it
  // holds — the "hundreds of files under the same tsdoc.json" case the design
  // calls out.
  const dirToConfigDir = new Map<string, string>();
  // Maps a config directory to its (lazily built, then memoized) validator, so
  // two directories that resolve to the same tsdoc.json share one instance.
  const validators = new Map<string, Promise<TsdocValidator>>();
  const broken = new Map<string, TsdocValidator>();

  /**
   * Walks up from `startDir` to `root`, returning the nearest directory that
   * contains a `tsdoc.json`, or `root` when none was found on the way.
   *
   * @param startDir - The directory to start the walk from.
   * @returns The resolved configuration directory.
   */
  async function nearestConfigDir(startDir: string): Promise<string> {
    const cached = dirToConfigDir.get(startDir);
    if (cached !== undefined) {
      return cached;
    }

    const visited: string[] = [];
    let dir = startDir;

    for (;;) {
      const memoized = dirToConfigDir.get(dir);
      if (memoized !== undefined) {
        for (const walkedDir of visited) {
          dirToConfigDir.set(walkedDir, memoized);
        }
        return memoized;
      }

      visited.push(dir);

      if (await hasTsdocJson(dir)) {
        for (const walkedDir of visited) {
          dirToConfigDir.set(walkedDir, dir);
        }
        return dir;
      }

      if (dir === root) {
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        // Reached the filesystem root without ever meeting `root`. Only
        // possible when `startDir` is not actually under `root`; fall back to
        // `root` rather than walking forever.
        break;
      }
      dir = parent;
    }

    for (const walkedDir of visited) {
      dirToConfigDir.set(walkedDir, root);
    }
    return root;
  }

  async function forDirectory(dir: string): Promise<TsdocValidator> {
    const configDir = await nearestConfigDir(dir);

    let validatorPromise = validators.get(configDir);
    if (validatorPromise === undefined) {
      validatorPromise = createTsdocValidator(configDir).then((validator) => {
        if (validator.configErrors.length > 0) {
          broken.set(configDir, validator);
        }
        return validator;
      });
      validators.set(configDir, validatorPromise);
    }
    return validatorPromise;
  }

  return {
    forFile(filePath) {
      return forDirectory(dirname(filePath));
    },
    forDirectory,
    brokenConfigs() {
      return [...broken.entries()].map(([dir, validator]) => ({
        dir,
        validator,
      }));
    },
  };
}
