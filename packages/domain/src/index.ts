import { Schema } from "effect"

export const ProjectSlug = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  Schema.brand("ProjectSlug")
)

export type ProjectSlug = typeof ProjectSlug.Type

export const PlanStepId = Schema.NonEmptyString.pipe(Schema.brand("PlanStepId"))

export type PlanStepId = typeof PlanStepId.Type

export const TicketKey = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Z][A-Z0-9]*-[1-9][0-9]*$/)),
  Schema.brand("TicketKey")
)

export type TicketKey = typeof TicketKey.Type

export const ThreadId = Schema.NonEmptyString.pipe(Schema.brand("ThreadId"))

export type ThreadId = typeof ThreadId.Type

export const EnvironmentId = Schema.NonEmptyString.pipe(Schema.brand("EnvironmentId"))

export type EnvironmentId = typeof EnvironmentId.Type

export const ProjectState = Schema.Literals(["Planning", "Active", "Paused", "Done"])

export type ProjectState = typeof ProjectState.Type

export const StepState = Schema.Literals([
  "Blocked",
  "Ready",
  "Working",
  "NeedsYou",
  "InReview",
  "Merged",
  "Done",
  "Dropped"
])

export type StepState = typeof StepState.Type

export const ThreadState = Schema.Literals(["Running", "Waiting", "Idle", "Failed", "Settled", "Missing"])

export type ThreadState = typeof ThreadState.Type

export const PullRequestState = Schema.Literals(["Draft", "Open", "Merged", "Closed"])

export type PullRequestState = typeof PullRequestState.Type

export const ClosedAs = Schema.Literals(["Done", "Dropped"])

export type ClosedAs = typeof ClosedAs.Type

export const PlanStep = Schema.Struct({
  id: PlanStepId,
  title: Schema.NonEmptyString,
  ticket: Schema.NullOr(TicketKey),
  dependsOn: Schema.Array(PlanStepId),
  closedAs: Schema.optionalKey(ClosedAs),
  /** The decision the coordinator is waiting on the user for. Set, the step reads Needs you. */
  heldFor: Schema.optionalKey(Schema.NonEmptyString)
})

export type PlanStep = typeof PlanStep.Type

export const ThreadRef = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId
})

export type ThreadRef = typeof ThreadRef.Type

export const ProjectReference = Schema.Struct({
  label: Schema.NonEmptyString,
  url: Schema.NonEmptyString
})

export type ProjectReference = typeof ProjectReference.Type

export const Project = Schema.Struct({
  slug: ProjectSlug,
  name: Schema.NonEmptyString,
  state: ProjectState,
  epic: Schema.NullOr(TicketKey),
  coordinator: Schema.NullOr(ThreadRef),
  references: Schema.Array(ProjectReference)
})

export type Project = typeof Project.Type

export const StepThread = Schema.Struct({
  stepId: PlanStepId,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  startedAt: Schema.NonEmptyString,
  state: Schema.NullOr(ThreadState),
  title: Schema.NullOr(Schema.String)
})

export type StepThread = typeof StepThread.Type

export const StepPullRequest = Schema.Struct({
  stepId: PlanStepId,
  url: Schema.NonEmptyString,
  state: Schema.NullOr(PullRequestState)
})

export type StepPullRequest = typeof StepPullRequest.Type

export const TicketObservation = Schema.Struct({
  ticket: TicketKey,
  jiraStatus: Schema.NonEmptyString
})

export type TicketObservation = typeof TicketObservation.Type

export const StatusUpdate = Schema.TaggedUnion({
  StepStarted: {
    project: ProjectSlug,
    stepId: PlanStepId,
    thread: ThreadRef,
    /** The title the thread was launched with. */
    title: Schema.optionalKey(Schema.NonEmptyString)
  },
  PullRequestOpened: { project: ProjectSlug, stepId: PlanStepId, url: Schema.URLFromString }
})

export type StatusUpdate = typeof StatusUpdate.Type

/** `before` finishes first and `after` waits on it. */
export const Dependency = Schema.Struct({ before: PlanStepId, after: PlanStepId })

export type Dependency = typeof Dependency.Type

export const NewStep = Schema.Struct({ id: PlanStepId, title: Schema.NonEmptyString })

export type NewStep = typeof NewStep.Type

export const PlanEdit = Schema.TaggedUnion({
  AddStep: {
    project: ProjectSlug,
    step: PlanStepId,
    title: Schema.NonEmptyString,
    ticket: Schema.NullOr(TicketKey),
    /** null appends at the end of the plan. */
    after: Schema.NullOr(PlanStepId),
    dependsOn: Schema.Array(PlanStepId)
  },
  RewriteStep: {
    project: ProjectSlug,
    step: PlanStepId,
    title: Schema.optionalKey(Schema.NonEmptyString),
    ticket: Schema.optionalKey(TicketKey)
  },
  /** The original keeps its id, ticket, threads, pull requests and edges. Each part copies its edges. */
  SplitStep: { project: ProjectSlug, step: PlanStepId, parts: Schema.NonEmptyArray(NewStep) },
  /** Marks the step Dropped. What waited on it waits on its dependencies instead. */
  DropStep: { project: ProjectSlug, step: PlanStepId },
  /** Holds the step on a decision only the user can make, until it's released. Rerunning replaces the reason. */
  HoldStep: { project: ProjectSlug, step: PlanStepId, reason: Schema.NonEmptyString },
  ReleaseStep: { project: ProjectSlug, step: PlanStepId },
  AddDependency: { project: ProjectSlug, step: PlanStepId, on: PlanStepId },
  RemoveDependency: { project: ProjectSlug, step: PlanStepId, on: PlanStepId }
})

export type PlanEdit = typeof PlanEdit.Type

/** What an edit actually changed. An empty list means the plan already looked like that. */
export type PlanChange =
  | { readonly _tag: "StepAdded"; readonly step: PlanStepId; readonly position: number }
  | { readonly _tag: "StepRewritten"; readonly step: PlanStepId }
  | { readonly _tag: "StepHeld"; readonly step: PlanStepId; readonly reason: string }
  | { readonly _tag: "StepReleased"; readonly step: PlanStepId }
  | {
      readonly _tag: "StepClosed"
      readonly step: PlanStepId
      readonly closedAs: ClosedAs
      readonly ticket: TicketKey | null
    }
  | { readonly _tag: "DependencyAdded"; readonly dependency: Dependency }
  | { readonly _tag: "DependencyRemoved"; readonly dependency: Dependency }

/**
 * The cycle that adding `edge` would close, as [edge.after, ..., edge.before, edge.after] in the direction
 * the edges point, or null when the graph stays acyclic.
 */
export const findCycle = (edges: ReadonlyArray<Dependency>, edge: Dependency): ReadonlyArray<PlanStepId> | null => {
  const waiters = new Map<PlanStepId, Array<PlanStepId>>()

  for (const { before, after } of edges) waiters.set(before, [...(waiters.get(before) ?? []), after])
  const reachedFrom = new Map<PlanStepId, PlanStepId | null>([[edge.after, null]])
  const queue = [edge.after]

  for (const node of queue) {
    if (node === edge.before) {
      const path = [edge.after]

      for (let at: PlanStepId | null = node; at !== null; at = reachedFrom.get(at) ?? null) path.unshift(at)

      return path
    }

    for (const next of waiters.get(node) ?? []) {
      if (reachedFrom.has(next)) continue
      reachedFrom.set(next, node)
      queue.push(next)
    }
  }

  return null
}

export const threadDeepLink = (ref: ThreadRef): string =>
  `t3code://threads/${encodeURIComponent(ref.environmentId)}/${encodeURIComponent(ref.threadId)}`

export interface StepNode {
  readonly step: PlanStep
  readonly state: StepState
  readonly drift: boolean
  readonly earlyStart: boolean
  /** Newest first. */
  readonly threads: ReadonlyArray<StepThread>
  readonly pullRequests: ReadonlyArray<StepPullRequest>
  readonly jiraStatus: string | null
}

export interface ProjectRows {
  readonly steps: ReadonlyArray<PlanStep>
  readonly threads: ReadonlyArray<StepThread>
  readonly pullRequests: ReadonlyArray<StepPullRequest>
  readonly tickets: ReadonlyArray<TicketObservation>
}

export const isFinished = (state: StepState): boolean => state === "Merged" || state === "Done"

const startedStates: ReadonlySet<StepState> = new Set(["Working", "NeedsYou", "InReview"])

/** Rules 1 to 5 of the precedence in docs/storage.md: the ones that ignore dependencies. */
const ownState = (
  step: PlanStep,
  newestThread: StepThread | undefined,
  pullRequests: ReadonlyArray<StepPullRequest>
): StepState | undefined => {
  if (step.closedAs !== undefined) return step.closedAs

  if (pullRequests.length > 0 && pullRequests.every((pr) => pr.state === "Merged")) return "Merged"

  if (step.heldFor !== undefined) return "NeedsYou"

  if (newestThread?.state === "Running") return "Working"

  if (pullRequests.some((pr) => pr.state === "Open" || pr.state === "Draft")) return "InReview"

  switch (newestThread?.state) {
    case "Waiting":
    case "Idle":
    case "Failed":
    case "Missing":
      return "NeedsYou"
  }

  return undefined
}

export const deriveStepNodes = (rows: ProjectRows): ReadonlyArray<StepNode> => {
  const byId = new Map(rows.steps.map((step) => [step.id, step]))

  const threadsOf = (id: PlanStepId) =>
    rows.threads.filter((t) => t.stepId === id).toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))

  const pullRequestsOf = (id: PlanStepId) => rows.pullRequests.filter((pr) => pr.stepId === id)
  const jiraStatus = new Map(rows.tickets.map((t) => [t.ticket, t.jiraStatus]))

  const states = new Map<PlanStepId, StepState>()

  const stateOf = (id: PlanStepId): StepState => {
    const known = states.get(id)

    if (known !== undefined) return known
    const step = byId.get(id)

    if (step === undefined) return "Blocked"
    // Seeded before recursing so a dependency cycle in bad data ends as Blocked instead of looping.
    states.set(id, "Blocked")

    const state =
      ownState(step, threadsOf(id)[0], pullRequestsOf(id)) ??
      (step.dependsOn.every((dep) => isFinished(stateOf(dep))) ? "Ready" : "Blocked")

    states.set(id, state)

    return state
  }

  return rows.steps.map((step) => {
    const state = stateOf(step.id)
    const jira = step.ticket === null ? null : (jiraStatus.get(step.ticket) ?? null)

    return {
      step,
      state,
      drift: jira !== null && (jira === "Done") !== isFinished(state),
      earlyStart: startedStates.has(state) && !step.dependsOn.every((dep) => isFinished(stateOf(dep))),
      threads: threadsOf(step.id),
      pullRequests: pullRequestsOf(step.id),
      jiraStatus: jira
    }
  })
}
