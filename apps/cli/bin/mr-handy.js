#!/usr/bin/env node
// node:sqlite warns on load. Launchers like pnpm's global shim drop shebang flags, so filter it here.
const emitWarning = process.emitWarning

process.emitWarning = (warning, ...rest) => {
  // The second argument is either the warning type or an options object carrying it.
  const type = rest[0]?.type ?? rest[0]

  if (type === "ExperimentalWarning" && String(warning).startsWith("SQLite")) return

  return emitWarning.call(process, warning, ...rest)
}

await import("../dist/bin.js")
