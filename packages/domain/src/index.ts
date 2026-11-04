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

export const ThreadState = Schema.Literals(["Running", "Waiting", "Idle", "Failed", "Settled"])
export type ThreadState = typeof ThreadState.Type

export const PullRequestState = Schema.Literals(["Draft", "Open", "Merged", "Closed"])
export type PullRequestState = typeof PullRequestState.Type

export const PlanStep = Schema.Struct({
  id: PlanStepId,
  title: Schema.NonEmptyString,
  ticket: TicketKey,
  dependsOn: Schema.Array(PlanStepId)
})
export type PlanStep = typeof PlanStep.Type

export const Project = Schema.Struct({
  slug: ProjectSlug,
  name: Schema.NonEmptyString,
  state: ProjectState,
  steps: Schema.Array(PlanStep)
})
export type Project = typeof Project.Type

export const ThreadRef = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId
})
export type ThreadRef = typeof ThreadRef.Type

export const StatusUpdate = Schema.TaggedUnion({
  StepStarted: { project: ProjectSlug, stepId: PlanStepId, thread: ThreadRef },
  PullRequestOpened: { project: ProjectSlug, stepId: PlanStepId, url: Schema.URLFromString }
})
export type StatusUpdate = typeof StatusUpdate.Type

export const threadDeepLink = (ref: ThreadRef): string =>
  `t3code://threads/${encodeURIComponent(ref.environmentId)}/${encodeURIComponent(ref.threadId)}`
