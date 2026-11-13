# Application Changelog

Track notable user-facing changes using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and version releases using [Semantic Versioning](https://semver.org/). Move actual changes out of Unreleased when the release commit and its evidence are known.

## [Unreleased]

- Added handbook review and submission evidence for Kiro, Claude Code, Postman and Playwright.
### Added

- Added the Kiro Feature Spec workflow and detailed backend and frontend implementation specs.
- Local implementation prompts, placeholder environment files and repository ignore rules.
- Project requirements, design, API contract and acceptance baseline.

### Changed

- Simplified implementation to two reusable prompts per feature with synchronized task status and documentation.
- Added a documentation checkpoint to each implementation task so README facts and applicable changelogs can be updated with the code change.
- The implementation workflow starts from the included spec. Local acceptance precedes GitHub connection and live deployment. Application implementation is pending.

## Release entry template

```markdown
## [X.Y.Z] - YYYY-MM-DD
### Added
- User-visible capability and related AC or PR.
### Changed
- Behavior that changed and who is affected.
### Fixed
- Observable issue and fix.
### Security
- Security-relevant change where applicable.

- Backend/frontend versions: …
- Tested commit and environment: …
- Test and deployment evidence: …
```
