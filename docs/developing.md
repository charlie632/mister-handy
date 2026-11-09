# Developing

- `packages/domain` holds the Effect Schema definitions every other package shares, and `deriveStepNodes`, which works out each step's state.
- `packages/db` holds the SQLite schema and the queries the pages and the CLI run. [storage.md](storage.md) describes the model.
- `apps/web` is the TanStack Start app with the Home page and Project pages.
- `apps/cli` is `mr-handy`, the CLI coordinators use to write the plan and post status updates.
- `skills/` holds the `/coordinator` and `/coordinator-profile` skills.

```sh
pnpm dev                              # web app with hot reload on http://localhost:3000
pnpm typecheck
pnpm test
```
