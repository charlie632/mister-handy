import { closeStep, CloseStep, layer, listProjects, readProject } from "@mister-handy/db"
import { ProjectSlug } from "@mister-handy/domain"
import { createServerFn } from "@tanstack/react-start"
import { Effect, ManagedRuntime, Schema } from "effect"
import { Atom } from "effect/reactivity"

const database = ManagedRuntime.make(layer)

const getProjects = createServerFn({ method: "GET" }).handler(() => database.runPromise(listProjects()))

// Inputs are decoded inside the handler: TanStack's serializable types strip Effect brands.
const getProject = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(({ data }) => database.runPromise(Effect.flatMap(Schema.decodeEffect(ProjectSlug)(data), readProject)))

const postCloseStep = createServerFn({ method: "POST" })
  .validator((input: typeof CloseStep.Encoded) => input)
  .handler(({ data }) => database.runPromise(Effect.flatMap(Schema.decodeEffect(CloseStep)(data), closeStep)))

export const projectsAtom = Atom.make(Effect.tryPromise(() => getProjects()))

export const projectAtom = Atom.family((slug: ProjectSlug) => Atom.make(Effect.tryPromise(() => getProject({ data: slug }))))

export const closeStepAtom = Atom.fn((input: CloseStep, get) =>
  Effect.tryPromise(() => postCloseStep({ data: input })).pipe(
    Effect.tap(() => Effect.sync(() => get.refresh(projectAtom(input.project))))
  )
)
