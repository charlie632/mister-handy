import { RegistryProvider } from "@effect/atom-react"
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import styles from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Mister Handy" }],
    links: [{ rel: "stylesheet", href: styles }, { rel: "icon", type: "image/png", href: "/logo.png" }]
  }),
  shellComponent: RootShell
})

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <RegistryProvider>{children}</RegistryProvider>
        <Scripts />
      </body>
    </html>
  )
}
