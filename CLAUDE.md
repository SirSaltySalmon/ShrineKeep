## gstack

Use the `/browse` skill from gstack for all web browsing tasks. **Never** use `mcp__claude-in-chrome__*` tools — they are slow and unreliable.

Available gstack skills:

- `/office-hours` — product ideas, brainstorming, "is this worth building"
- `/plan-ceo-review` — scope, strategy, ambition review
- `/plan-eng-review` — architecture and engineering review
- `/plan-design-review` — design review of a plan
- `/design-consultation` — design system, brand, visual identity
- `/design-shotgun` — rapid design variants
- `/design-html` — generate HTML/CSS designs
- `/review` — code review, pre-landing diff review
- `/ship` — ship, deploy, push, create a PR
- `/land-and-deploy` — land and deploy a change
- `/canary` — canary deploy
- `/benchmark` — performance benchmarking
- `/browse` — headless browser QA, web browsing, site testing
- `/connect-chrome` — connect to headed Chrome
- `/qa` — full QA testing of a site or feature
- `/qa-only` — QA without shipping
- `/design-review` — visual audit and design polish of a live site
- `/setup-browser-cookies` — configure browser cookies for testing
- `/setup-deploy` — configure deployment settings
- `/retro` — weekly retro, what did we ship
- `/investigate` — bugs, errors, broken behavior
- `/document-release` — update docs after shipping
- `/codex` — second opinion, adversarial code review
- `/cso` — chief security officer review
- `/autoplan` — run all reviews automatically
- `/careful` — safety/careful mode
- `/freeze` — restrict edits to a directory
- `/guard` — guard mode
- `/unfreeze` — lift freeze restrictions
- `/gstack-upgrade` — upgrade gstack
- `/learn` — log and retrieve project learnings

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
