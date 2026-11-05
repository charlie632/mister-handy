import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import {
  deriveStepNodes,
  EnvironmentId,
  findCycle,
  PlanStep,
  PlanStepId,
  type StepPullRequest,
  type StepThread,
  ThreadId,
  TicketKey,
  threadDeepLink
} from "./index.ts"

describe("PlanStep", () => {
  it.effect("decodes and encodes back to the same input", () =>
    Effect.gen(function* () {
      const input = {
        id: "s2",
        title: "Show the step graph",
        ticket: "CHASE-2147",
        dependsOn: ["s1"]
      }

      const step = yield* Schema.decodeEffect(PlanStep)(input)
      expect(step.ticket).toBe("CHASE-2147")
      expect(yield* Schema.encodeEffect(PlanStep)(step)).toEqual(input)
    })
  )
})

describe("TicketKey", () => {
  it("rejects a key without a project prefix", () => {
    expect(Exit.isFailure(Schema.decodeExit(TicketKey)("2147"))).toBe(true)
    expect(Exit.isFailure(Schema.decodeExit(TicketKey)("chase-2147"))).toBe(true)
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

describe("deriveStepNodes", () => {
  const first = PlanStepId.make("first")
  const second = PlanStepId.make("second")

  const thread = (startedAt: string, state: StepThread["state"]): StepThread => ({
    stepId: second,
    environmentId: EnvironmentId.make("env-1"),
    threadId: ThreadId.make(`t-${startedAt}`),
    startedAt,
    state,
    title: null
  })

  const derive = (threads: ReadonlyArray<StepThread>) =>
    deriveStepNodes({
      steps: [
        { id: first, title: "First", ticket: null, dependsOn: [] },
        { id: second, title: "Second", ticket: null, dependsOn: [first] }
      ],
      threads,
      pullRequests: [],
      tickets: []
    })

  it("reads the newest step thread and flags work that started before its dependency finished", () => {
    const [, node] = derive([thread("2026-11-04T10:00:00Z", "Running"), thread("2026-11-04T12:00:00Z", "Failed")])
    expect(node?.state).toBe("NeedsYou")
    expect(node?.earlyStart).toBe(true)
    expect(node?.threads.map((t) => t.state)).toEqual(["Failed", "Running"])
  })

  it("reads a held step as Needs you whatever its dependencies, until it merges", () => {
    const held = (step: PlanStep, pullRequests: ReadonlyArray<StepPullRequest>) =>
      deriveStepNodes({
        steps: [{ ...step, heldFor: "Pick a rollout order" }],
        threads: [],
        pullRequests,
        tickets: []
      })[0]

    const step = { id: first, title: "First", ticket: null, dependsOn: [] }
    expect(held(step, [])?.state).toBe("NeedsYou")
    expect(held({ ...step, dependsOn: [second] }, [])?.state).toBe("NeedsYou")
    expect(held(step, [{ stepId: first, url: "https://github.com/o/r/pull/1", state: "Merged" }])?.state).toBe("Merged")
  })

  it("falls back to the dependencies when the newest thread is settled", () => {
    const [firstNode, node] = derive([thread("2026-11-04T12:00:00Z", "Settled")])
    expect(firstNode?.state).toBe("Ready")
    expect(node?.state).toBe("Blocked")
    expect(node?.earlyStart).toBe(false)
  })
})

describe("findCycle", () => {
  const a = PlanStepId.make("a")
  const b = PlanStepId.make("b")
  const c = PlanStepId.make("c")
  const d = PlanStepId.make("d")

  const chain = [
    { before: a, after: b },
    { before: b, after: c }
  ]

  it("allows an edge that only adds another path through the graph", () => {
    expect(findCycle([...chain, { before: a, after: d }], { before: d, after: c })).toBeNull()
  })

  it("returns the loop an edge would close, in the direction the edges point", () => {
    expect(findCycle(chain, { before: c, after: a })).toEqual([a, b, c, a])
  })

  it("treats a step depending on itself as a cycle", () => {
    expect(findCycle(chain, { before: b, after: b })).toEqual([b, b])
  })
})
