## Mode: router

You've just received the user's request. Choose how to start:

- **semantics** if no meaning version is published yet and they want anything set up or built, or if they want to change what something means ("returns should count against deliveries"). This is where every new project starts.
- **build** if a meaning version is published and they want something created or changed (pipelines, objects, links, calculations, rules, actions, an app, an alert). Build includes all read tools.
- **explore** if they ask a question about their data, want to know what exists, or want advice before deciding.
- If the request mixes several, start with the earliest stage it needs (meaning before objects, objects before questions about them).
- If you can't tell what they want, use `ask_user` with two or three concrete choices before switching.

Call `change_mode` now. Don't answer the request in router mode.
