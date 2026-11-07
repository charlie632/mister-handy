---
name: coordinator-profile
description: Write or update the user's Mister Handy profile, ~/.mr-handy/profile.md, from their existing setup and a short interview.
disable-model-invocation: true
---

# Coordinator profile

The deliverable is `~/.mr-handy/profile.md`, the user's way of working that every `/coordinator` follows. The **Profile** section of `../coordinator/SKILL.md` defines its keys, sections and defaults. Read that section first, and write only what it defines.

This is a draft-first interview. Find the answers in the user's setup, show a draft, and ask only what the setup leaves open.

## 1. Read what exists

Read `~/.mr-handy/profile.md` when it exists. The run then updates it, and everything the user doesn't change stays as written.

## 2. Gather evidence

Read each source below. Note every candidate value with the source it came from.

- **`~/.claude/CLAUDE.md`** and the files it includes with `@`. A branch naming rule is a `branch` candidate. Step threads load this file themselves, so its other rules stay out of **Step rules**.
- **Claude's memory**, every `~/.claude/projects/*/memory/*.md`. Memory belongs to one working directory and never reaches a step thread's worktree, so a rule about how work gets done is a **Step rules** candidate.
- **`gh api user -q .login` and `git config --global user.name`.** A login is a candidate prefix for `branch`.
- **Every `~/.mr-handy/*/wiki/standing-orders.md`.** Split each order into its separate rules. A rule that appears in two or more projects, or says it comes from the user's general setup, is a **Step rules** or **Ask first** candidate. Note its project and order number. When two projects rule differently on the same thing, leave it to each project's standing orders.
- **Skills** under `~/.claude/skills/`. A planning or workflow skill that the standing orders or memory name is a candidate for **Planning** or **Step preamble**. A skill with `disable-model-invocation: true` can't be loaded through the Skill tool, so a Planning section that uses one says to read its `SKILL.md` with the Read tool, and names any playbook file in it to follow.
- **Tracker.** Ticket or epic keys in the standing orders and in every `~/.mr-handy/*/plan.md` show the tracker the user's projects use. Tracker tools found with ToolSearch back it up. The value is the tracker's name in lower case, such as `jira`, `linear` or `github`.

This step is done when every key and section has a candidate or is marked "no evidence, default", and every standing order has been split into its rules.

## 3. Show the draft

Show the user the full draft file. Then give one line per key, per section and per step rule, naming its evidence or "default".

## 4. Ask what's open

Ask one question at a time, numbered, each with your recommendation. Ask about each key or section whose evidence conflicts, about **Planning** when more than one skill is a candidate, and about each standing order you propose to move into the profile. A key or section with no evidence keeps its default without a question. Fold every answer into the draft.

## 5. Write it

When the user approves the draft, write `~/.mr-handy/profile.md`. Check the result against the coordinator's Profile section:

- The frontmatter holds only `branch` and `tracker`.
- `branch` uses only `{type}`, `{ticket}` and `{step}`.
- The body holds only `## Planning`, `## Step preamble`, `## Step rules` and `## Ask first`.
- Every skill or file the profile names exists.

## 6. Report and move

Tell the user:

- The file's path.
- That a coordinator reads the profile when it starts or resumes, so a running coordinator picks up the change on its next `/coordinator <slug>`.
- Each standing order the user agreed to move, by project and number. Keep its number, because other orders and wiki pages refer to orders by number. When the whole order moved, replace its text with `Moved to ~/.mr-handy/profile.md on <date>.` When only some of its rules moved, keep the rest in the user's words and add `(The rest moved to ~/.mr-handy/profile.md on <date>.)`
