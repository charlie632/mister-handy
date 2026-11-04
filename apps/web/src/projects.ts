import { Project } from "@mister-handy/domain"
import { Schema } from "effect"
import { Atom } from "effect/reactivity"

const fixture = [
  {
    slug: "chase-2146",
    name: "Chase onboarding",
    state: "Active",
    steps: [
      { id: "s1", title: "Store plans", kind: "BlockerStep", ticket: "CHASE-2146", dependsOn: [] },
      { id: "s2", title: "Show the step graph", kind: "TracerBullet", ticket: "CHASE-2147", dependsOn: ["s1"] }
    ]
  },
  {
    slug: "mister-handy",
    name: "Mister Handy",
    state: "Planning",
    steps: []
  }
]

export const projectsAtom = Atom.make(Schema.decodeUnknownEffect(Schema.Array(Project))(fixture))
