---
description: Scaffold a new module or component following this project's existing structure and conventions.
argument-hint: "[what to scaffold, e.g. 'a billing module' or 'a REST resource for invoices']"
---

Scaffold: **$ARGUMENTS**

Procedure:

1. **Study the neighbours first.** Find two or three existing modules of the same kind and read
   them. Derive the structure, naming, error handling and test layout from what is actually there
   — not from a generic template.
2. **Propose the file list** before writing: each file, its purpose, and where it goes.
3. **Create the files**, mirroring the conventions you found: same folder shape, same test file
   naming, same config wiring.
4. **Wire it in** the same way its siblings are wired (registration, routing, exports, DI, build
   config), and confirm nothing that lists modules was missed.
5. **Add a first test** that asserts the scaffold's behaviour, so the module is not dead on
   arrival.

Constraints:

- Do not invent an architecture the project does not use.
- Do not add a dependency without saying why and checking the project does not already have one
  that fits.
- Leave no placeholder that will silently break: no unimplemented branch that returns `None`, and
  no commented-out code.

Close with the files created and the command that proves the new module loads or its test passes.
