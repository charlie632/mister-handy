# Mister Handy

One place to see every project the user is working on at the same time: its plan, where each step stands, and where each step's work is happening.

## Projects

**Project**:
A body of work the user is driving toward one outcome, usually across several plan steps and weeks. It's the unit the user monitors.
_Avoid_: Initiative, workstream, T3 project, Jira project

**Project state**:
One of **Planning**, **Active**, **Paused** or **Done**. The user sets it. It's never derived. During Planning the plan is being written and no step has started.
_Avoid_: Archived, closed

**Coordinator**:
The one long-running thread that runs a project. It knows which plan step the project is on and which threads are working. It never touches code or branches itself, rebases and restacks included. It hands every piece of work to a step thread.
_Avoid_: Chief of staff, orchestrator, owner

**Wiki**:
A project's own set of linked, dated pages that the coordinator keeps, so what it learns survives after its thread ends. Each project has exactly one wiki, no page belongs to two projects, and the wiki is kept apart from the Vault and from any repository.
_Avoid_: Notes, memory, docs, Vault note

**Universal wiki**:
The one wiki that belongs to no project. It holds what the user learned that applies across all projects.
_Avoid_: Global wiki, shared memory, preferences

## Plan

**Plan**:
The project's plan file, and the source of truth for which steps exist and what depends on what. It changes as the project learns. Steps get added, split, rewritten or dropped at any time, and each step's ticket follows.
_Avoid_: Spec, RFC, design doc, Jira epic

**Plan step**:
One step of a plan. It has exactly one ticket. The plan alone decides what a step is and what it depends on.
_Avoid_: Phase, milestone, unit, task

**Dependency**:
A directed "must finish first" relation between two plan steps, written in the plan. The step that must finish first points at the step that waits on it.
_Avoid_: Link, relation, stack, Jira Blocks

**Step graph**:
A project's plan steps as nodes and its dependencies as edges. Each node shows its ticket key, its step state, and links to its thread or pull request.
_Avoid_: Board, tree, DAG, ticket graph

**Step state**:
Where a plan step stands, worked out from its dependencies, its thread and its pull requests. Done is the one state the user sets by hand. A step is in exactly one of these states:

- **Blocked**: at least one step it depends on isn't merged or done, and no work has started.
- **Ready**: every step it depends on is merged or done, and no work has started.
- **Working**: its thread is running.
- **Needs you**: the coordinator is holding it on a decision only the user can make, or its thread stopped without an open pull request (it asked the user something, it failed, or it went idle).
- **In review**: it has an open pull request and its thread isn't running.
- **Merged**: all its pull requests are merged, and the user hasn't marked it done yet.
- **Done**: the user marked it done.
- **Dropped**: the user removed it from the plan.

_Avoid_: Status, ticket state, Jira status, column, Stalled

**Hold**:
A decision the coordinator is waiting on the user for before a step can go ahead, recorded on the step with its reason. A held step reads Needs you whatever its dependencies say, until the coordinator releases it or the step merges.
_Avoid_: Pause, block, on hold

**Early start**:
A step with work in progress while a step it depends on isn't merged or done yet. It's a flag shown beside the step's state, not an error, because stacked work does this on purpose.
_Avoid_: Out of order, jumped

## Jira

**Epic**:
The Jira epic a project points to. It's a pointer the company requires, not the project itself.
_Avoid_: Project

**Ticket**:
The Jira issue a plan step points to. It mirrors the step and carries no truth of its own.
_Avoid_: Issue, task, story, unit

**Drift**:
A ticket whose Jira status or links disagree with its plan step, such as Jira saying In Progress after the step's pull request merged.
_Avoid_: Out of sync, stale

## Work

**Thread**:
A T3 conversation where work on a plan step happens. The coordinator is a thread too, but it works on the whole project, not on one step.
_Avoid_: Session, chat, conversation, agent

**Step thread**:
The thread a coordinator starts to work one plan step. It's the thread the step's node links to. It reports back to its coordinator, and any threads it starts in turn are its own children.
_Avoid_: Owner thread, worker, child thread, subagent

**Status update**:
A short message one thread posts to the thread above it about a step, such as "started step 4 in thread X" or "opened a pull request". Step threads post them to the coordinator, and the coordinator posts them to Mister Handy.
_Avoid_: Report, ping, event

**Thread state**:
One of **Running**, **Waiting** (it asked the user something), **Idle** (it finished its turn), **Failed**, **Settled** (the user marked it finished) or **Missing** (T3 no longer knows it).
_Avoid_: Status

**Pull request**:
A GitHub change produced by work on a plan step. One step can have several, and one pull request can show up in several threads.
_Avoid_: PR branch, change, diff

**Pull request state**:
One of **Draft**, **Open**, **Merged** or **Closed**. Whether its checks pass is a separate fact about an open pull request, not another state.
_Avoid_: Status

## Pages

**Home page**:
The one page that lists every project the user has. It's where the user starts.
_Avoid_: Dashboard, My Work, overview, landing page

**Project page**:
The page for one project. It shows the project's step graph next to its plan and its epic.
_Avoid_: Board, project view, graph page

## Storage

**Observation**:
The last thing seen in T3, GitHub or Jira about one thread, pull request or ticket, with the time it was seen. Observations feed step state but are never decided by Mister Handy.
_Avoid_: Snapshot, cache, sync state
