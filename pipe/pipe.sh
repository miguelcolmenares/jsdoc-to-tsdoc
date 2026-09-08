#!/usr/bin/env bash
#
# jsdoc-to-tsdoc Bitbucket Pipe entrypoint.
#
# Reads the pipe variables Bitbucket Pipelines injects as plain env vars
# (declared in pipe.yml) plus the standard BITBUCKET_CLONE_DIR, builds the
# equivalent `npx jsdoc-to-tsdoc <command> <flags>` invocation, and exits with
# the CLI's own exit code — 0 OK, 1 logic error, 2 parse failure, 3 violations.
# Never swallowed: this script does not catch or reinterpret it.

set -euo pipefail

COMMAND="${COMMAND:-check}"
VERSION="${VERSION:-latest}"
CWD="${CWD:-.}"
FAIL_ON_MISSING="${FAIL_ON_MISSING:-false}"
FAIL_ON_STALE="${FAIL_ON_STALE:-false}"
SYNTAX_ONLY="${SYNTAX_ONLY:-false}"
INCLUDE_TESTS="${INCLUDE_TESTS:-false}"
ONLY="${ONLY:-}"
EXCLUDE="${EXCLUDE:-}"
REPORT="${REPORT:-}"

WORKDIR="${BITBUCKET_CLONE_DIR:-$(pwd)}"
cd "$WORKDIR"

args=("$COMMAND")

case "$COMMAND" in
  scan)
    args+=("--classify")
    [ "$FAIL_ON_MISSING" = "true" ] && args+=("--fail-on-missing")
    [ "$FAIL_ON_STALE" = "true" ] && args+=("--fail-on-stale")
    ;;
  check)
    [ "$SYNTAX_ONLY" = "true" ] && args+=("--syntax-only")
    ;;
  *)
    echo "jsdoc-to-tsdoc pipe: unsupported COMMAND '${COMMAND}' — use 'check' or 'scan'." >&2
    exit 1
    ;;
esac

args+=("--cwd" "$CWD")
[ "$INCLUDE_TESTS" = "true" ] && args+=("--include-tests")
[ -n "$ONLY" ] && args+=("--only" "$ONLY")
[ -n "$EXCLUDE" ] && args+=("--exclude" "$EXCLUDE")
[ -n "$REPORT" ] && args+=("--report" "$REPORT")

echo "jsdoc-to-tsdoc pipe: npx --yes jsdoc-to-tsdoc@${VERSION} ${args[*]}"

# The CLI's exit code is the script's exit code: this is the last command and
# `set -e` does not intercept a script's final statement, so nothing here
# reinterprets or hides it.
npx --yes "jsdoc-to-tsdoc@${VERSION}" "${args[@]}"
