#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { EnvironmentId, PlanStepId, ProjectSlug, StatusUpdate, ThreadId } from "@mister-handy/domain"
import { Config, Console, Effect, Schema } from "effect"
import { Command, Flag } from "effect/cli"

const status = Command.make(
  "status",
  {
    project: Flag.String("project").pipe(Flag.withSchema(ProjectSlug)),
    step: Flag.String("step").pipe(Flag.withSchema(PlanStepId)),
    environment: Flag.String("environment").pipe(
      Flag.withSchema(EnvironmentId),
      Flag.withFallbackConfig(Config.schema(EnvironmentId, "T3CODE_ENVIRONMENT_ID"))
    ),
    thread: Flag.String("thread").pipe(
      Flag.withSchema(ThreadId),
      Flag.withFallbackConfig(Config.schema(ThreadId, "T3CODE_THREAD_ID"))
    )
  },
  ({ project, step, environment, thread }) =>
    Console.log(
      JSON.stringify(
        Schema.encodeSync(StatusUpdate)(
          StatusUpdate.cases.StepStarted.make({
            project,
            stepId: step,
            thread: { environmentId: environment, threadId: thread }
          })
        )
      )
    )
).pipe(Command.withDescription("Report that a plan step started in a thread"))

const mrHandy = Command.make("mr-handy").pipe(
  Command.withDescription("Post status updates to Mister Handy"),
  Command.withSubcommands([status])
)

Command.run(mrHandy, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
