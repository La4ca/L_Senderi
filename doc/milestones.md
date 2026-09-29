# Milestones and assignments

Every milestone is required before the first usable release. Each feature owner handles its client, server, documentation updates, and meaningful tests. The other developer reviews the pull request. Milestones are ordered by dependency; no calendar dates are assumed.

| Milestone | Owner | Tasks | Exit check |
| --- | --- | --- | --- |
| M0 — Foundation | Jan and Laica | Jan: Express TypeScript app, MongoDB connection, shared contracts, API validation and error handling. Laica: Vite React TypeScript app, Tailwind, routing, API client, base responsive layout. Together: environment examples, local proxy, CI checks. | Both apps start locally, the client reaches `/api/health`, and CI runs on a pull request. |
| M1 — Accounts | Jan | Registration, login/logout, session storage, password hashing, failed-login limits, forgot/reset flow, Brevo template and send limits. | Two users can register and sign in; reset works once; repeated attempts are throttled; unknown email receives the same reset-request response. |
| M2 — Profiles | Laica | Profile view/edit, bio and information fields, avatar and cover upload/replace, Cloudinary asset cleanup. | Owner edits persist; another user can view; non-owner edits fail. |
| M3 — Friends | Jan | User search, request send/list, accept/decline, friend list, remove, mutual-friend checks. | Pending requests grant no access; accepted friends do; removal revokes access. |
| M4 — Timeline | Laica | Text/photo composer, chronological feed, author timeline, Public/Friends/Only me visibility, post audience edit, protected photo delivery. | All three audiences work for feed, direct links, and photo bytes before and after audience changes. |
| M5 — Interactions | Jan | Like/unlike, comment list/add, Public-post share creation and display, source-visibility recheck. | Only visible posts accept interactions; duplicate Likes are prevented; a now-hidden source disappears from shares. |
| M6 — Chat | Laica | One-to-one Socket.IO text messaging, MongoDB history, ticket auth, friend checks on send, reconnect and missed-history load. | Two friends exchange persistent live messages; duplicates are avoided; non-friends and removed friends cannot send. |
| M7 — Release integration | Jan and Laica | Jan: Render, Atlas, Brevo, secrets, security checks. Laica: Vercel, Cloudinary, responsive interface, upload checks. Both: end-to-end acceptance and release review. | Every product acceptance journey passes on the deployed free-tier stack; tag `v1.0.0`. |

## Dependency and review order

M0 precedes all feature work. M1 provides identities and sessions for M2–M6. M3 must precede final Friends audience and chat acceptance. M4 must precede M5. Jan and Laica can start feature branches concurrently once their dependencies and shared contracts are on `main`.

For each pull request, the owner records the user-visible behavior, API or schema changes, test evidence, and any deployment variables. The reviewer checks authorization paths and the matching client/server contract before approval. Update the relevant documents in `doc/` whenever behavior changes.
