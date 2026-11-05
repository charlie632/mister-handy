import { useAtomSet, useAtomSuspense } from "@effect/atom-react"
import type { ProjectView } from "@mister-handy/db"
import { isFinished, PlanStepId, ProjectSlug, type StepNode, threadDeepLink } from "@mister-handy/domain"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { type CSSProperties, Suspense } from "react"
import { PanelToggle, RightPanel } from "../panel.tsx"
import { closeStepAtom, projectAtom } from "../projects.ts"
import { jiraUrl, Nav, prNumber, StatePill, StepGraph, stateColor, stateLabel, yourTurn } from "../ui.tsx"

export const Route = createFileRoute("/projects/$projectSlug")({
  params: {
    parse: ({ projectSlug }) => ({
      projectSlug: Option.getOrThrowWith(Schema.decodeOption(ProjectSlug)(projectSlug), () => notFound())
    }),
    stringify: ({ projectSlug }) => ({ projectSlug })
  },
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ step: Schema.optional(PlanStepId) })),
  component: ProjectPage
})

function ProjectPage() {
  return (
    <Suspense fallback={<main><Nav /><p className="muted">Loading project</p></main>}>
      <ProjectContent />
    </Suspense>
  )
}

function ProjectContent() {
  const { projectSlug } = Route.useParams()
  const { step } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { value: view } = useAtomSuspense(projectAtom(projectSlug))
  if (view === null) {
    return <main><Nav /><p>No project called {projectSlug}.</p></main>
  }
  const { project, steps } = view
  const waiting = yourTurn(steps)
  const selected = steps.find((node) => node.step.id === step)
  const select = (id: PlanStepId | undefined) =>
    navigate({ search: id === undefined ? {} : { step: id }, replace: true, resetScroll: false })
  const fallback = waiting[0] ?? steps[0]

  return (
    <div className="workspace">
    <div className="workspace-main">
    <main>
      <Nav project={project} />
      <div className="head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1>{project.name}</h1>
          <div className="muted" style={{ fontSize: 12 }}>
            {project.coordinator && (
              <>Coordinator <a href={threadDeepLink(project.coordinator)}>{view.coordinatorTitle ?? `Coordinator: ${project.name}`}</a> · </>
            )}
            {view.observedAt ? `observed ${view.observedAt.slice(11, 16)} UTC` : "not observed yet"}
          </div>
        </div>
        <div className="head-actions">
          <span className="pill">{project.state}</span>
          {fallback && (
            <PanelToggle
              open={selected !== undefined}
              onToggle={() => select(selected === undefined ? fallback.step.id : undefined)}
            />
          )}
        </div>
      </div>

      <div className="row">
        <div className="box">
          <h2>Plan and epic</h2>
          <ul>
            {project.references.map((ref) => <li key={ref.url}><a href={ref.url}>{ref.label}</a></li>)}
            <li><span className="mono muted">~/.mr-handy/{project.slug}/plan.md</span></li>
          </ul>
        </div>
        <div className="box">
          <h2>Your turn</h2>
          {waiting.length === 0 ? <p className="muted">Nothing waits on you.</p> : (
            <ul>
              {waiting.map((node) => (
                <li key={node.step.id}>
                  <StatePill state={node.state} /> <StepLink slug={project.slug} node={node} />{" "}
                  <span className="muted">{node.step.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="box graph">
        <div className="head" style={{ padding: "0 8px 6px" }}>
          <h2 style={{ margin: 0 }}>Step graph</h2>
          <div className="legend">
            {(["Blocked", "Ready", "Working", "NeedsYou", "InReview", "Merged"] as const).map((state) => (
              <span key={state} style={{ "--c": stateColor[state] } as CSSProperties}>{stateLabel(state)}</span>
            ))}
          </div>
        </div>
        {steps.length === 0
          ? <p className="muted">The plan has no steps yet.</p>
          : <StepGraph slug={project.slug} steps={steps} selected={selected?.step.id} />}
      </div>

    </main>
    </div>
      <RightPanel
        open={selected !== undefined}
        onClose={() => select(undefined)}
        title={selected && (
          <>
            <span className="mono" style={{ fontWeight: 600 }}>{selected.step.ticket ?? "no ticket"}</span>
            <StatePill state={selected.state} />
          </>
        )}
      >
        {selected && <StepDetail view={view} node={selected} />}
      </RightPanel>
    </div>
  )
}

const StepLink = ({ slug, node }: { slug: ProjectSlug; node: StepNode }) => (
  <Link to="/projects/$projectSlug" params={{ projectSlug: slug }} search={{ step: node.step.id }} resetScroll={false}>
    {node.step.ticket ?? node.step.id}
  </Link>
)

const join = (items: ReadonlyArray<string>) => items.join(", ")

const why = (node: StepNode, dependencies: ReadonlyArray<StepNode>): string => {
  const newest = node.threads[0]
  switch (node.state) {
    case "Done":
      return node.pullRequests.length === 0 ? "You marked it done. It closed without code." : "You marked it done."
    case "Dropped":
      return "You dropped it from the plan."
    case "Merged":
      return `Every pull request is merged (${join(node.pullRequests.map((pr) => prNumber(pr.url)))}). Mark it done once you're happy with it.`
    case "Working":
      return "Its newest thread is running."
    case "InReview": {
      const open = node.pullRequests.filter((pr) => pr.state === "Open" || pr.state === "Draft")
      const merged = node.pullRequests.filter((pr) => pr.state === "Merged")
      return `${join(open.map((pr) => prNumber(pr.url)))} ${open.length > 1 ? "are" : "is"} still open and the newest thread isn't running, so it's waiting on review.` +
        (merged.length > 0
          ? ` ${join(merged.map((pr) => prNumber(pr.url)))} already merged, but the step only finishes when all its pull requests do.`
          : "")
    }
    case "NeedsYou":
      return newest?.state === "Waiting"
        ? "Its newest thread asked you something and has no open pull request."
        : newest?.state === "Failed"
        ? "Its newest thread failed without opening a pull request."
        : newest?.state === "Missing"
        ? "T3 no longer knows its newest thread, and there is no open pull request."
        : "Its newest thread went idle without an open pull request."
    case "Ready":
      return dependencies.length === 0
        ? "It depends on nothing and no thread has started. The coordinator can hand it out."
        : `Everything it depends on is merged or done (${join(dependencies.map((d) => d.step.ticket ?? d.step.id))}). No thread has started. The coordinator can hand it out.`
    case "Blocked":
      return `Waiting on ${join(dependencies.filter((d) => !isFinished(d.state)).map((d) => `${d.step.ticket ?? d.step.id} (${stateLabel(d.state)})`))}.`
  }
}

function StepDetail({ view, node }: { view: ProjectView; node: StepNode }) {
  const close = useAtomSet(closeStepAtom)
  const dependencies = view.steps.filter((other) => node.step.dependsOn.includes(other.step.id))
  const openPr = node.pullRequests.find((pr) => pr.state === "Open" || pr.state === "Draft")
  const newest = node.threads[0]
  const closed = node.state === "Done" || node.state === "Dropped"
  const closeAs = (closedAs: "Done" | "Dropped") => close({ project: view.project.slug, stepId: node.step.id, closedAs })

  return (
    <div className="detail">
      <h3 className="detail-title">{node.step.title}</h3>
      <div className="why">{why(node, dependencies)}</div>
      <dl className="kv">
        <dt>Depends on</dt>
        <dd>
          {dependencies.length === 0 ? <span className="muted">Nothing</span> : dependencies.map((dep, i) => (
            <span key={dep.step.id}>
              {i > 0 && ", "}
              <StepLink slug={view.project.slug} node={dep} /> <span className="muted">({stateLabel(dep.state)})</span>
            </span>
          ))}
        </dd>
        <dt>Threads</dt>
        <dd>
          <ul>
            {node.threads.length === 0 ? <li className="muted">None yet</li> : node.threads.map((thread, i) => (
              <li key={thread.threadId}>
                <a href={threadDeepLink(thread)}>{thread.title ?? thread.threadId}</a>{" "}
                <span className="muted">· {thread.state ?? "not observed"}{i === 0 && " · newest"}</span>
              </li>
            ))}
          </ul>
        </dd>
        <dt>Pull requests</dt>
        <dd>
          <ul>
            {node.pullRequests.length === 0 ? <li className="muted">None</li> : node.pullRequests.map((pr) => (
              <li key={pr.url}>
                <a href={pr.url} target="_blank" rel="noreferrer">{prNumber(pr.url)}</a> <span className="muted">· {pr.state ?? "not observed"}</span>
              </li>
            ))}
          </ul>
        </dd>
        <dt>Jira</dt>
        <dd>
          {node.step.ticket === null ? <span className="muted">No ticket filed yet</span> : (
            <>
              <a href={jiraUrl(node.step.ticket)}>{node.step.ticket}</a>{" "}
              <span className="muted">· {node.jiraStatus ?? "not observed"}</span>
              {node.drift && (
                <> <span className="flag">Drift: Jira says {node.jiraStatus}, step is {stateLabel(node.state)}</span></>
              )}
            </>
          )}
        </dd>
      </dl>
      <div className="btns">
        {node.state === "InReview" && openPr
          ? <a className="btn" href={openPr.url} target="_blank" rel="noreferrer">Open PR</a>
          : newest && <a className="btn" href={threadDeepLink(newest)}>Open thread</a>}
        {node.state === "Merged" && <button type="button" className="btn" onClick={() => closeAs("Done")}>Mark done</button>}
        {!closed && (
          <button
            type="button"
            className="btn"
            onClick={() => window.confirm(`Drop ${node.step.ticket ?? node.step.id} from the plan?`) && closeAs("Dropped")}
          >
            Drop step
          </button>
        )}
      </div>
    </div>
  )
}
