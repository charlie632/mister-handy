import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { EnvironmentId, PlanStepId, ProjectSlug, StatusUpdate, ThreadId } from "@mister-handy/domain"
import { Config, Console, Effect, FileSystem, Option, Schema } from "effect"
import { Command, Flag } from "effect/cli"

const localEnvironmentId = Effect.gen(function*() {
  const home = yield* Config.String("T3CODE_HOME")
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(`${home}/userdata/environment-id`)
  return yield* Schema.decodeUnknownEffect(EnvironmentId)(raw.trim())
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
    yield* Console.log(JSON.stringify(Schema.encodeSync(StatusUpdate)(update)))
  })
).pipe(Command.withDescription("Report that a plan step started in a thread"))

const mrHandy = Command.make("mr-handy").pipe(
  Command.withDescription("Post status updates to Mister Handy"),
  Command.withSubcommands([status])
)

Command.run(mrHandy, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
