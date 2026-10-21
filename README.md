# Hackathon folder

Everything needed for the hackathon, in two parts:

| Folder | What it is | When to use it |
|---|---|---|
| [build-package/](build-package/README.md) | **The instructions to build the software** with Claude Code: what to build, the demo script, the design, the assistant's rules and prompts, the screens, the tests, 26 ordered tasks, and the demo spreadsheets | To build. Start with `build-package/README.md` |
| [feature-book/](feature-book/README.md) | **The background research**: how Palantir Foundry works, observed module by module (7 chapters), a consolidated plan, and a comparison with Foundry's public docs | To understand *why* the design is the way it is, or to extend it after the hackathon |

## How to start building

1. Create an empty project folder (a new git repository).
2. Copy `build-package/` into it as `docs/build-package/`, and `build-package/CLAUDE.md` to its root.
3. Put your DeepSeek key in a `.env` file there yourself.
4. Open Claude Code in that folder and say: *"Read docs/build-package/README.md and do task T-01 from 08-tasks.md. Stop when its checks pass."* Then T-02, T-03, and so on.

The demo spreadsheets are in `build-package/fixtures/` (`tickets.csv`, `people.csv`).
