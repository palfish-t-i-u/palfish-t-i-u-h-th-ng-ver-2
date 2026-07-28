# `useParams()` doesn't see params from sibling/child routes, only ancestors

**Related files:** `frontend/src/pages/docs/DocsLayout.tsx`, `frontend/src/pages/docs/DocsSidebar.tsx`

**Problem:** Building a GitBook-style docs layout: a persistent sidebar (module/topic tree) next to a content pane whose route (`:moduleSlug/:topicSlug`) changes via nested `<Routes>`. The sidebar needs to know the current `moduleSlug`/`topicSlug` to auto-expand and highlight the active item.

**Trap:** Calling `useParams<{moduleSlug, topicSlug}>()` directly inside the sidebar component, assuming any component rendered "under" the same parent route can read the matched params. It silently returns `{}` — no error, no warning — so the sidebar just never highlights anything and the bug looks like a state/prop-passing problem instead of a routing one.

**Insight:** React Router's `useParams()` only returns params accumulated **downward** along the currently rendered route branch — i.e., visible to the component that is the `element` of a matched `<Route>` (or its descendants via `<Outlet/>`), not to *siblings* of that route's outlet. A sidebar rendered next to `<Routes>{...}</Routes>` (not inside one of those `<Route element>` components) is not part of the matched branch that owns `:moduleSlug`/`:topicSlug`, so it sees none of those params, regardless of whether the nested routes are declared inline or via an `<Outlet/>`-based layout route — the scoping is about the render tree at match time, not which JSX pattern is used to write it.

**Rule:** Any component that needs the current route's params but is NOT itself one of the matched `element`s in that route branch must derive them another way — parse `useLocation().pathname` manually, or use `matchPath()` from react-router against the current location. Don't reach for `useParams()` from a persistent layout sibling (sidebar, breadcrumb rendered outside the routed subtree, etc.) and assume it "just works" — verify by logging `useParams()` output once when adding this pattern.

**Verify:** `grep -n "useLocation\|useParams" frontend/src/pages/docs/DocsSidebar.tsx` — should show `useLocation`, not `useParams`, as the source of `moduleSlug`/`topicSlug` there.
