# War Council Invitations and Approvals

## What will change
- Replace council-tag auto-join behavior with an explicit pending leader-approval request and status feedback.
- Complete authenticated store actions for sending/responding to direct player-tag invites and approving/declining join requests.
- Add live database subscriptions for councils, members, invitations, and requests; refresh roster and pending statuses when rows change.
- Wire the council screen with incoming invite banner, leader request review controls, and direct invite forms on open seats.
- Update the council-store tests to verify pending requests and the new invitation/approval actions.

## Technical details
- Reuse the current authenticated client and the existing `council_invites` / `council_join_requests` tables and RLS policies.
- Realtime channels will be created in an effect and removed on cleanup; database changes will refresh the affected local views.
- Verify targeted tests and the app typecheck/build, then inspect the latest preview build log.
