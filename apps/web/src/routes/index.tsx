import { useAtomSuspense } from "@effect/atom-react"
import type { StepState } from "@mister-handy/domain"
import { threadDeepLink } from "@mister-handy/domain"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Suspense } from "react"
import { projectsAtom } from "../projects.ts"
import { jiraUrl, Nav, StatePill, stateColor, yourTurn } from "../ui.tsx"

export const Route = createFileRoute("/")({ component: HomePage })

const barOrder: ReadonlyArray<StepState> = ["Done", "Merged", "InReview", "NeedsYou", "Working", "Ready", "Blocked"]

function HomePage() {
  return (
    <main>
      <Nav />
      <h1>Projects</h1>
      <Suspense fallback={<p className="muted">Loading projects</p>}>
        <Projects />
      </Suspense>
    </main>
  )
}

function Projects() {
  const { value: projects } = useAtomSuspense(projectsAtom)

  if (projects.length === 0) {
    return (
      <p className="muted">
        No projects yet. Run <span className="mono">mr-handy db init</span> and load a plan.
      </p>
    )
  }

  const waiting = projects.flatMap((view) => yourTurn(view.steps).map((node) => ({ view, node })))

  return (
    <>
      <div className="row">
        {projects.map(({ project, steps }) => {
          const count = (state: StepState) => steps.filter((node) => node.state === state).length

          return (
            <div key={project.slug} className="box card">
              <div className="head">
                <Link to="/projects/$projectSlug" params={{ projectSlug: project.slug }}>
                  <b>{project.name}</b>
                </Link>
                <span className="pill">{project.state}</span>
              </div>
              <div className="bar">
                {barOrder.map(
                  (state) =>
                    count(state) > 0 && (
                      <div
                        key={state}
                        style={{
                          flex: count(state),
                          background: stateColor[state],
                          opacity: state === "Blocked" ? 0.35 : 1
                        }}
                      />
                    )
                )}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {count("Merged") + count("Done")} of {steps.length - count("Dropped")} finished · {count("InReview")} in
                review
                {" · "}
                {count("NeedsYou")} need you · {count("Ready")} ready · {count("Blocked")} blocked
              </div>
              <div style={{ fontSize: 12 }}>
                {project.epic && <a href={jiraUrl(project.epic)}>{project.epic}</a>}
                {project.epic && project.coordinator && " · "}
                {project.coordinator && <a href={threadDeepLink(project.coordinator)}>coordinator</a>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="box">
        <h2>Needs you, across projects</h2>
        {waiting.length === 0 ? (
          <p className="muted">Nothing waits on you.</p>
        ) : (
          <ul>
            {waiting.map(({ view, node }) => (
              <li key={`${view.project.slug}/${node.step.id}`}>
                <StatePill state={node.state} />{" "}
                <Link
                  to="/projects/$projectSlug"
                  params={{ projectSlug: view.project.slug }}
                  search={{ step: node.step.id }}
                >
                  {node.step.ticket ?? node.step.id}
                </Link>{" "}
                <span className="muted">
                  {node.step.title} · {view.project.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
