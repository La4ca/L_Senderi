# Branch and release workflow

The repository begins with an empty `main`. The initial documentation commit establishes its baseline. Keep `main` deployable once application code exists.

## Branches and pull requests

- Create one short-lived branch per reviewable task from current `main`: `feature/mN-description-jan`, `feature/mN-description-laica`, or `docs/description`. Examples: `feature/m1-password-reset-jan` and `feature/m4-post-privacy-laica`.
- Open a pull request into `main`. Link its milestone, describe behavior and contract changes, and include test evidence. Split a large milestone into multiple feature branches rather than keeping one branch open throughout the milestone.
- Jan reviews Laica's pull requests; Laica reviews Jan's. Require one approval and passing CI before squash merging. Resolve review comments on the branch, then sync with current `main` before merging.
- Configure GitHub branch protection or a ruleset for `main` when the remote repository is available: block direct pushes, require a pull request, one peer approval, and the CI checks. Administrators should follow the same path.
- Do not create permanent `develop` or placeholder milestone branches. The owner creates a feature branch when the task begins; merged branches can be deleted.

## CI and release

The M0 CI workflow should run TypeScript checks, lint, client and server builds, and the tests added by each milestone. Never put credentials in branches, commits, pull-request descriptions, or CI logs; use environment settings and example variable names only.

After M7 acceptance on deployed services, create the annotated tag `v1.0.0` from `main`. For a later urgent fix, branch `fix/description` from `main`, use the same review and CI rules, and release a patch tag after verification.
