import {
  applySchema,
  createProject,
  databasePath,
  editPlan,
  isRefusal,
  layer,
  listProjects,
  readProject,
  recordStatusUpdate,
  runScript,
  UnknownProject
} from "@mister-handy/db"
import {
  EnvironmentId,
  NewStep,
  type PlanChange,
  PlanEdit,
  PlanStepId,
  ProjectSlug,
  StatusUpdate,
  ThreadId,
  TicketKey
} from "@mister-handy/domain"
import { Config, Console, Data, Effect, FileSystem, Match, Option, Runtime, Schema, type Types } from "effect"
import { Argument, CliError, Command, Flag } from "effect/cli"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { fileURLToPath } from "node:url"

const localEnvironmentId = Effect.gen(function* () {
  const home = yield* Config.String("T3CODE_HOME")
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(`${home}/userdata/environment-id`)

  return yield* Schema.decodeEffect(EnvironmentId)(raw.trim())
})

const t3Thread = Config.schema(ThreadId, "T3CODE_THREAD_ID")

const poster = Effect.all({ environmentId: localEnvironmentId, threadId: t3Thread }).pipe(
  Effect.orElseSucceed(() => null)
)

const describe = Match.type<PlanChange>().pipe(
  Match.tagsExhaustive({
    StepAdded: ({ step, position }) => `Added step ${step} at position ${position}.`,
    StepRewritten: ({ step }) => `Rewrote step ${step}.`,
    StepHeld: ({ step, reason }) => `Held step ${step} on: ${reason}`,
    StepReleased: ({ step }) => `Released step ${step}.`,
    StepClosed: ({ step, closedAs, ticket }) =>
      closedAs === "Done"
        ? `Marked step ${step} Done.`
        : `Dropped step ${step}.${ticket === null ? "" : ` Close its ticket ${ticket}.`}`,
    DependencyAdded: ({ dependency }) => `Added dependency: ${dependency.after} depends on ${dependency.before}.`,
    DependencyRemoved: ({ dependency }) => `Removed dependency: ${dependency.after} depends on ${dependency.before}.`
  })
)

const report = (changes: ReadonlyArray<string>) =>
  changes.length === 0 ? Console.log("No change.") : Effect.forEach(changes, (line) => Console.log(line))

const reportPlan = (changes: ReadonlyArray<PlanChange>) => report(changes.map(describe))

class Refused extends Data.TaggedError("Refused") {
  override readonly [Runtime.errorReported] = false
}

const projectFlag = Flag.String("project").pipe(Flag.withSchema(ProjectSlug))
const stepArgument = Argument.String("step").pipe(Argument.withSchema(PlanStepId))
const stepFlag = (name: string) => Flag.String(name).pipe(Flag.withSchema(PlanStepId))
const titleFlag = Flag.String("title").pipe(Flag.withSchema(Schema.NonEmptyString))
const ticketFlag = Flag.String("ticket").pipe(Flag.withSchema(TicketKey), Flag.optional)

const projectCreate = Command.make(
  "create",
  {
    slug: Argument.String("slug").pipe(Argument.withSchema(ProjectSlug)),
    name: Flag.String("name").pipe(Flag.withSchema(Schema.NonEmptyString)),
    epic: Flag.String("epic").pipe(Flag.withSchema(TicketKey), Flag.optional),
    environment: Flag.String("environment").pipe(Flag.withSchema(EnvironmentId), Flag.optional),
    thread: Flag.String("thread").pipe(Flag.withSchema(ThreadId), Flag.withFallbackConfig(t3Thread))
  },
  Effect.fnUntraced(function* ({ slug, name, epic, environment, thread }) {
    const environmentId = Option.isSome(environment) ? environment.value : yield* localEnvironmentId

    const created = yield* createProject({
      slug,
      name,
      epic: Option.getOrNull(epic),
      coordinator: { environmentId, threadId: thread }
    })

    yield* report(created ? [`Created project ${slug} in Planning.`] : [])
  })
).pipe(Command.withDescription("Create a project in Planning, with the calling thread as its coordinator"))

const projectShow = Command.make(
  "show",
  { slug: Argument.String("slug").pipe(Argument.withSchema(ProjectSlug)) },
  Effect.fnUntraced(function* ({ slug }) {
    const view = yield* readProject(slug)

    if (view === null) return yield* new UnknownProject({ project: slug })
    yield* Console.log(JSON.stringify(view, null, 2))
  })
).pipe(Command.withDescription("Print a project, its plan steps and each step's derived state, as JSON"))

const projectList = Command.make(
  "list",
  {},
  Effect.fnUntraced(function* () {
    for (const { project } of yield* listProjects()) {
      yield* Console.log(`${project.slug}\t${project.state}\t${project.name}`)
    }
  })
).pipe(Command.withDescription("Print one line per project: slug, state and name, tab separated"))

const project = Command.make("project").pipe(
  Command.withDescription("Create, list and show projects"),
  Command.withSubcommands([projectCreate, projectShow, projectList]),
  Command.provide(layer)
)

const stepGroup = Command.make("step").pipe(Command.withSharedFlags({ project: projectFlag }))

const stepAdd = Command.make(
  "add",
  {
    step: stepArgument,
    title: titleFlag,
    ticket: ticketFlag,
    after: stepFlag("after").pipe(Flag.optional),
    dependsOn: stepFlag("depends-on").pipe(Flag.atLeast(0))
  },
  Effect.fnUntraced(function* ({ step, title, ticket, after, dependsOn }) {
    const { project } = yield* stepGroup
    yield* reportPlan(
      yield* editPlan(
        PlanEdit.cases.AddStep.make({
          project,
          step,
          title,
          ticket: Option.getOrNull(ticket),
          after: Option.getOrNull(after),
          dependsOn
        })
      )
    )
  })
).pipe(Command.withDescription("Add a step, at the end of the plan unless --after says where"))

const stepRewrite = Command.make(
  "rewrite",
  { step: stepArgument, title: titleFlag.pipe(Flag.optional), ticket: ticketFlag },
  Effect.fnUntraced(function* ({ step, title, ticket }) {
    const { project } = yield* stepGroup

    if (Option.isNone(title) && Option.isNone(ticket)) {
      return yield* new CliError.UserError({ cause: null, userMessage: "step rewrite needs --title or --ticket." })
    }

    const rewrite: Types.Mutable<Parameters<typeof PlanEdit.cases.RewriteStep.make>[0]> = { project, step }

    if (Option.isSome(title)) rewrite.title = title.value

    if (Option.isSome(ticket)) rewrite.ticket = ticket.value

    yield* reportPlan(yield* editPlan(PlanEdit.cases.RewriteStep.make(rewrite)))
  })
).pipe(Command.withDescription("Change a step's title or ticket"))

const parsePart = (value: string) => {
  const at = value.indexOf("=")

  return at === -1
    ? Option.none()
    : Schema.decodeOption(NewStep)({ id: value.slice(0, at), title: value.slice(at + 1) })
}

const stepSplit = Command.make(
  "split",
  {
    step: stepArgument,
    parts: Flag.String("part").pipe(
      Flag.filterMap(parsePart, () => "<new-step>=<title>"),
      Flag.atLeast(1)
    )
  },
  Effect.fnUntraced(function* ({ step, parts: [first, ...rest] }) {
    const { project } = yield* stepGroup

    if (first === undefined) return yield* new CliError.MissingOption({ option: "part" })
    yield* reportPlan(yield* editPlan(PlanEdit.cases.SplitStep.make({ project, step, parts: [first, ...rest] })))
  })
).pipe(
  Command.withDescription(
    "Split new steps off a step. Each part waits on what it waited on, and blocks what it blocked"
  )
)

const stepDrop = Command.make(
  "drop",
  { step: stepArgument },
  Effect.fnUntraced(function* ({ step }) {
    const { project } = yield* stepGroup
    yield* reportPlan(yield* editPlan(PlanEdit.cases.DropStep.make({ project, step })))
  })
).pipe(Command.withDescription("Mark a step Dropped. What waited on it waits on its dependencies instead"))

const stepHold = Command.make(
  "hold",
  {
    step: stepArgument,
    reason: Flag.String("reason").pipe(
      Flag.withSchema(Schema.NonEmptyString),
      Flag.withDescription("The decision the user has to make, shown on the project page")
    )
  },
  Effect.fnUntraced(function* ({ step, reason }) {
    const { project } = yield* stepGroup
    yield* reportPlan(yield* editPlan(PlanEdit.cases.HoldStep.make({ project, step, reason })))
  })
).pipe(Command.withDescription("Hold a step on a decision only the user can make. It reads Needs you until released"))

const stepRelease = Command.make(
  "release",
  { step: stepArgument },
  Effect.fnUntraced(function* ({ step }) {
    const { project } = yield* stepGroup
    yield* reportPlan(yield* editPlan(PlanEdit.cases.ReleaseStep.make({ project, step })))
  })
).pipe(Command.withDescription("Release a held step once the user has decided"))

const stepCommand = stepGroup.pipe(
  Command.withDescription("Add, rewrite, split, drop, hold or release plan steps"),
  Command.withSubcommands([stepAdd, stepRewrite, stepSplit, stepDrop, stepHold, stepRelease]),
  Command.provide(layer)
)

const dependencyGroup = Command.make("dependency").pipe(Command.withSharedFlags({ project: projectFlag }))

const edgeConfig = { step: stepArgument, on: stepFlag("on") }

const dependencyAdd = Command.make(
  "add",
  edgeConfig,
  Effect.fnUntraced(function* ({ step, on }) {
    const { project } = yield* dependencyGroup
    yield* reportPlan(yield* editPlan(PlanEdit.cases.AddDependency.make({ project, step, on })))
  })
).pipe(Command.withDescription("Make a step wait on another"))

const dependencyRemove = Command.make(
  "remove",
  edgeConfig,
  Effect.fnUntraced(function* ({ step, on }) {
    const { project } = yield* dependencyGroup
    yield* reportPlan(yield* editPlan(PlanEdit.cases.RemoveDependency.make({ project, step, on })))
  })
).pipe(Command.withDescription("Stop a step waiting on another"))

const dependency = dependencyGroup.pipe(
  Command.withDescription("Add or remove dependencies between plan steps"),
  Command.withSubcommands([dependencyAdd, dependencyRemove]),
  Command.provide(layer)
)

const started = Command.make(
  "started",
  {
    project: projectFlag,
    step: stepFlag("step"),
    environment: Flag.String("environment").pipe(Flag.withSchema(EnvironmentId), Flag.optional),
    thread: Flag.String("thread").pipe(Flag.withSchema(ThreadId)),
    title: Flag.String("title").pipe(
      Flag.withSchema(Schema.NonEmptyString),
      Flag.withDescription("The title the thread was launched with, shown on the project page"),
      Flag.optional
    )
  },
  Effect.fnUntraced(function* ({ project, step, environment, thread, title }) {
    const environmentId = Option.isSome(environment) ? environment.value : yield* localEnvironmentId

    const started: Types.Mutable<Parameters<typeof StatusUpdate.cases.StepStarted.make>[0]> = {
      project,
      stepId: step,
      thread: { environmentId, threadId: thread }
    }

    if (Option.isSome(title)) started.title = title.value

    const update = StatusUpdate.cases.StepStarted.make(started)

    const recorded = yield* recordStatusUpdate(update, yield* poster)
    yield* report(recorded ? [`Recorded: step ${step} started in thread ${environmentId}/${thread}.`] : [])
  })
).pipe(Command.withDescription("Report that a step thread started work on a plan step"))

const pullRequestOpened = Command.make(
  "pr-opened",
  {
    project: projectFlag,
    step: stepFlag("step"),
    url: Flag.String("url").pipe(Flag.withSchema(Schema.URLFromString))
  },
  Effect.fnUntraced(function* ({ project, step, url }) {
    const update = StatusUpdate.cases.PullRequestOpened.make({ project, stepId: step, url })
    const recorded = yield* recordStatusUpdate(update, yield* poster)
    yield* report(recorded ? [`Recorded: pull request ${url.href} opened for step ${step}.`] : [])
  })
).pipe(Command.withDescription("Report that a pull request was opened for a plan step"))

const status = Command.make("status").pipe(
  Command.withDescription("Report a plan step's progress"),
  Command.withSubcommands([started, pullRequestOpened]),
  Command.provide(layer)
)

const init = Command.make(
  "init",
  {},
  Effect.fnUntraced(function* () {
    const filename = yield* databasePath
    yield* applySchema(filename)
    yield* Console.log(`Schema applied to ${filename}`)
  })
).pipe(Command.withDescription("Create the database tables that don't exist yet"))

const load = Command.make(
  "load",
  { script: Argument.FileText("file") },
  Effect.fnUntraced(function* ({ script }) {
    const filename = yield* databasePath
    yield* runScript(filename, script)
    yield* Console.log(`Loaded into ${filename}`)
  })
).pipe(Command.withDescription("Run a SQL file against the database in one transaction"))

const db = Command.make("db").pipe(
  Command.withDescription(`Manage the SQLite database at $MR_HANDY_DB, by default ~/.mr-handy/mister-handy.db`),
  Command.withSubcommands([init, load])
)

// Relative paths resolve the same from src/cli.ts and from the bundled dist/bin.js.
const coordinatorSkill = fileURLToPath(new URL("../../../skills/coordinator", import.meta.url))

const claudeSkills = Config.String("CLAUDE_CONFIG_DIR").pipe(
  Config.orElse(() => Config.String("HOME").pipe(Config.map((home) => `${home}/.claude`))),
  Config.map((dir) => `${dir}/skills`)
)

const skillInstall = Command.make(
  "install",
  {},
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const skills = yield* claudeSkills
    const link = `${skills}/coordinator`
    const current = yield* fs.readLink(link).pipe(Effect.option)

    if (Option.isSome(current) && current.value === coordinatorSkill) return yield* report([])

    if (Option.isNone(current) && (yield* fs.exists(link))) {
      return yield* new CliError.UserError({
        cause: null,
        userMessage: `${link} exists and is not a symlink. Move it away and rerun.`
      })
    }

    if (Option.isSome(current)) yield* fs.remove(link)
    yield* fs.makeDirectory(skills, { recursive: true })
    yield* fs.symlink(coordinatorSkill, link)
    yield* report([
      Option.isSome(current)
        ? `Relinked ${link} to ${coordinatorSkill}, was ${current.value}.`
        : `Linked ${link} to ${coordinatorSkill}.`
    ])
  })
).pipe(
  Command.withDescription("Symlink the /coordinator skill into $CLAUDE_CONFIG_DIR/skills, by default ~/.claude/skills")
)

const skill = Command.make("skill").pipe(
  Command.withDescription("Install the /coordinator skill for Claude Code"),
  Command.withSubcommands([skillInstall])
)

const webApp = fileURLToPath(new URL("../../web", import.meta.url))
const appPort = 3000

// 443 on this machine already serves T3 Code.
const tailnetPort = 8300

const run = Effect.fnUntraced(function* (command: string, args: ReadonlyArray<string>, cwd?: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

  const exitCode = yield* spawner.exitCode(
    ChildProcess.make(command, args, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  )

  if (exitCode !== 0) {
    return yield* new CliError.UserError({ cause: null, userMessage: `${command} exited with code ${exitCode}.` })
  }
})

const serve = Command.make(
  "serve",
  {
    tailscale: Flag.Boolean("tailscale").pipe(
      Flag.withDefault(false),
      Flag.withDescription(`Also serve it on your tailnet at port ${tailnetPort}`)
    )
  },
  Effect.fnUntraced(function* ({ tailscale }) {
    const fs = yield* FileSystem.FileSystem

    if (!(yield* fs.exists(`${webApp}/dist/server/server.js`))) {
      return yield* new CliError.UserError({
        cause: null,
        userMessage: "The web app isn't built. Run pnpm build first."
      })
    }

    if (tailscale) {
      yield* run("tailscale", ["serve", "--bg", `--https=${tailnetPort}`, `http://127.0.0.1:${appPort}`])
    }

    yield* run(
      `${webApp}/node_modules/.bin/vite`,
      ["preview", "--host", "127.0.0.1", "--port", String(appPort), "--strictPort"],
      webApp
    )
  })
).pipe(Command.withDescription(`Run the built web app on http://127.0.0.1:${appPort}`))

const mrHandy = Command.make("mr-handy").pipe(
  Command.withDescription("Record a project's plan and progress in Mister Handy"),
  Command.withSubcommands([project, stepCommand, dependency, status, db, skill, serve])
)

export const cli = (args: ReadonlyArray<string>) =>
  Command.runWith(mrHandy, { version: "0.0.0" })(args).pipe(
    Effect.catchIf(isRefusal, (refusal) =>
      Console.error(`Refused: ${refusal.message}`).pipe(Effect.andThen(Effect.fail(new Refused())))
    )
  )
