import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { applySchema, databasePath, runScript } from "@mister-handy/db"
import { EnvironmentId, PlanStepId, ProjectSlug, StatusUpdate, ThreadId } from "@mister-handy/domain"
import { Config, Console, Effect, FileSystem, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"

const localEnvironmentId = Effect.gen(function*() {
  const home = yield* Config.String("T3CODE_HOME")
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(`${home}/userdata/environment-id`)
  return yield* Schema.decodeEffect(EnvironmentId)(raw.trim())
})

const status = Command.make(
  "status",
  {
    project: Flag.String("project").pipe(Flag.withSchema(ProjectSlug)),
    step: Flag.String("step").pipe(Flag.withSchema(PlanStepId)),
    environment: Flag.String("environment").pipe(Flag.withSchema(EnvironmentId), Flag.optional),
    thread: Flag.String("thread").pipe(
      Flag.withSchema(ThreadId),
      Flag.withFallbackConfig(Config.schema(ThreadId, "T3CODE_THREAD_ID"))
    )
  },
  Effect.fnUntraced(function*({ project, step, environment, thread }) {
    const environmentId = Option.isSome(environment) ? environment.value : yield* localEnvironmentId
    const update = StatusUpdate.cases.StepStarted.make({
      project,
      stepId: step,
      thread: { environmentId, threadId: thread }
    })
    yield* Console.log(JSON.stringify(yield* Schema.encodeEffect(StatusUpdate)(update)))
  })
).pipe(Command.withDescription("Report that a plan step started in a thread"))

const init = Command.make(
  "init",
  {},
  Effect.fnUntraced(function*() {
    const filename = yield* databasePath
    yield* applySchema(filename)
    yield* Console.log(`Schema applied to ${filename}`)
  })
).pipe(Command.withDescription("Create the database tables that don't exist yet"))

const load = Command.make(
  "load",
  { script: Argument.FileText("file") },
  Effect.fnUntraced(function*({ script }) {
    const filename = yield* databasePath
    yield* runScript(filename, script)
    yield* Console.log(`Loaded into ${filename}`)
  })
).pipe(Command.withDescription("Run a SQL file against the database in one transaction"))

const db = Command.make("db").pipe(
  Command.withDescription(`Manage the SQLite database at $MR_HANDY_DB, by default ~/.mr-handy/mister-handy.db`),
  Command.withSubcommands([init, load])
)

const mrHandy = Command.make("mr-handy").pipe(
  Command.withDescription("Post status updates to Mister Handy"),
  Command.withSubcommands([status, db])
)

Command.run(mrHandy, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
