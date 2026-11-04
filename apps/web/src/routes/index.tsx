import { useAtomValue } from "@effect/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { projectsAtom } from "../projects.ts"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  const projects = useAtomValue(projectsAtom)
  return (
    <main>
      <h1>Projects</h1>
      {AsyncResult.match(projects, {
        onInitial: () => <p>Loading projects</p>,
        onFailure: () => <p>Could not load projects</p>,
        onSuccess: ({ value }) => (
          <ul>
            {value.map((project) => (
              <li key={project.slug}>
                <Link to="/projects/$projectSlug" params={{ projectSlug: project.slug }}>
                  {project.name}
                </Link>{" "}
                {project.state}
              </li>
            ))}
          </ul>
        )
      })}
    </main>
  )
}
