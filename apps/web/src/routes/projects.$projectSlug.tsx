import { useAtomSet, useAtomSuspense } from "@effect/atom-react"
import type { ProjectView } from "@mister-handy/db"
import { isFinished, PlanStepId, ProjectSlug, type StepNode, threadDeepLink } from "@mister-handy/domain"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { type ReactNode, Suspense } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { panelToggleProps, RightPanel } from "../panel.tsx"
import { closeStepAtom, planAtom, projectAtom } from "../projects.ts"
import {
  jiraUrl,
  Nav,
  prNumber,
  sortForList,
  StatePill,
  StateSummary,
  StepGraph,
  StepList,
  stateLabel,
  stepName
} from "../ui.tsx"

export const Route = createFileRoute("/projects/$projectSlug")({
  params: {
    parse: ({ projectSlug }) => ({
      projectSlug: Option.getOrThrowWith(Schema.decodeOption(ProjectSlug)(projectSlug), () => notFound())
    }),
    stringify: ({ projectSlug }) => ({ projectSlug })
  },
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({
      step: Schema.optional(PlanStepId),
      plan: Schema.optional(Schema.Literal(true)),
      /** The step list shows unless this asks for the graph. */
      view: Schema.optional(Schema.Literal("graph"))
    })
  ),
  component: ProjectPage
})

function ProjectPage() {
  return (
    <Suspense
      fallback={
        <main>
          <Nav />
          <p className="muted">Loading project</p>
        </main>
      }
    >
      <ProjectContent />
    </Suspense>
  )
}

function ProjectContent() {
  const { projectSlug } = Route.useParams()
  const { step, plan, view: shown } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { value: view } = useAtomSuspense(projectAtom(projectSlug))

  if (view === null) {
    return (
      <main>
        <Nav />
        <p>No project called {projectSlug}.</p>
      </main>
    )
  }

  const { project, steps } = view
  const selected = steps.find((node) => node.step.id === step)
  const showPlan = plan === true && selected === undefined
  const panelOpen = selected !== undefined || showPlan

  const select = (id: PlanStepId | undefined) =>
    navigate({ search: { step: id, view: shown }, replace: true, resetScroll: false })

  const fallback = sortForList(steps)[0]

  const viewLink = (target: "graph" | undefined, label: string) => (
    <Link
      to="/projects/$projectSlug"
      params={{ projectSlug: project.slug }}
      search={{ step, plan, view: target }}
      replace
      resetScroll={false}
      aria-pressed={shown === target}
    >
      {label}
    </Link>
  )

  return (
    <div className="workspace">
      <div className="workspace-main">
        <main>
          <Nav project={project} />
          <div className="head">
            <div className="title-block">
              <h1>{project.name}</h1>
              <div className="meta">
                {project.epic && (
                  <span>
                    Epic <a href={jiraUrl(project.epic)}>{project.epic}</a>
                  </span>
                )}
                {project.references.map((ref) => (
                  <a key={ref.url} href={ref.url}>
                    {ref.label}
                  </a>
                ))}
                <Link
                  className="mono"
                  to="/projects/$projectSlug"
                  params={{ projectSlug: project.slug }}
                  search={{ plan: true, view: shown }}
                  replace
                  resetScroll={false}
                >
                  plan.md
                </Link>
                {project.coordinator && (
                  <a href={threadDeepLink(project.coordinator)} title={view.coordinatorTitle ?? undefined}>
                    Coordinator thread
                  </a>
                )}
                {view.observedAt && <span>Observed {view.observedAt.slice(11, 16)} UTC</span>}
              </div>
            </div>
            <div className="head-actions">
              <span className="pill">{project.state}</span>
              {!panelOpen && fallback && (
                <Link
                  to="/projects/$projectSlug"
                  params={{ projectSlug: project.slug }}
                  search={{ step: fallback.step.id, view: shown }}
                  replace
                  resetScroll={false}
                  {...panelToggleProps(false)}
                />
              )}
            </div>
          </div>

          <section className="box steps-box">
            <div className="steps-head">
              <h2>Steps</h2>
              <StateSummary steps={steps} />
              <div className="seg" role="group" aria-label="Show steps as">
                {viewLink(undefined, "List")}
                {viewLink("graph", "Graph")}
              </div>
            </div>
            {steps.length === 0 ? (
              <p className="muted">The plan has no steps yet.</p>
            ) : shown === "graph" ? (
              <StepGraph slug={project.slug} steps={steps} selected={selected?.step.id} />
            ) : (
              <StepList slug={project.slug} steps={steps} selected={selected?.step.id} onSelect={select} />
            )}
          </section>
        </main>
      </div>
      <RightPanel
        open={panelOpen}
        label={showPlan ? "Plan" : "Step details"}
        onClose={() => select(undefined)}
        close={
          <Link
            to="/projects/$projectSlug"
            params={{ projectSlug: project.slug }}
            search={{ view: shown }}
            replace
            resetScroll={false}
            {...panelToggleProps(true)}
          />
        }
        title={
          showPlan ? (
            <span className="mono" style={{ fontWeight: 600 }}>
              plan.md
            </span>
          ) : (
            selected && (
              <>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {stepName(selected)}
                </span>
                <StatePill state={selected.state} />
              </>
            )
          )
        }
      >
        {showPlan && (
          <Suspense fallback={<p className="muted">Loading plan</p>}>
            <PlanDetail slug={project.slug} />
          </Suspense>
        )}
        {selected && <StepDetail view={view} node={selected} shown={shown} />}
      </RightPanel>
    </div>
  )
}

function PlanDetail({ slug }: { slug: ProjectSlug }) {
  const { value: plan } = useAtomSuspense(planAtom(slug))

  if (plan === null) return <p className="muted">The coordinator hasn't written ~/.mr-handy/{slug}/plan.md yet.</p>

  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {plan}
      </Markdown>
    </div>
  )
}

const StepLink = ({ slug, node, shown }: { slug: ProjectSlug; node: StepNode; shown: "graph" | undefined }) => (
  <Link
    className="nowrap"
    to="/projects/$projectSlug"
    params={{ projectSlug: slug }}
    search={{ step: node.step.id, view: shown }}
    replace
    resetScroll={false}
  >
    {stepName(node)}
  </Link>
)

const join = (items: ReadonlyArray<string>) => items.join(", ")

const why = (node: StepNode, dependencies: ReadonlyArray<StepNode>): ReactNode => {
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

      return (
        `${join(open.map((pr) => prNumber(pr.url)))} ${open.length > 1 ? "are" : "is"} still open and the newest thread isn't running, so it's waiting on review.` +
        (merged.length > 0
          ? ` ${join(merged.map((pr) => prNumber(pr.url)))} already merged, but the step only finishes when all its pull requests do.`
          : "")
      )
    }

    case "NeedsYou":
      return node.step.heldFor !== undefined
        ? `The coordinator is holding it until you decide: ${node.step.heldFor}`
        : newest?.state === "Waiting"
          ? "Its newest thread asked you something and has no open pull request."
          : newest?.state === "Failed"
            ? "Its newest thread failed without opening a pull request."
            : newest?.state === "Missing"
              ? "T3 no longer knows its newest thread, and there is no open pull request."
              : "Its newest thread went idle without an open pull request."
    case "Ready": {
      const cleared = dependencies.length === 0 ? "It depends on nothing" : "Everything it depends on is merged or done"

      return newest === undefined
        ? `${cleared}, and no thread has started. The coordinator can hand it out.`
        : `${cleared}. It has a thread, but T3 hasn't reported on it yet.`
    }

    case "Blocked": {
      const waiting = dependencies.filter((dep) => !isFinished(dep.state))

      return (
        <>
          Waiting on{" "}
          {waiting.map((dep, i) => (
            <span key={dep.step.id}>
              {i > 0 && ", "}
              <span className="nowrap">{stepName(dep)}</span> ({stateLabel(dep.state).toLowerCase()})
            </span>
          ))}
          .
        </>
      )
    }
  }
}

function StepDetail({ view, node, shown }: { view: ProjectView; node: StepNode; shown: "graph" | undefined }) {
  const close = useAtomSet(closeStepAtom)
  const dependencies = view.steps.filter((other) => node.step.dependsOn.includes(other.step.id))
  const unfinished = dependencies.filter((dep) => !isFinished(dep.state))
  const finished = dependencies.filter((dep) => isFinished(dep.state))
  const coordinator = view.project.coordinator
  const openPr = node.pullRequests.find((pr) => pr.state === "Open" || pr.state === "Draft")
  const newest = node.threads[0]
  const closed = node.state === "Done" || node.state === "Dropped"

  const closeAs = (closedAs: "Done" | "Dropped") =>
    close({ project: view.project.slug, stepId: node.step.id, closedAs })

  return (
    <div className="detail">
      <h3 className="detail-title">{node.step.title}</h3>
      <div className="why">{why(node, dependencies)}</div>
      <dl className="kv">
        <dt>Depends on</dt>
        <dd>
          {dependencies.length === 0 && <span className="muted">Nothing</span>}
          {unfinished.map((dep) => (
            <div key={dep.step.id}>
              <StepLink slug={view.project.slug} node={dep} shown={shown} />{" "}
              <span className="muted">{stateLabel(dep.state).toLowerCase()}</span>
            </div>
          ))}
          {finished.length > 0 && (
            <div>
              <span className="muted">
                {finished.length === 1
                  ? "Finished: "
                  : finished.length === dependencies.length
                    ? `All ${finished.length} finished: `
                    : `${finished.length} finished: `}
              </span>
              {finished.map((dep, i) => (
                <span key={dep.step.id}>
                  {i > 0 && ", "}
                  <StepLink slug={view.project.slug} node={dep} shown={shown} />
                </span>
              ))}
            </div>
          )}
        </dd>
        <dt>Threads</dt>
        <dd>
          <ul>
            {node.threads.length === 0 ? (
              <li className="muted">None yet</li>
            ) : (
              node.threads.map((thread, i) => (
                <li key={thread.threadId}>
                  <a href={threadDeepLink(thread)}>{thread.title ?? thread.threadId}</a>{" "}
                  <span className="muted">
                    {thread.state !== null && ` · ${thread.state}`}
                    {i === 0 && " · newest"}
                  </span>
                </li>
              ))
            )}
          </ul>
        </dd>
        <dt>Pull requests</dt>
        <dd>
          <ul>
            {node.pullRequests.length === 0 ? (
              <li className="muted">None</li>
            ) : (
              node.pullRequests.map((pr) => (
                <li key={pr.url}>
                  <a href={pr.url} target="_blank" rel="noreferrer">
                    {prNumber(pr.url)}
                  </a>{" "}
                  {pr.state !== null && <span className="muted">· {pr.state}</span>}
                </li>
              ))
            )}
          </ul>
        </dd>
        <dt>Jira</dt>
        <dd>
          {node.step.ticket === null ? (
            <span className="muted">No ticket filed yet</span>
          ) : (
            <>
              <a href={jiraUrl(node.step.ticket)}>{node.step.ticket}</a>{" "}
              {node.jiraStatus !== null && <span className="muted">· {node.jiraStatus}</span>}
              {node.drift && (
                <>
                  {" "}
                  <span className="flag">
                    Drift: Jira says {node.jiraStatus}, step is {stateLabel(node.state)}
                  </span>
                </>
              )}
            </>
          )}
        </dd>
      </dl>
      <div className="btns">
        {node.state === "InReview" && openPr ? (
          <a className="btn primary" href={openPr.url} target="_blank" rel="noreferrer">
            Open pull request
          </a>
        ) : node.state === "Merged" ? (
          <button type="button" className="btn primary" onClick={() => closeAs("Done")}>
            Mark done
          </button>
        ) : node.state === "Ready" && newest === undefined && coordinator ? (
          <a className="btn primary" href={threadDeepLink(coordinator)}>
            Open coordinator
          </a>
        ) : (
          newest && (
            <a className={closed ? "btn" : "btn primary"} href={threadDeepLink(newest)}>
              Open thread
            </a>
          )
        )}
        {!closed && (
          <button
            type="button"
            className="btn danger"
            onClick={() => window.confirm(`Drop ${stepName(node)} from the plan?`) && closeAs("Dropped")}
          >
            Drop step
          </button>
        )}
      </div>
    </div>
  )
}
