import { SqliteClient } from "@effect/sql-sqlite-node"
import { SqlClient } from "effect/sql"
import { describe, expect, it } from "@effect/vitest"
import { PlanStepId, ProjectSlug, TicketKey } from "@mister-handy/domain"
import { Effect } from "effect"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import chase2146 from "../../../docs/examples/chase-2146.sql?raw"
import { applySchema, closeStep, listProjects, readProject, runScript } from "./index.ts"

const withChase2146 = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => {
  const filename = join(mkdtempSync(join(tmpdir(), "mr-handy-")), "test.db")
  return applySchema(filename).pipe(
    Effect.andThen(applySchema(filename)),
    Effect.andThen(runScript(filename, chase2146)),
    Effect.andThen(effect),
    Effect.provide(SqliteClient.layer({ filename }))
  )
}

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
