# Hackathon folder

Everything needed for the hackathon, in two parts:

| Folder | What it is | When to use it |
|---|---|---|
| [build-package/](build-package/README.md) | **The instructions to build the server** with Claude Code, for Kumo's NetSuite data: what to build, the demo script, the design, the agent's rules and prompts, the API contract for the front team, the tests, the ordered tasks, and the Aiven deployment | To build. Start with `build-package/README.md` |
| [feature-book/](feature-book/README.md) | **The background research**: how Palantir Foundry works, observed module by module, a consolidated plan, a comparison with Foundry's public docs, and the semantic engine (EvoOntology, chapter 8) | To understand *why* the design is the way it is, or to extend it after the hackathon |

## How to start building

1. Create an empty project folder (a new git repository).
2. Copy `build-package/` into it as `docs/build-package/`, `build-package/CLAUDE.md` to its root and `build-package/LICENSE-EvoOntology` to its root as `NOTICE`.
3. Put your `ANTHROPIC_API_KEY` in a `.env` file there yourself.
4. Open Claude Code in that folder and say: *"Read docs/build-package/README.md and do task T-P1 from 08-tasks.md. Stop when its checks pass."* Then T-01, T-02, and so on.

Kumo's data files are **not** in this repository and must never be committed; the build uses a synthetic sample (`fixtures/kumo-mini/`, task T-02b) and loads the real files locally or on Aiven with `pnpm seed:kumo`.
