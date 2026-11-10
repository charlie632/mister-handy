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

describe("step state precedence", () => {
  const dep = PlanStepId.make("dep")
  const subject = PlanStepId.make("subject")
  const ticket = TicketKey.make("DEMO-1")
  const alone: PlanStep = { id: subject, title: "Subject", ticket: null, dependsOn: [] }
  const waiting: PlanStep = { ...alone, dependsOn: [dep] }
  const dependency: PlanStep = { id: dep, title: "Dependency", ticket: null, dependsOn: [] }
  const held: PlanStep = { ...alone, heldFor: "Pick a rollout order" }

  const pullRequest = (number: number, state: StepPullRequest["state"], stepId = subject): StepPullRequest => ({
    stepId,
    url: `https://github.com/o/r/pull/${number}`,
    state
  })

  const threadIn = (state: StepThread["state"], startedAt = "2026-11-04T10:00:00Z"): StepThread => ({
    stepId: subject,
    environmentId: EnvironmentId.make("env-1"),
    threadId: ThreadId.make(`t-${startedAt}`),
    startedAt,
    state,
    title: null
  })

  /** The subject's node when it is the only step in the plan. */
  const only = (step: PlanStep, threads: ReadonlyArray<StepThread>, pullRequests: ReadonlyArray<StepPullRequest>) =>
    deriveStepNodes({ steps: [step], threads, pullRequests, tickets: [] })[0]

  /** The subject's node when it waits on `before`. */
  const after = (
    before: PlanStep,
    beforePullRequests: ReadonlyArray<StepPullRequest>,
    threads: ReadonlyArray<StepThread> = [],
    pullRequests: ReadonlyArray<StepPullRequest> = []
  ) =>
    deriveStepNodes({
      steps: [before, waiting],
      threads,
      pullRequests: [...beforePullRequests, ...pullRequests],
      tickets: []
    })[1]

  it("keeps a close mark over everything observed", () => {
    expect(only({ ...alone, closedAs: "Done" }, [threadIn("Running")], [pullRequest(1, "Open")])?.state).toBe("Done")
    expect(only({ ...alone, closedAs: "Dropped" }, [], [pullRequest(1, "Merged")])?.state).toBe("Dropped")
  })

  it("reads Merged once every pull request merged, over a hold and a running thread", () => {
    const merged = [pullRequest(1, "Merged"), pullRequest(2, "Merged")]
    expect(only(held, [threadIn("Running")], merged)?.state).toBe("Merged")
  })

  it("reads a hold over a running thread and an open pull request", () => {
    expect(only(held, [threadIn("Running")], [pullRequest(1, "Open")])?.state).toBe("NeedsYou")
  })

  it("reads Working while the newest thread runs, even with an open pull request", () => {
    expect(only(alone, [threadIn("Running")], [pullRequest(1, "Open")])?.state).toBe("Working")
  })

  it("reads In review for an open or draft pull request once the thread stopped", () => {
    expect(only(alone, [threadIn("Idle")], [pullRequest(1, "Open")])?.state).toBe("InReview")
    expect(only(alone, [threadIn("Failed")], [pullRequest(1, "Draft")])?.state).toBe("InReview")
    expect(only(alone, [], [pullRequest(1, "Merged"), pullRequest(2, "Open")])?.state).toBe("InReview")
  })

  it("reads Needs you when the newest thread stopped without a pull request", () => {
    for (const state of ["Waiting", "Idle", "Failed", "Missing"] as const) {
      expect(only(alone, [threadIn(state)], [])?.state, state).toBe("NeedsYou")
    }
  })

  it("falls back to the dependencies when the newest thread is unobserved or settled", () => {
    const restarted = [threadIn("Running", "2026-11-04T10:00:00Z"), threadIn("Settled", "2026-11-04T12:00:00Z")]
    expect(only(alone, [threadIn(null)], [])?.state).toBe("Ready")
    expect(only(alone, restarted, [])?.state).toBe("Ready")
  })

  it("reads Ready once every dependency is merged or done", () => {
    expect(after(dependency, [pullRequest(1, "Merged", dep)])?.state).toBe("Ready")
    expect(after({ ...dependency, closedAs: "Done" }, [])?.state).toBe("Ready")
  })

  it("reads Blocked while a dependency is in review, untouched or dropped", () => {
    expect(after(dependency, [pullRequest(1, "Open", dep)])?.state).toBe("Blocked")
    expect(after(dependency, [])?.state).toBe("Blocked")
    expect(after({ ...dependency, closedAs: "Dropped" }, [])?.state).toBe("Blocked")
  })

  it("reads Blocked for a dependency the plan doesn't have, and for a cycle in bad data", () => {
    expect(only(waiting, [], [])?.state).toBe("Blocked")

    const loop = deriveStepNodes({
      steps: [{ ...dependency, dependsOn: [subject] }, waiting],
      threads: [],
      pullRequests: [],
      tickets: []
    })

    expect(loop.map((node) => node.state)).toEqual(["Blocked", "Blocked"])
  })

  it("flags an early start only while the step is working, in review or needing the user", () => {
    expect(after(dependency, [], [threadIn("Running")])?.earlyStart).toBe(true)
    expect(after(dependency, [], [], [pullRequest(2, "Open")])?.earlyStart).toBe(true)
    expect(after(dependency, [], [], [pullRequest(2, "Merged")])?.earlyStart).toBe(false)
    expect(after({ ...dependency, closedAs: "Done" }, [], [threadIn("Running")])?.earlyStart).toBe(false)
  })

  it("flags drift when Jira's Done disagrees with whether the step is finished", () => {
    const drift = (jiraStatus: string | null, pullRequests: ReadonlyArray<StepPullRequest>) =>
      deriveStepNodes({
        steps: [{ ...alone, ticket }],
        threads: [],
        pullRequests,
        tickets: jiraStatus === null ? [] : [{ ticket, jiraStatus }]
      })[0]?.drift

    expect(drift("Done", [])).toBe(true)
    expect(drift("In Progress", [pullRequest(1, "Merged")])).toBe(true)
    expect(drift("Done", [pullRequest(1, "Merged")])).toBe(false)
    expect(drift(null, [pullRequest(1, "Merged")])).toBe(false)
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
