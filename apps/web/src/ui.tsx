import type { PlanStepId, ProjectSlug, StepNode, StepState } from "@mister-handy/domain"
import { Link } from "@tanstack/react-router"

export const stateColor: Record<StepState, string> = {
  Blocked: "var(--muted-foreground)",
  Ready: "var(--info)",
  Working: "var(--primary)",
  NeedsYou: "var(--destructive)",
  InReview: "var(--warning)",
  Merged: "var(--success)",
  Done: "var(--success)",
  Dropped: "var(--muted-foreground)"
}

export const stateLabel = (state: StepState): string =>
  state === "NeedsYou" ? "Needs you" : state === "InReview" ? "In review" : state

export const yourTurn = (steps: ReadonlyArray<StepNode>) =>
  steps.filter((node) => node.state === "NeedsYou" || node.state === "InReview" || node.state === "Ready")

export const prNumber = (url: string) => `#${url.split("/").pop()}`

export const jiraUrl = (ticket: string) => `https://cerby.atlassian.net/browse/${ticket}`

export const StatePill = ({ state }: { state: StepState }) => (
  <span className="st" style={{ color: stateColor[state] }}>{stateLabel(state)}</span>
)

export const Nav = ({ project }: { project?: { slug: ProjectSlug; name: string } }) => (
  <nav className="nav">
    <span className="brand">mr-handy</span>
    <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "on" }}>Home</Link>
    {project && (
      <>
        <span>/</span>
        <Link to="/projects/$projectSlug" params={{ projectSlug: project.slug }} className="on">
          {project.name}
        </Link>
      </>
    )}
  </nav>
)

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const WIDTH = 712
const NODE_WIDTH = 214
const NODE_HEIGHT = 74
const ROW_GAP = 40

/** Rows by longest dependency chain, so every arrow points down. */
const layers = (steps: ReadonlyArray<StepNode>) => {
  const byId = new Map(steps.map((node) => [node.step.id, node]))
  const depth = new Map<PlanStepId, number>()
  const depthOf = (id: PlanStepId): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    depth.set(id, 0)
    const deps = byId.get(id)?.step.dependsOn.filter((dep) => byId.has(dep)) ?? []
    const value = Math.max(0, ...deps.map((dep) => depthOf(dep) + 1))
    depth.set(id, value)
    return value
  }
  const rows: Array<Array<StepNode>> = []
  for (const node of steps) (rows[depthOf(node.step.id)] ??= []).push(node)
  return rows.filter((row) => row !== undefined)
}

const subline = (node: StepNode) =>
  node.pullRequests.length > 0
    ? node.pullRequests.map((pr) => `${prNumber(pr.url)}${pr.state === "Merged" ? " ✓" : ` ${pr.state?.toLowerCase() ?? "unseen"}`}`).join("  ")
    : node.state === "Done"
    ? "closed without code"
    : node.threads.length > 0
    ? ""
    : "no thread yet"

export const StepGraph = (
  { slug, steps, selected }: { slug: ProjectSlug; steps: ReadonlyArray<StepNode>; selected: PlanStepId | undefined }
) => {
  const rows = layers(steps)
  const width = Math.max(WIDTH, ...rows.map((row) => row.length * (NODE_WIDTH + 16) + 16))
  const position = new Map<PlanStepId, { x: number; y: number }>()
  rows.forEach((row, i) => {
    const gap = (width - row.length * NODE_WIDTH) / (row.length + 1)
    row.forEach((node, j) => position.set(node.step.id, { x: gap + j * (NODE_WIDTH + gap), y: 6 + i * (NODE_HEIGHT + ROW_GAP) }))
  })
  const height = 6 + rows.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP + 8

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Step graph">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--border)" />
        </marker>
      </defs>
      {steps.flatMap((node) =>
        node.step.dependsOn.map((dep) => {
          const from = position.get(dep)
          const to = position.get(node.step.id)
          if (from === undefined || to === undefined) return null
          const x1 = from.x + NODE_WIDTH / 2, y1 = from.y + NODE_HEIGHT, x2 = to.x + NODE_WIDTH / 2, y2 = to.y
          const mid = (y1 + y2) / 2
          return (
            <path
              key={`${dep}->${node.step.id}`}
              d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2 - 6}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.6}
              markerEnd="url(#arrow)"
            />
          )
        })
      )}
      {steps.map((node) => {
        const { x, y } = position.get(node.step.id)!
        const color = stateColor[node.state]
        const isSelected = node.step.id === selected
        const flags = [node.drift && "drift", node.earlyStart && "early"].filter(Boolean).join(" · ")
        return (
          <Link
            key={node.step.id}
            to="/projects/$projectSlug"
            params={{ projectSlug: slug }}
            search={{ step: node.step.id }}
            replace
            resetScroll={false}
          >
            <rect
              x={x}
              y={y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={10}
              fill="var(--card)"
              stroke={color}
              strokeWidth={isSelected ? 3 : 1.5}
              strokeDasharray={node.state === "Blocked" ? "5 4" : undefined}
            />
            <text x={x + 12} y={y + 21} className="k">{node.step.ticket ?? "no ticket"}</text>
            <text x={x + NODE_WIDTH - 12} y={y + 21} className="s" textAnchor="end" fill={color}>
              {stateLabel(node.state)}
            </text>
            <text x={x + 12} y={y + 41} className="t">{truncate(node.step.title, 31)}</text>
            <text x={x + 12} y={y + 61} className="m">
              {subline(node)}
              {flags && <tspan fill="var(--destructive)" fontWeight={600}>{`  ${flags}`}</tspan>}
            </text>
          </Link>
        )
      })}
    </svg>
  )
}
