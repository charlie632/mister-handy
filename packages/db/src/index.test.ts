import { SqliteClient } from "@effect/sql-sqlite-node"
import { SqlClient } from "effect/sql"
import { describe, expect, it } from "@effect/vitest"
import {
  EnvironmentId,
  PlanEdit,
  PlanStepId,
  ProjectSlug,
  StatusUpdate,
  ThreadId,
  TicketKey
} from "@mister-handy/domain"
import { Effect } from "effect"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import chase2146 from "../../../docs/examples/chase-2146.sql?raw"
import {
  applySchema,
  closeStep,
  createProject,
  editPlan,
  listProjects,
  type ProjectView,
  readProject,
  recordStatusUpdate,
  runScript
} from "./index.ts"

const withDatabase = (script: string) => <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => {
  const filename = join(mkdtempSync(join(tmpdir(), "mr-handy-")), "test.db")
  return applySchema(filename).pipe(
    Effect.andThen(applySchema(filename)),
    Effect.andThen(runScript(filename, script)),
    Effect.andThen(effect),
    Effect.provide(SqliteClient.layer({ filename }))
  )
}
const withChase2146 = withDatabase(chase2146)
const withEmptyDatabase = withDatabase("")

const slug = ProjectSlug.make("chase-2146")

const byTicket = Effect.map(readProject(slug), (view) => {
  const nodes = new Map(view?.steps.map((node) => [node.step.ticket, node]))
  return (key: string) => nodes.get(TicketKey.make(key))
})

describe("CHASE-2146", () => {
  it.effect("derives each step's state from the example data", () =>
    withChase2146(Effect.gen(function*() {
      const node = yield* byTicket
      const state = (ticket: string) => node(ticket)?.state

      for (const ticket of ["CHASE-2147", "CHASE-2148", "CHASE-2157", "CHASE-2158"]) {
        expect(state(ticket), ticket).toBe("Merged")
      }
      expect(state("CHASE-2149")).toBe("InReview")
      expect(node("CHASE-2149")?.drift).toBe(true)
      expect(state("CHASE-2162")).toBe("Done")
      expect(state("CHASE-2153")).toBe("Ready")
      for (const ticket of ["CHASE-2154", "CHASE-2159", "CHASE-2160"]) {
        expect(state(ticket), ticket).toBe("Blocked")
      }
      const view = yield* readProject(slug)
      expect(view?.steps.filter((n) => n.drift).map((n) => n.step.ticket)).toEqual(["CHASE-2149"])
    })))

  it.effect("lists the project and lets the user mark a merged step done", () =>
    withChase2146(Effect.gen(function*() {
      expect((yield* listProjects()).map((view) => view.project.slug)).toEqual([slug])
      yield* closeStep({ project: slug, stepId: PlanStepId.make("unique-name"), closedAs: "Done" })
      yield* closeStep({ project: slug, stepId: PlanStepId.make("unique-name"), closedAs: "Dropped" })
      expect((yield* byTicket)("CHASE-2147")?.state).toBe("Done")
    })))
})

const id = PlanStepId.make
const node = (view: ProjectView | null, step: string) => view?.steps.find((n) => n.step.id === step)
const dependsOn = (view: ProjectView | null, step: string) => node(view, step)?.step.dependsOn.toSorted()
const stateOf = (view: ProjectView | null, step: string) => node(view, step)?.state
const coordinator = { environmentId: EnvironmentId.make("env-1"), threadId: ThreadId.make("coordinator") }
const statusRows = Effect.flatMap(SqlClient.SqlClient, (sql) => sql<{ id: string; thread_id: string | null }>`
  SELECT id, thread_id FROM status_update WHERE id NOT LIKE 'u-%' ORDER BY id`)

describe("plan edits", () => {
  const fresh = ProjectSlug.make("fresh")
  const writePlan = Effect.gen(function*() {
    const created = yield* createProject({ slug: fresh, name: "Fresh", epic: null, coordinator })
    const changes = [
      ...(yield* editPlan(PlanEdit.cases.AddStep.make({
        project: fresh, step: id("first"), title: "First", ticket: TicketKey.make("NEW-1"), after: null, dependsOn: []
      }))),
      ...(yield* editPlan(PlanEdit.cases.AddStep.make({
        project: fresh, step: id("third"), title: "Third", ticket: null, after: null, dependsOn: [id("first")]
      }))),
      ...(yield* editPlan(PlanEdit.cases.AddStep.make({
        project: fresh, step: id("second"), title: "Second", ticket: null, after: id("first"), dependsOn: []
      })))
    ]
    return { created, changes }
  })

  it.effect("writes a plan into an empty database", () =>
    withEmptyDatabase(Effect.gen(function*() {
      const { created, changes } = yield* writePlan
      expect(created).toBe(true)
      expect(changes.map((c) => c._tag)).toEqual(["StepAdded", "StepAdded", "DependencyAdded", "StepAdded"])
      const view = yield* readProject(fresh)
      expect(view?.project.state).toBe("Planning")
      expect(view?.project.coordinator).toEqual(coordinator)
      expect(view?.steps.map((n) => [n.step.id, n.state])).toEqual([
        ["first", "Ready"],
        ["second", "Ready"],
        ["third", "Blocked"]
      ])
      expect(dependsOn(view, "third")).toEqual(["first"])
    })))

  it.effect("changes nothing when the same plan is written again", () =>
    withEmptyDatabase(Effect.gen(function*() {
      yield* writePlan
      const before = yield* readProject(fresh)
      expect(yield* writePlan, "rerun").toEqual({ created: false, changes: [] })
      expect(yield* readProject(fresh)).toEqual(before)
    })))

  it.effect("refuses a rerun that disagrees with what is stored", () =>
    withEmptyDatabase(Effect.gen(function*() {
      yield* writePlan
      const project = yield* Effect.flip(createProject({ slug: fresh, name: "Other", epic: null, coordinator }))
      expect(project._tag).toBe("ProjectExists")
      const step = yield* Effect.flip(editPlan(PlanEdit.cases.AddStep.make({
        project: fresh, step: id("first"), title: "Renamed", ticket: TicketKey.make("NEW-1"), after: null, dependsOn: []
      })))
      expect(step).toMatchObject({ _tag: "StepExists", title: "First" })
    })))

  it.effect("refuses a ticket that another step holds", () =>
    withChase2146(Effect.gen(function*() {
      const error = yield* Effect.flip(editPlan(PlanEdit.cases.AddStep.make({
        project: slug, step: id("new"), title: "New", ticket: TicketKey.make("CHASE-2148"), after: null, dependsOn: []
      })))
      expect(error).toMatchObject({ _tag: "TicketTaken", step: "route-readers" })
      expect(node(yield* readProject(slug), "new")).toBeUndefined()
    })))

  it.effect("refuses a dependency that closes a cycle and names the loop", () =>
    withChase2146(Effect.gen(function*() {
      const before = yield* readProject(slug)
      const error = yield* Effect.flip(editPlan(PlanEdit.cases.AddDependency.make({
        project: slug, step: id("route-readers"), on: id("promote-or-share")
      })))
      expect(error).toMatchObject({
        _tag: "DependencyCycle",
        path: ["route-readers", "require-viewer", "rule-reads-access", "draft-access-rows", "promote-or-share", "route-readers"]
      })
      expect(yield* readProject(slug)).toEqual(before)
    })))

  it.effect("refuses a dependency added through a rerun of step add when it closes a cycle", () =>
    withChase2146(Effect.gen(function*() {
      const error = yield* Effect.flip(editPlan(PlanEdit.cases.AddStep.make({
        project: slug,
        step: id("route-readers"),
        title: "Route readers that bypass the applications aggregate through it",
        ticket: TicketKey.make("CHASE-2148"),
        after: null,
        dependsOn: [id("require-viewer")]
      })))
      expect(error._tag).toBe("DependencyCycle")
    })))

  it.effect("unblocks a step when its last unfinished dependency is removed", () =>
    withChase2146(Effect.gen(function*() {
      expect(stateOf(yield* readProject(slug), "internal-api-reads")).toBe("Blocked")
      yield* editPlan(PlanEdit.cases.RemoveDependency.make({
        project: slug, step: id("internal-api-reads"), on: id("require-viewer")
      }))
      expect(stateOf(yield* readProject(slug), "internal-api-reads")).toBe("Ready")
    })))

  it.effect("rewrites a step's title and ticket, keeping its place and edges", () =>
    withChase2146(Effect.gen(function*() {
      const rewrite = PlanEdit.cases.RewriteStep.make({
        project: slug, step: id("cache-by-viewer"), title: "Cache search results per viewer", ticket: TicketKey.make("CHASE-2999")
      })
      expect(yield* editPlan(rewrite)).toHaveLength(1)
      expect(yield* editPlan(rewrite), "rerun").toEqual([])
      const view = yield* readProject(slug)
      expect(node(view, "cache-by-viewer")?.step).toMatchObject({
        title: "Cache search results per viewer", ticket: "CHASE-2999", dependsOn: ["rule-reads-access"]
      })
      expect(view?.steps[6]?.step.id).toBe("cache-by-viewer")
    })))

  it.effect("splits a step so its waiters wait on every part", () =>
    withChase2146(Effect.gen(function*() {
      const split = PlanEdit.cases.SplitStep.make({
        project: slug, step: id("cache-by-viewer"), parts: [{ id: id("cache-by-viewer-index"), title: "Rebuild the index per viewer" }]
      })
      yield* editPlan(split)
      const view = yield* readProject(slug)
      const order = view?.steps.map((n) => n.step.id) ?? []
      expect(order.indexOf(id("cache-by-viewer-index"))).toBe(order.indexOf(id("cache-by-viewer")) + 1)
      expect(dependsOn(view, "cache-by-viewer-index")).toEqual(["rule-reads-access"])
      expect(dependsOn(view, "draft-access-rows")).toEqual(["cache-by-viewer", "cache-by-viewer-index", "rule-reads-access"])
      expect(node(view, "cache-by-viewer")?.step.ticket).toBe("CHASE-2153")
      expect(node(view, "cache-by-viewer-index")?.step.ticket).toBeNull()
      expect(yield* editPlan(split), "rerun").toEqual([])
    })))

  it.effect("reruns a split after its parts were sequenced without touching their edges", () =>
    withChase2146(Effect.gen(function*() {
      const split = PlanEdit.cases.SplitStep.make({
        project: slug,
        step: id("cache-by-viewer"),
        parts: [
          { id: id("cache-index"), title: "Rebuild the index per viewer" },
          { id: id("cache-warm"), title: "Warm the cache per viewer" }
        ]
      })
      yield* editPlan(split)
      yield* editPlan(PlanEdit.cases.AddDependency.make({ project: slug, step: id("cache-index"), on: id("cache-by-viewer") }))
      const before = yield* readProject(slug)
      expect(yield* editPlan(split), "rerun").toEqual([])
      expect(yield* readProject(slug)).toEqual(before)
    })))

  it.effect("drops a step with work, keeping its links and handing its waiters its dependencies", () =>
    withChase2146(Effect.gen(function*() {
      const drop = PlanEdit.cases.DropStep.make({ project: slug, step: id("require-viewer") })
      yield* editPlan(drop)
      const view = yield* readProject(slug)
      expect(stateOf(view, "require-viewer")).toBe("Dropped")
      expect(node(view, "require-viewer")?.threads).toHaveLength(2)
      expect(node(view, "require-viewer")?.pullRequests).toHaveLength(2)
      expect(dependsOn(view, "require-viewer")).toEqual([])
      expect(dependsOn(view, "rule-reads-access")).toEqual(["access-table", "route-readers"])
      expect(dependsOn(view, "internal-api-reads")).toEqual(["route-readers"])
      expect(stateOf(view, "internal-api-reads")).toBe("Ready")
      expect(yield* editPlan(drop), "rerun").toEqual([])
    })))

  it.effect("keeps the first mark when a done step is dropped", () =>
    withChase2146(Effect.gen(function*() {
      expect(yield* editPlan(PlanEdit.cases.DropStep.make({ project: slug, step: id("fail-closed-delete") }))).toEqual([])
      expect(stateOf(yield* readProject(slug), "fail-closed-delete")).toBe("Done")
    })))

  it.effect("bridges waiters when the user drops a step from the project page", () =>
    withChase2146(Effect.gen(function*() {
      yield* closeStep({ project: slug, stepId: id("draft-access-rows"), closedAs: "Dropped" })
      const view = yield* readProject(slug)
      expect(dependsOn(view, "promote-or-share")).toEqual(["cache-by-viewer", "rule-reads-access"])
      expect(stateOf(view, "promote-or-share")).toBe("Blocked")
    })))

  it.effect("names the unknown project or step and lists the steps that exist", () =>
    withChase2146(Effect.gen(function*() {
      const project = yield* Effect.flip(editPlan(PlanEdit.cases.DropStep.make({ project: ProjectSlug.make("nope"), step: id("x") })))
      expect(project._tag).toBe("UnknownProject")
      const step = yield* Effect.flip(editPlan(PlanEdit.cases.DropStep.make({ project: slug, step: id("nope") })))
      expect(step).toMatchObject({ _tag: "UnknownStep", step: "nope" })
      expect(step._tag === "UnknownStep" ? step.known : []).toHaveLength(10)
    })))
})

describe("status updates", () => {
  const stepThread = { environmentId: EnvironmentId.make("env-1"), threadId: ThreadId.make("step-thread") }
  const started = (step: string) => StatusUpdate.cases.StepStarted.make({ project: slug, stepId: id(step), thread: stepThread })

  it.effect("links the step thread to the step and the poster to the update, once", () =>
    withChase2146(Effect.gen(function*() {
      expect(yield* recordStatusUpdate(started("cache-by-viewer"), coordinator)).toBe(true)
      expect(yield* recordStatusUpdate(started("cache-by-viewer"), coordinator), "retry").toBe(false)
      const threads = node(yield* readProject(slug), "cache-by-viewer")?.threads
      expect(threads?.map((t) => t.threadId)).toEqual(["step-thread"])
      expect(yield* statusRows).toEqual([
        { id: "StepStarted:chase-2146:cache-by-viewer:env-1/step-thread", thread_id: "coordinator" }
      ])
    })))

  it.effect("shows the title a thread was launched with, and a repost can name an unnamed thread", () =>
    withChase2146(Effect.gen(function*() {
      const titleOf = Effect.map(readProject(slug), (view) => node(view, "cache-by-viewer")?.threads[0]?.title)
      yield* recordStatusUpdate(started("cache-by-viewer"), null)
      expect(yield* titleOf).toBeNull()
      const named = StatusUpdate.cases.StepStarted.make({ ...started("cache-by-viewer"), title: "CHASE-2153: Cache by viewer" })
      expect(yield* recordStatusUpdate(named, null), "same link, so still a retry").toBe(false)
      expect(yield* titleOf).toBe("CHASE-2153: Cache by viewer")
      yield* recordStatusUpdate(started("cache-by-viewer"), null)
      expect(yield* titleOf, "a repost without a title keeps it").toBe("CHASE-2153: Cache by viewer")
    })))

  it.effect("adds the title column to a step_thread table made before it existed", () => {
    const filename = join(mkdtempSync(join(tmpdir(), "mr-handy-")), "old.db")
    return Effect.gen(function*() {
      yield* runScript(filename, `CREATE TABLE step_thread (
        project_slug TEXT NOT NULL, step_id TEXT NOT NULL, env_id TEXT NOT NULL,
        thread_id TEXT NOT NULL, started_at TEXT NOT NULL, PRIMARY KEY (env_id, thread_id))`)
      yield* applySchema(filename)
      yield* applySchema(filename)
      const sql = yield* SqlClient.SqlClient
      const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info('step_thread')`
      expect(columns.map((c) => c.name)).toContain("title")
    }).pipe(Effect.provide(SqliteClient.layer({ filename })))
  })

  it.effect("puts a step with an open pull request in review", () =>
    withChase2146(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const url = "https://github.com/cerbyinc/platform/pull/40000"
      yield* sql`INSERT INTO pull_request_observation VALUES (${url}, 'Open', NULL, '2026-11-04T19:00:00Z')`
      yield* recordStatusUpdate(
        StatusUpdate.cases.PullRequestOpened.make({ project: slug, stepId: id("cache-by-viewer"), url: new URL(url) }),
        null
      )
      expect(stateOf(yield* readProject(slug), "cache-by-viewer")).toBe("InReview")
    })))

  it.effect("refuses a thread already linked to another step and records nothing", () =>
    withChase2146(Effect.gen(function*() {
      yield* recordStatusUpdate(started("cache-by-viewer"), null)
      const error = yield* Effect.flip(recordStatusUpdate(started("draft-access-rows"), null))
      expect(error).toMatchObject({ _tag: "LinkedElsewhere", step: "cache-by-viewer" })
      expect(yield* statusRows).toHaveLength(1)
      expect(node(yield* readProject(slug), "draft-access-rows")?.threads).toEqual([])
    })))
})
