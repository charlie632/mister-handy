<img src="assets/icon.svg" width="64" height="64" alt="">

# Mister Handy

One place to watch every project you're running at once: its plan, where each plan step stands, and which T3 Code thread is working it. [CONTEXT.md](CONTEXT.md) defines the terms.

## Layout

- `packages/domain` holds the Effect Schema definitions every other package shares, and `deriveStepNodes`, which works out each step's state.
- `packages/db` holds the SQLite schema and the queries the pages and the CLI run. [docs/storage.md](docs/storage.md) describes the model.
- `apps/web` is the TanStack Start app with the Home page and Project pages.
- `apps/cli` is `mr-handy`, the CLI a coordinator thread uses to write the plan, post status updates and set up the database.

## Running it

Needs Node 22.23 or newer and pnpm 10.28.

```sh
pnpm install
pnpm build
pnpm exec mr-handy db init                                   # create the tables, safe to rerun
pnpm exec mr-handy db load docs/examples/chase-2146.sql     # load the CHASE-2146 example
pnpm dev                                                     # web app on http://localhost:3000
pnpm typecheck
pnpm test
```

The database is `~/.mr-handy/mister-handy.db`. Set `MR_HANDY_DB` to use another file, for example to try the example without touching your real data:

```sh
export MR_HANDY_DB=/tmp/mr-handy-try.db
pnpm exec mr-handy db init && pnpm exec mr-handy db load docs/examples/chase-2146.sql
pnpm dev
```

`mr-handy db load` runs the whole file in one transaction, so a file that fails halfway leaves the database as it was. Node prints an ExperimentalWarning for `node:sqlite` on 22.x. It's harmless.

## Writing a plan

A coordinator records its project's plan and progress with `mr-handy`:

```sh
mr-handy project create chase-2146 --name "Workspace-scoped applications" --epic CHASE-2146

mr-handy step add route-readers  --project chase-2146 --title "Route readers through the applications aggregate" --ticket CHASE-2148
mr-handy step add require-viewer --project chase-2146 --title "Make a viewer argument required on every read" --depends-on route-readers
mr-handy step add unique-name    --project chase-2146 --title "Make applications.name unique" --after route-readers

mr-handy step rewrite unique-name --project chase-2146 --ticket CHASE-2147
mr-handy step split require-viewer --project chase-2146 --part require-viewer-api="Require a viewer in the internal API"
mr-handy dependency add unique-name --project chase-2146 --on require-viewer
mr-handy dependency remove unique-name --project chase-2146 --on require-viewer
mr-handy step drop unique-name --project chase-2146

mr-handy status started   --project chase-2146 --step require-viewer --thread <step thread id>
mr-handy status pr-opened --project chase-2146 --step require-viewer --url https://github.com/cerbyinc/platform/pull/36673
```

Each command prints one line per change, or `No change.` when the database already looked like that, so every command is safe to rerun. A command that conflicts with what is stored, names an unknown project or step, or would close a dependency cycle prints `Refused:` and the reason on stderr, writes nothing, and exits 1.

- `step add` appends the step unless `--after` names the step it goes after. `--depends-on` can be repeated.
- `step split` keeps the original step with its ticket, threads and pull requests, and adds each `--part <id>=<title>` right after it. Each part waits on what the original waited on, and whatever waited on the original waits on each part too.
- `step drop` marks the step Dropped. Its threads and pull requests stay, and each step that waited on it waits on its dependencies instead.
- `project create` fills in `--thread` from `T3CODE_THREAD_ID` and `--environment` from `$T3CODE_HOME/userdata/environment-id` when they are left out, so the calling thread becomes the coordinator. T3 Code sets both variables in every thread.
- `status started --thread` names the step thread, so it has no fallback. `--environment` falls back as above. The thread that runs a status command is recorded as the update's poster.

## Serving it on the tailnet

The pages go out over Tailscale, so only your own devices reach them. Build once, run the built app on localhost, and put `tailscale serve` in front of it for HTTPS. Port 443 on this machine already serves T3 Code, so Mister Handy uses 8300.

```sh
pnpm build
pnpm serve                                                   # built app on http://127.0.0.1:3000
tailscale serve --bg --https=8300 http://127.0.0.1:3000      # https://<machine>.<tailnet>.ts.net:8300
tailscale serve status                                       # shows the URL
tailscale serve --https=8300 off                             # stop serving
```

`tailscale serve --bg` survives a reboot and `pnpm serve` doesn't, so after a reboot only the app needs restarting. `pnpm dev` works behind the same proxy. Vite rejects unknown hosts, so `apps/web/vite.config.ts` allows `*.ts.net` in dev and preview.
