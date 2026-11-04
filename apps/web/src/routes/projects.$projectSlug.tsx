import { ProjectSlug } from "@mister-handy/domain"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { Option, Schema } from "effect"

export const Route = createFileRoute("/projects/$projectSlug")({
  params: {
    parse: ({ projectSlug }) => ({
      projectSlug: Option.getOrThrowWith(Schema.decodeOption(ProjectSlug)(projectSlug), () => notFound())
    }),
    stringify: ({ projectSlug }) => ({ projectSlug })
  },
  component: ProjectPage
})

function ProjectPage() {
  const { projectSlug } = Route.useParams()
  return (
    <main>
      <Link to="/">Projects</Link>
      <h1>{projectSlug}</h1>
      <section aria-label="Step graph">Step graph goes here.</section>
    </main>
  )
}
