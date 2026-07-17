# Next.js Coding Guidelines

Use this note when editing Next.js applications, especially App Router code that mixes server and client concerns.

## Baseline

- Prefer the installed Next.js docs for the exact project version over model memory.
- In repos with local Next docs, read the relevant file under `node_modules/next/dist/docs/` before making framework-level changes.
- Treat the docs as the source of truth for routing, rendering, caching, metadata, middleware, and server/client boundaries.

## Working Rules

- Default to Server Components. Add `'use client'` only when the component truly needs browser APIs, client state, effects, or interactive event handlers.
- Keep server-only code on the server: auth, secrets, privileged data fetching, and backend coordination should not leak into client bundles.
- Keep client components thin. Push data loading, transformation, and privileged mutations upward into server components, route handlers, or server actions.
- Make caching behavior explicit. When changing fetches, route rendering, revalidation, or action invalidation, check the relevant docs first instead of relying on older mental models.
- Prefer built-in Next primitives over ad-hoc patterns: App Router conventions, route handlers, metadata APIs, redirects, `notFound()`, and server actions where appropriate.
- Respect React Server Component boundaries. Pass serializable data across the boundary and avoid coupling client components to server-only modules.
- Use `loading`, `error`, and `not-found` conventions where they improve route behavior instead of custom one-off control flow.
- Keep middleware minimal and edge-safe. Use it for routing/auth gating concerns, not heavy business logic.
- Preserve debuggability: readable component splits, explicit data flow, and observable failure states are more important than clever abstraction.

## React Compiler

- If the repo enables React Compiler, follow compiler-friendly patterns.
- Do not add `useMemo` or `useCallback` by default. Only use them when required by an external API, measured performance need, or an established repo pattern.
- Prefer straightforward component logic, stable props by construction, and smaller components over manual memoization.

## WWPAGE Focus

- `wwpage` uses Next.js App Router and has `reactCompiler: true` in `next.config.mjs`.
- Before changing routing, rendering, caching, navigation, or middleware behavior in `wwpage`, consult the installed docs under `$HOME/Projects/worldwide/wwpage/node_modules/next/dist/docs/`.
- For framework changes, start from `index.md`, then the relevant App Router or architecture page, and only then edit code.
