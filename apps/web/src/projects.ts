import { closeStep, CloseStep, layer, listProjects, readPlan, readProject } from "@mister-handy/db"
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

const getPlan = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(({ data }) => Effect.runPromise(Effect.flatMap(Schema.decodeEffect(ProjectSlug)(data), readPlan)))

const postCloseStep = createServerFn({ method: "POST" })
  .validator((input: typeof CloseStep.Encoded) => input)
  .handler(({ data }) => database.runPromise(Effect.flatMap(Schema.decodeEffect(CloseStep)(data), closeStep)))

export const projectsAtom = Atom.make(Effect.tryPromise(() => getProjects()))

const projectSourceAtom = Atom.family((slug: ProjectSlug) => Atom.make(Effect.tryPromise(() => getProject({ data: slug }))))

const isVisible = () => typeof document !== "undefined" && document.visibilityState === "visible"

const visibleAtom = Atom.make((get) => {
  if (typeof document === "undefined") return false
  const onChange = () => get.setSelf(isVisible())
  document.addEventListener("visibilitychange", onChange)
  get.addFinalizer(() => document.removeEventListener("visibilitychange", onChange))
  return isVisible()
})

// Refetches the open project 5 seconds after each result while the tab is visible, and
// right away when the tab comes back. Stops once no page reads it.
export const projectAtom = Atom.family((slug: ProjectSlug) => {
  const source = projectSourceAtom(slug)
  let wasVisible = true
  return Atom.transform(source, (get) => {
    const visible = get(visibleAtom)
    const delay = visible && !wasVisible ? 0 : 5000
    wasVisible = visible
    if (visible) {
      const timer = setTimeout(() => get.refresh(source), delay)
      get.addFinalizer(() => clearTimeout(timer))
    }
    return get(source)
  }, { initialValueTarget: source })
})

/** Read once each time the panel opens it; the plan changes rarely enough not to poll. */
export const planAtom = Atom.family((slug: ProjectSlug) => Atom.make(Effect.tryPromise(() => getPlan({ data: slug }))))

export const closeStepAtom = Atom.fn((input: CloseStep, get) =>
  Effect.tryPromise(() => postCloseStep({ data: input })).pipe(
    Effect.tap(() => Effect.sync(() => get.refresh(projectSourceAtom(input.project))))
  )
)
