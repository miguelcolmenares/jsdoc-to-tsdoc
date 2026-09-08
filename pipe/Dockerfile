# jsdoc-to-tsdoc Bitbucket Pipe image.
#
# Slim is enough: the pipe only needs `npx` to fetch and run the published
# `jsdoc-to-tsdoc` package at run time — nothing is installed at build time,
# matching the "never add this to your dependency graph" stance in the README.
FROM node:22-slim

LABEL org.opencontainers.image.title="jsdoc-to-tsdoc pipe" \
  org.opencontainers.image.description="Bitbucket Pipe wrapping jsdoc-to-tsdoc's check / scan --classify gate." \
  org.opencontainers.image.source="https://github.com/miguelcolmenares/jsdoc-to-tsdoc" \
  org.opencontainers.image.licenses="MIT"

COPY pipe.sh /
RUN chmod a+x /pipe.sh

ENTRYPOINT ["/pipe.sh"]
