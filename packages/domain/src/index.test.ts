import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { EnvironmentId, PlanStep, ThreadId, TicketKey, threadDeepLink } from "./index.ts"

describe("PlanStep", () => {
  it.effect("decodes and encodes back to the same input", () =>
    Effect.gen(function* () {
      const input = {
        id: "s2",
        title: "Show the step graph",
        kind: "TracerBullet",
        ticket: "CHASE-2147",
        dependsOn: ["s1"]
      }
      const step = yield* Schema.decodeUnknownEffect(PlanStep)(input)
      expect(step.ticket).toBe("CHASE-2147")
      expect(yield* Schema.encodeEffect(PlanStep)(step)).toEqual(input)
    }))
})

describe("TicketKey", () => {
  it("rejects a key without a project prefix", () => {
    expect(Exit.isFailure(Schema.decodeUnknownExit(TicketKey)("2147"))).toBe(true)
    expect(Exit.isFailure(Schema.decodeUnknownExit(TicketKey)("chase-2147"))).toBe(true)
  })
})

describe("threadDeepLink", () => {
  it("percent-encodes a delegated thread id", () => {
    const link = threadDeepLink({
      environmentId: EnvironmentId.make("env-1"),
      threadId: ThreadId.make("thread:delegated-task:command%3Amcp%3Ab12b")
    })
    expect(link).toBe("t3code://threads/env-1/thread%3Adelegated-task%3Acommand%253Amcp%253Ab12b")
  })
})
