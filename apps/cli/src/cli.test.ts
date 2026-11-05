import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { layer, readProject } from "@mister-handy/db"
import { ProjectSlug } from "@mister-handy/domain"
import { ConfigProvider, Console, Effect, Exit } from "effect"
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cli } from "./cli.ts"

describe("mr-handy", () => {
  it.effect("writes a plan and a status update, and refuses a cycle", () => {
    const env = { MR_HANDY_DB: join(mkdtempSync(join(tmpdir(), "mr-handy-cli-")), "test.db") }
    const stdout: Array<string> = []
    const stderr: Array<string> = []
    const run = (...args: ReadonlyArray<string>) => {
      stdout.length = 0
      stderr.length = 0
      return Effect.exit(cli(args))
    }
    return Effect.gen(function*() {
      yield* run("db", "init")
      yield* run("project", "create", "demo", "--name", "Demo", "--environment", "env-1", "--thread", "coordinator")
      expect(stdout).toEqual(["Created project demo in Planning."])
      yield* run("step", "add", "first", "--project", "demo", "--title", "First")
      yield* run("step", "--project", "demo", "add", "second", "--title", "Second", "--depends-on", "first")
      expect(stdout, "shared --project before the verb").toEqual([
        "Added step second at position 2.",
        "Added dependency: second depends on first."
      ])
      yield* run("step", "split", "second", "--project", "demo", "--part", "second-b=Second, b=c", "--part", "second-a=Second, a")
      yield* run("status", "started", "--project", "demo", "--step", "first", "--environment", "env-1", "--thread", "step-1")
      expect(stdout).toEqual(["Recorded: step first started in thread env-1/step-1."])
      yield* run("status", "started", "--project", "demo", "--step", "first", "--environment", "env-1", "--thread", "step-1")
      expect(stdout, "retry").toEqual(["No change."])

      const view = yield* readProject(ProjectSlug.make("demo")).pipe(Effect.provide(layer))
      expect(view?.steps.map((n) => [n.step.id, n.step.title, n.step.dependsOn])).toEqual([
        ["first", "First", []],
        ["second", "Second", ["first"]],
        ["second-b", "Second, b=c", ["first"]],
        ["second-a", "Second, a", ["first"]]
      ])
      expect(view?.steps[0]?.threads.map((t) => t.threadId)).toEqual(["step-1"])

      yield* run("project", "list")
      expect(stdout).toEqual(["demo\tPlanning\tDemo"])
      yield* run("project", "show", "demo")
      const shown = JSON.parse(stdout.join("\n"))
      expect(shown.steps.map((n: { step: { id: string }; state: string }) => [n.step.id, n.state])).toEqual([
        ["first", "Ready"],
        ["second", "Blocked"],
        ["second-b", "Blocked"],
        ["second-a", "Blocked"]
      ])
      const missing = yield* run("project", "show", "nope")
      expect(Exit.isFailure(missing), "unknown project fails the command").toBe(true)
      expect(stderr).toEqual(["Refused: there is no project nope."])

      yield* run("step", "hold", "first", "--project", "demo", "--reason", "Which order do the routes ship in?")
      expect(stdout).toEqual(["Held step first on: Which order do the routes ship in?"])
      yield* run("step", "hold", "first", "--project", "demo", "--reason", "Which order do the routes ship in?")
      expect(stdout, "hold rerun").toEqual(["No change."])
      yield* run("project", "show", "demo")
      const held = JSON.parse(stdout.join("\n"))
      expect([held.steps[0].state, held.steps[0].step.heldFor]).toEqual(["NeedsYou", "Which order do the routes ship in?"])
      yield* run("step", "release", "first", "--project", "demo")
      expect(stdout).toEqual(["Released step first."])
      yield* run("step", "release", "first", "--project", "demo")
      expect(stdout, "release rerun").toEqual(["No change."])

      const refused = yield* run("dependency", "add", "first", "--project", "demo", "--on", "second")
      expect(Exit.isFailure(refused), "refusal fails the command").toBe(true)
      expect(stderr).toEqual(["Refused: first depending on second would close a cycle: first -> second -> first."])
      expect(stdout).toEqual([])
    }).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: (...args: ReadonlyArray<unknown>) => void stdout.push(args.join(" ")),
        error: (...args: ReadonlyArray<unknown>) => void stderr.push(args.join(" "))
      })
    )
  })

  it.effect("links the coordinator skill, converges on rerun, and replaces a stale link", () => {
    const config = mkdtempSync(join(tmpdir(), "mr-handy-claude-"))
    const link = join(config, "skills", "coordinator")
    const skill = join(import.meta.dirname, "..", "..", "..", "skills", "coordinator")
    const stdout: Array<string> = []
    const stderr: Array<string> = []
    const run = (...args: ReadonlyArray<string>) => {
      stdout.length = 0
      stderr.length = 0
      return Effect.exit(cli(args))
    }
    return Effect.gen(function*() {
      yield* run("skill", "install")
      expect(stdout).toEqual([`Linked ${link} to ${skill}.`])
      expect(readlinkSync(link)).toBe(skill)
      yield* run("skill", "install")
      expect(stdout, "rerun").toEqual(["No change."])

      const stale = mkdtempSync(join(tmpdir(), "mr-handy-old-checkout-"))
      rmSync(link)
      symlinkSync(stale, link)
      yield* run("skill", "install")
      expect(stdout).toEqual([`Relinked ${link} to ${skill}, was ${stale}.`])
      expect(readlinkSync(link)).toBe(skill)

      rmSync(link)
      mkdirSync(link)
      const blocked = yield* run("skill", "install")
      expect(Exit.isFailure(blocked), "a real directory is left alone").toBe(true)
    }).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: { CLAUDE_CONFIG_DIR: config } })),
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: (...args: ReadonlyArray<unknown>) => void stdout.push(args.join(" ")),
        error: (...args: ReadonlyArray<unknown>) => void stderr.push(args.join(" "))
      })
    )
  })
})
