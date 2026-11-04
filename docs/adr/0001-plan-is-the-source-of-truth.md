# The plan is the source of truth, Jira only points to it

On 2026-11-04 we decided that each project's plan file owns which steps exist and how they depend on each other. Jira tickets and Jira Blocks links are pointers the coordinator mirrors from the plan. The plan is the user's own working document. Jira is required by the company but hard to follow, and its statuses are vague. Making Jira the source would put the least readable copy in charge of the step graph.

## Consequences

- Every ticket starts as a plan step. Work found mid-project joins the project only once it is a step in the plan.
- When Jira disagrees with the plan, that's drift. Jira gets corrected, never the plan.
- A step's state comes from its thread and pull requests, never from its Jira status.
