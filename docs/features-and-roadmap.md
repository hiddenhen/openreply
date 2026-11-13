# Self-Hosted Instagram Automation: Meta Unified Login, Multi-Account Support and Company Workspaces

This fork extends OpenReply for Meta's October 2026 Unified Login transition. Status below distinguishes implemented behavior from planned features. It does not claim that company isolation or shared account ownership already works.

## Feature status

| Searchable feature title | Status | Priority | Scope and limits | Recommended model at 33% budget |
| --- | --- | --- | --- | --- |
| Meta OAuth Updated October 2026 — Instagram API with Unified Login | Implemented; one live pilot verified | Maintenance | Facebook Login for Business configuration, server-side code exchange, encrypted tokens, signed workspace state, selected-account Graph requests, comments/messages/postback subscriptions. A real comment-to-DM succeeded on its first attempt. Other message flows remain to be tested. [Setup details](unified-login.md). | Lightweight model for docs, diagnostics and small fixes; stronger model only for Meta permission or token changes. |
| Multi-Account Instagram Management | Implemented; multi-account logic covered by automated tests | High | Multiple professional Instagram accounts in one workspace. Unified Login enumerates all granted assigned accounts, including cursor pages. Thirteen accounts are connected in the pilot workspace; only one has live delivery validation. | Lightweight model for onboarding copy and UI; stronger model for API, queue or account-routing changes. |
| Multi-Company Workspaces and Company Switching | Planned | High | Workspace records and roles exist, but current request context selects the user's earliest membership. There is no complete company creation/switching workflow. Do not advertise operational multi-company support yet. | Stronger model recommended: this changes authentication, tenant isolation and nearly every data route. |
| Shared Instagram Accounts Across Multiple Companies | Planned; currently blocked by the data model | High | Instagram account IDs are globally unique and each account belongs to one workspace. Cross-workspace reconnects are deliberately rejected. Sharing requires explicit company-account associations, permissions and event/campaign routing. | Stronger model recommended: authorization and duplicate-delivery mistakes could expose data or send unintended DMs. |
| Multi-User Company Access and Team Roles | Existing workspace-level foundation | Medium | Owner, Admin and Member roles and email invitations exist. Access is workspace-wide, not limited to chosen Instagram accounts. On a restricted self-hosted installation, invited emails must also be allowed by ALLOWED_EMAILS. Company switching and least-privilege account assignments require additional work. | Lightweight model for invitation copy and role labels; stronger model for account-level authorization. |
| Account-Level Assignment and Teammate Permissions | Planned | High | Let admins assign selected Instagram accounts to specific members while keeping campaigns, inboxes, logs and credentials scoped correctly. | Stronger model recommended; security-sensitive access control. |
| Company Reporting, Quotas and Audit Trail | Planned | Medium | Attribute campaigns, DMs, failures, clicks, API keys and operational events to a company and preserve an audit history for membership and account changes. | Lightweight model for reports; stronger model for schema and event-boundary design. |

## How to connect more Instagram accounts

1. Sign into the deployed OpenReply instance as a workspace Owner or Admin.
2. Open **Settings → Instagram Connection → Connect using your own Meta app**. Do not disconnect the existing account to add another.
3. Complete Meta's connection flow using the Facebook identity authorized to manage the intended business assets. Review the business portfolio and Instagram account selection carefully. Retain existing accounts when Meta presents an editable set of granted assets; permission changes can affect existing grants.
4. Select only the intended professional Instagram accounts and review the access before approving. The callback connects or updates all eligible accounts returned by that grant in the current workspace. It does not transfer accounts from another workspace or replace a Zernio connection.
5. Return to Settings and verify each username and **Webhook ready** status. Select the intended account when creating a campaign; test each account independently before enabling ordinary production keywords.
6. While the Meta app remains in development/Standard Access, confirm the necessary app roles/tester eligibility for each pilot account. Where an Instagram Tester invitation is used, accept it while signed into that exact Instagram profile under **Settings → App website permissions → Apps and websites → Tester Invites**. Review Meta's current console requirements; roles do not bypass access review requirements for outside users.

If an account is missing from Meta's selection, check that the Facebook user can manage it in the correct business portfolio, that the Instagram account is professional, and that the app's development-role requirements are met. Do not request broad business-management access merely as a guess. The first pilot worked without adding business_management.

An additional account does not require another OpenReply server or another Meta app solely because it is another Instagram profile. Separate companies' legal ownership, Meta permissions and application access requirements still need review. Hosting load depends on event volume, queue depth and traffic rather than account count alone.

## Multi-company implementation roadmap

- Add explicit company creation, membership management and a company switcher. Resolve the selected company on the server and check membership on every request rather than selecting the oldest membership.
- Separate the Instagram connection/credential from its company assignments. Use a company-account join model with explicit authorization for sharing; keep credentials encrypted and inaccessible to ordinary members.
- Define account-level roles and company-level invitation roles. A company membership must not silently grant access to every account or another company's private activity.
- Define deterministic webhook ownership, campaign matching, deduplication and quota attribution for shared accounts. One comment must not accidentally cause duplicate DMs from two companies.
- Audit campaign, inbox, logs, analytics, API/MCP keys, jobs and token lifecycle for tenant boundaries. Test cross-company denial, revoked membership, shared-account removal and concurrent connections before release.

These are roadmap notes, not an implementation commitment or permission to expose existing accounts to teammates. Until this work is implemented, use the current workspace only for people who should access all of its connected accounts.
