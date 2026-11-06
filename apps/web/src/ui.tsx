import {
  isFinished,
  type PlanStepId,
  type ProjectSlug,
  type StepNode,
  type StepState,
  threadDeepLink
} from "@mister-handy/domain"
import { Link } from "@tanstack/react-router"
import { select } from "d3-selection"
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
import { type MouseEvent, useEffect, useRef, useState, type ReactNode } from "react"

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

const stateLabels: Record<StepState, string> = {
  Blocked: "Blocked",
  Ready: "Ready",
  Working: "Working",
  NeedsYou: "Needs you",
  InReview: "In review",
  Merged: "Merged",
  Done: "Done",
  Dropped: "Dropped"
}

export const stateLabel = (state: StepState): string => stateLabels[state]

/** The steps waiting on the user: a decision or a stopped thread, or a pull request to review. */
export const yourTurn = (steps: ReadonlyArray<StepNode>) =>
  steps.filter((node) => node.state === "NeedsYou" || node.state === "InReview")

/** Done and Dropped steps: nothing more happens to them. Merged steps still wait on the user to mark them done. */
export const isClosed = (state: StepState) => state === "Done" || state === "Dropped"

/** The order the step list and the state summary use: what the user acts on first, closed steps last. */
const listOrder: ReadonlyArray<StepState> = [
  "NeedsYou",
  "InReview",
  "Merged",
  "Ready",
  "Working",
  "Blocked",
  "Done",
  "Dropped"
]

/** Steps in list order; steps that share a state keep their plan order. */
export const sortForList = (steps: ReadonlyArray<StepNode>) =>
  [...steps].sort((a, b) => listOrder.indexOf(a.state) - listOrder.indexOf(b.state))

export const stepName = (node: StepNode): string => node.step.ticket ?? node.step.id

export const prNumber = (url: string) => `#${url.split("/").pop()}`

export const jiraUrl = (ticket: string) => `https://cerby.atlassian.net/browse/${ticket}`

export const StatePill = ({ state }: { state: StepState }) => (
  <span className="st" style={{ color: stateColor[state] }}>
    {stateLabel(state)}
  </span>
)

export const Nav = ({ project }: { project?: { slug: ProjectSlug; name: string } }) => (
  <nav className="nav">
    <Link to="/" className="brand">
      <img src="/logo.png" alt="" width={24} height={23} />
      mr-handy
    </Link>
    <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "on" }}>
      Home
    </Link>
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

/** How many steps sit in each state, in list order. Doubles as the legend for the graph's colors. */
export const StateSummary = ({ steps }: { steps: ReadonlyArray<StepNode> }) => (
  <div className="legend">
    {listOrder.map((state) => {
      const count = steps.filter((node) => node.state === state).length

      return (
        count > 0 && (
          <span key={state} style={{ "--c": stateColor[state] }}>
            {count} {stateLabel(state).toLowerCase()}
          </span>
        )
      )
    })}
  </div>
)

const Flags = ({ node }: { node: StepNode }) =>
  (node.earlyStart || node.drift) && (
    <span className="flags">
      {node.earlyStart && <span title="Work started before every step it depends on finished">early start</span>}
      {node.drift && <span title={`Jira says ${node.jiraStatus}`}>drift</span>}
    </span>
  )

/** A table of every step, with the ones that need the user first and closed ones folded away. */
export const StepList = ({
  slug,
  steps,
  selected,
  onSelect
}: {
  slug: ProjectSlug
  steps: ReadonlyArray<StepNode>
  selected: PlanStepId | undefined
  onSelect: (id: PlanStepId) => void
}) => {
  const [showClosed, setShowClosed] = useState(false)
  const byId = new Map(steps.map((node) => [node.step.id, node]))
  const sorted = sortForList(steps)
  const open = sorted.filter((node) => !isClosed(node.state))
  const closed = sorted.filter((node) => isClosed(node.state))
  const closedShown = showClosed || closed.some((node) => node.step.id === selected)

  const row = (node: StepNode) => {
    const waitingOn = node.step.dependsOn.flatMap((id) => {
      const dep = byId.get(id)

      return dep === undefined || isFinished(dep.state) ? [] : [dep]
    })

    const newest = node.threads[0]

    // The ticket link already navigates; this lets the rest of the row do the same.
    const onRowClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a, button") === null) onSelect(node.step.id)
    }

    return (
      <tr
        key={node.step.id}
        className={node.step.id === selected ? "on" : undefined}
        data-closed={isClosed(node.state) || undefined}
        onClick={onRowClick}
      >
        <td>
          <StatePill state={node.state} />
          <Flags node={node} />
        </td>
        <td className="step-cell">
          <Link
            className="mono nowrap"
            to="/projects/$projectSlug"
            params={{ projectSlug: slug }}
            search={{ step: node.step.id }}
            replace
            resetScroll={false}
          >
            {stepName(node)}
          </Link>
          <div>{node.step.title}</div>
        </td>
        <td>
          {waitingOn.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            waitingOn.map((dep) => (
              <div key={dep.step.id} className="nowrap">
                <span className="mono">{stepName(dep)}</span>{" "}
                <span className="muted">{stateLabel(dep.state).toLowerCase()}</span>
              </div>
            ))
          )}
        </td>
        <td>
          {node.pullRequests.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            node.pullRequests.map((pr) => (
              <div key={pr.url} className="nowrap">
                <a href={pr.url} target="_blank" rel="noreferrer" className="mono">
                  {prNumber(pr.url)}
                </a>{" "}
                <span className="muted">{pr.state?.toLowerCase() ?? "not observed"}</span>
              </div>
            ))
          )}
        </td>
        <td className="nowrap">
          {newest === undefined ? (
            <span className="muted">—</span>
          ) : (
            <a href={threadDeepLink(newest)} title={newest.title ?? undefined}>
              {newest.state?.toLowerCase() ?? "not observed"}
            </a>
          )}
        </td>
        <td className="nowrap">
          {node.step.ticket === null ? (
            <span className="muted">no ticket</span>
          ) : (
            <a href={jiraUrl(node.step.ticket)} className={node.drift ? "flag" : "muted"}>
              {node.jiraStatus ?? "not observed"}
            </a>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="table-wrap">
      <table className="steps">
        <thead>
          <tr>
            <th>State</th>
            <th>Step</th>
            <th>Waiting on</th>
            <th>Pull requests</th>
            <th>Thread</th>
            <th>Jira</th>
          </tr>
        </thead>
        <tbody>
          {open.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Every step is closed.
              </td>
            </tr>
          )}
          {open.map(row)}
        </tbody>
        {closed.length > 0 && (
          <tbody>
            <tr className="group">
              <td colSpan={6}>
                <button
                  type="button"
                  className="link-btn"
                  aria-expanded={closedShown}
                  onClick={() => setShowClosed(!closedShown)}
                >
                  {closedShown ? "Hide" : "Show"} {closed.length} closed {closed.length === 1 ? "step" : "steps"}
                </button>
              </td>
            </tr>
            {closedShown && closed.map(row)}
          </tbody>
        )}
      </table>
    </div>
  )
}

const WIDTH = 712
const NODE_WIDTH = 236
const NODE_HEIGHT = 92
const ROW_GAP = 44
const COLUMN_GAP = 20

/** Characters that fit across a node at the title's 12px sans and the subline's 11px mono. */
const TITLE_CHARS = 33
const SUBLINE_CHARS = 31

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

/**
 * Reorders each row under the average position of the steps it depends on, top to bottom, so edges cross
 * less. Steps with no dependency in the rows above keep their place.
 */
const untangle = (rows: ReadonlyArray<ReadonlyArray<StepNode>>) => {
  const slot = new Map<PlanStepId, number>()
  const ordered: Array<ReadonlyArray<StepNode>> = []

  for (const row of rows) {
    const keyed = row.map((node, i) => {
      const placed = node.step.dependsOn.flatMap((dep) => {
        const at = slot.get(dep)

        return at === undefined ? [] : [at]
      })

      const center =
        placed.length === 0 ? i / Math.max(1, row.length - 1) : placed.reduce((a, b) => a + b, 0) / placed.length

      return { node, center }
    })

    const sorted = keyed.sort((a, b) => a.center - b.center).map(({ node }) => node)
    sorted.forEach((node, i) => slot.set(node.step.id, i / Math.max(1, sorted.length - 1)))
    ordered.push(sorted)
  }

  return ordered
}

const ellipsize = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Splits a title into at most two lines on word breaks, with an ellipsis when it runs past them. */
const titleLines = (title: string): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let line = ""

  for (const word of title.split(/\s+/)) {
    const next = line === "" ? word : `${line} ${word}`

    if (next.length <= TITLE_CHARS) {
      line = next
      continue
    }

    if (lines.length === 1) return [lines[0]!, ellipsize(next, TITLE_CHARS)]

    if (line !== "") lines.push(line)
    line = word
  }

  return [...lines, line].flatMap((text) => (text === "" ? [] : [ellipsize(text, TITLE_CHARS)]))
}

const subline = (node: StepNode) => {
  const prs = node.pullRequests

  if (prs.length === 0) {
    if (node.state === "Done") return "closed without code"

    return node.threads.length > 0
      ? `thread ${node.threads[0]!.state?.toLowerCase() ?? "not observed"}`
      : "no thread yet"
  }

  const each = prs.map((pr) => `${prNumber(pr.url)} ${pr.state?.toLowerCase() ?? "not observed"}`).join("  ")

  if (each.length <= SUBLINE_CHARS) return each

  const counts = new Map<string, number>()

  for (const pr of prs) {
    const state = pr.state?.toLowerCase() ?? "not observed"
    counts.set(state, (counts.get(state) ?? 0) + 1)
  }

  return ellipsize(`${prs.length} PRs · ${[...counts].map(([state, n]) => `${n} ${state}`).join(", ")}`, SUBLINE_CHARS)
}

const MIN_SCALE = 0.2
const MAX_SCALE = 2.5
const PAN_MARGIN = 160

/** Below this, node text is too small to read, so the graph opens at full size instead of fitted. */
const READABLE_SCALE = 0.75

/** Scale and offset that show the whole graph centered in the viewport, never enlarged past 1:1. */
const fitted = (viewport: SVGSVGElement, width: number, height: number): ZoomTransform => {
  const { clientWidth, clientHeight } = viewport
  const scale = Math.max(MIN_SCALE, Math.min(1, (clientWidth - 24) / width, (clientHeight - 24) / height))

  return zoomIdentity.translate((clientWidth - width * scale) / 2, (clientHeight - height * scale) / 2).scale(scale)
}

interface Point {
  readonly x: number
  readonly y: number
}

/**
 * 1:1 scale, centered horizontally and pinned to the top, so the first rows read at full size. When `focus`
 * would fall outside the viewport, it pans just enough to bring that point into the middle instead.
 */
const actualSize = (viewport: SVGSVGElement, width: number, focus: Point | undefined): ZoomTransform => {
  const { clientWidth, clientHeight } = viewport
  const x = width > clientWidth && focus !== undefined ? clientWidth / 2 - focus.x : (clientWidth - width) / 2
  const y = focus === undefined ? 12 : Math.min(12, clientHeight / 2 - focus.y)

  return zoomIdentity.translate(x, y)
}

/** An SVG canvas you drag to pan and scroll or pinch to zoom; d3-zoom swallows the click that ends a drag. */
const ZoomPan = ({
  width,
  height,
  focus,
  children
}: {
  width: number
  height: number
  /** The point to keep in view when the graph is too big to fit at a readable size. */
  focus: Point | undefined
  children: ReactNode
}) => {
  const viewport = useRef<SVGSVGElement>(null)
  const layer = useRef<SVGGElement>(null)
  const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null)
  const placed = useRef(false)

  useEffect(() => {
    const svg = viewport.current

    if (svg === null) return

    const zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_SCALE, MAX_SCALE])
      .translateExtent([
        [-PAN_MARGIN, -PAN_MARGIN],
        [width + PAN_MARGIN, height + PAN_MARGIN]
      ])
      .on("zoom", (event: { transform: ZoomTransform }) =>
        layer.current?.setAttribute("transform", event.transform.toString())
      )

    const selection = select(svg)
    selection.call(zoomer).on("dblclick.zoom", null)
    behavior.current = zoomer

    if (!placed.current) {
      placed.current = true
      const fit = fitted(svg, width, height)
      zoomer.transform(selection, fit.k >= READABLE_SCALE ? fit : actualSize(svg, width, focus))
    }

    return () => {
      selection.on(".zoom", null)
    }
  }, [width, height])

  const apply = (transform: (svg: SVGSVGElement) => ZoomTransform) => {
    const svg = viewport.current

    if (svg !== null) behavior.current?.transform(select(svg), transform(svg))
  }

  const scaleBy = (factor: number) => {
    const svg = viewport.current

    if (svg !== null) behavior.current?.scaleBy(select(svg), factor)
  }

  return (
    <div className="zoompan" style={{ height: `min(${height + 24}px, 72vh)` }}>
      <svg ref={viewport} role="img" aria-label="Step graph">
        <g ref={layer}>{children}</g>
      </svg>
      <div className="zoompan-controls">
        <button type="button" className="btn" aria-label="Zoom in" onClick={() => scaleBy(1.25)}>
          +
        </button>
        <button type="button" className="btn" aria-label="Zoom out" onClick={() => scaleBy(0.8)}>
          −
        </button>
        <button type="button" className="btn" onClick={() => apply((svg) => fitted(svg, width, height))}>
          Fit
        </button>
        <button type="button" className="btn" onClick={() => apply((svg) => actualSize(svg, width, focus))}>
          1:1
        </button>
      </div>
    </div>
  )
}

/** An edge into or out of the selected step stands out; one from a finished step fades. */
type EdgeKind = "done" | "live" | "on"

const edgeKind = (from: StepNode, to: StepNode, selected: PlanStepId | undefined): EdgeKind =>
  from.step.id === selected || to.step.id === selected ? "on" : isFinished(from.state) ? "done" : "live"

export const StepGraph = ({
  slug,
  steps,
  selected
}: {
  slug: ProjectSlug
  steps: ReadonlyArray<StepNode>
  selected: PlanStepId | undefined
}) => {
  const rows = untangle(layers(steps))
  const byId = new Map(steps.map((node) => [node.step.id, node]))
  const width = Math.max(WIDTH, ...rows.map((row) => row.length * (NODE_WIDTH + COLUMN_GAP) + COLUMN_GAP))
  const position = new Map<PlanStepId, { x: number; y: number }>()
  rows.forEach((row, i) => {
    const gap = (width - row.length * NODE_WIDTH) / (row.length + 1)
    row.forEach((node, j) =>
      position.set(node.step.id, { x: gap + j * (NODE_WIDTH + gap), y: 6 + i * (NODE_HEIGHT + ROW_GAP) })
    )
  })
  const height = 6 + rows.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP + 8
  const focusId = selected ?? sortForList(steps).find((node) => !isClosed(node.state))?.step.id
  const focusAt = focusId === undefined ? undefined : position.get(focusId)
  const focus = focusAt && { x: focusAt.x + NODE_WIDTH / 2, y: focusAt.y + NODE_HEIGHT / 2 }

  const edges = steps.flatMap((node) =>
    node.step.dependsOn.flatMap((dep) => {
      const from = position.get(dep)
      const to = position.get(node.step.id)
      const source = byId.get(dep)

      if (from === undefined || to === undefined || source === undefined) return []

      const x1 = from.x + NODE_WIDTH / 2,
        y1 = from.y + NODE_HEIGHT,
        x2 = to.x + NODE_WIDTH / 2,
        y2 = to.y

      const mid = (y1 + y2) / 2
      const kind = edgeKind(source, node, selected)

      return [
        {
          key: `${dep}->${node.step.id}`,
          kind,
          d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2 - 2}`
        }
      ]
    })
  )

  // Highlighted edges draw last so faded ones never cover them.
  const drawOrder: Record<EdgeKind, number> = { done: 0, live: 1, on: 2 }
  edges.sort((a, b) => drawOrder[a.kind] - drawOrder[b.kind])

  return (
    <ZoomPan width={width} height={height} focus={focus}>
      <defs>
        {(["done", "live", "on"] as const).map((kind) => (
          <marker
            key={kind}
            id={`arrow-${kind}`}
            className={`edge-${kind}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" />
          </marker>
        ))}
      </defs>
      {edges.map((edge) => (
        <path key={edge.key} d={edge.d} className={`edge edge-${edge.kind}`} markerEnd={`url(#arrow-${edge.kind})`} />
      ))}
      {rows.flat().map((node) => {
        const { x, y } = position.get(node.step.id)!
        const color = stateColor[node.state]
        const isSelected = node.step.id === selected
        const flags = [node.drift && "drift", node.earlyStart && "early start"].filter(Boolean).join(" · ")

        return (
          <Link
            key={node.step.id}
            to="/projects/$projectSlug"
            params={{ projectSlug: slug }}
            search={{ step: node.step.id, view: "graph" }}
            replace
            resetScroll={false}
            className={isClosed(node.state) && !isSelected ? "node closed" : "node"}
          >
            <title>{`${stepName(node)} · ${stateLabel(node.state)}\n${node.step.title}`}</title>
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
            <text x={x + 12} y={y + 21} className="k">
              {ellipsize(stepName(node), 20)}
            </text>
            <text x={x + NODE_WIDTH - 12} y={y + 21} className="s" textAnchor="end" fill={color}>
              {stateLabel(node.state)}
            </text>
            {titleLines(node.step.title).map((line, i) => (
              <text key={i} x={x + 12} y={y + 42 + i * 16} className="t">
                {line}
              </text>
            ))}
            <text x={x + 12} y={y + 80} className="m">
              {flags ? (
                <>
                  {ellipsize(subline(node), SUBLINE_CHARS - flags.length - 3)}
                  <tspan fill="var(--destructive)" fontWeight={600}>{` · ${flags}`}</tspan>
                </>
              ) : (
                subline(node)
              )}
            </text>
          </Link>
        )
      })}
    </ZoomPan>
  )
}

declare module "react" {
  interface CSSProperties {
    /** The legend's swatch color, read by `.legend span` in styles.css. */
    "--c"?: string
  }
}
