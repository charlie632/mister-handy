import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { cli } from "./cli.ts"

cli(process.argv.slice(2)).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
