<img src="assets/logo.png" width="64" alt="">

# Mister Handy

One place to watch every project you're running at once: its plan, where each plan step stands, and which T3 Code thread is working it. [CONTEXT.md](CONTEXT.md) defines the terms.

## Quick start

### 1. Install

Needs Node 22.23 or newer and pnpm 10.28.

```sh
git clone git@github.com:charlie632/mister-handy.git
cd mister-handy
pnpm install
pnpm build
```

### 2. Install the CLI

```sh
(cd apps/cli && pnpm link --global)   # puts mr-handy on PATH; needs PNPM_HOME set
mr-handy --help
```

Coordinators run in other repos' T3 projects, so `mr-handy` has to be on PATH, not just runnable from this checkout.

### 3. Get started with the CLI

```sh
mr-handy db init                      # create ~/.mr-handy/mister-handy.db, safe to rerun
mr-handy serve                        # the web app on http://127.0.0.1:3000
mr-handy serve --tailscale            # also https://<machine>.<tailnet>.ts.net:8300
```

`--tailscale` keeps serving on the tailnet across reboots; `mr-handy serve` doesn't, so restart it after one. `tailscale serve --https=8300 off` stops it. Set `MR_HANDY_DB` to point at another database file. Node warns that `node:sqlite` is experimental on 22.x; that's harmless.

To see a populated page before running a real project, load the example: `mr-handy db load docs/examples/chase-2146.sql`.

### 4. Install the skills

```sh
mr-handy skill install                # symlinks skills/* into ~/.claude/skills
```

That installs `/coordinator` and `/coordinator-profile`.

### 5. Write your profile (optional)

In any Claude Code or T3 thread, run:

```
/coordinator-profile
```

It reads your setup, shows a draft of `~/.mr-handy/profile.md` and asks only what it couldn't work out: your branch template, issue tracker, how plans get written and the rules every step thread follows. Every coordinator reads that file. Without it, a coordinator writes plans directly, uses no tracker and names branches `<type>/<ticket or step id>`.

### 6. Start a project with T3

Open a new thread in the T3 project for the repo the work happens in, and run:

```
/coordinator <what the project should achieve>
```

The thread becomes the project's coordinator: it names the project, writes the plan, shows it to you and mirrors it into the database. Approve the plan, then set the project Active on its page in the web app. The coordinator launches a step thread per step and tracks each one's pull request.

To pick a project back up in a fresh thread, run `/coordinator <slug>`. It resumes from the database and the project's wiki under `~/.mr-handy/<slug>/`. [skills/coordinator/SKILL.md](skills/coordinator/SKILL.md) holds the rules, including what a coordinator may do without asking.

## Developing

[docs/developing.md](docs/developing.md) covers the repo layout and how to run the app, typecheck and tests.
