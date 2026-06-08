## Summary

<!-- What does this PR change? Keep it concise. -->

Closes #

## Type

- [ ] feat
- [ ] fix
- [ ] chore
- [ ] refactor
- [ ] docs
- [ ] test
- [ ] spike

## Area

- [ ] api
- [ ] ui
- [ ] db
- [ ] auth
- [ ] realtime
- [ ] queue
- [ ] playback
- [ ] moderation
- [ ] external
- [ ] infra
- [ ] docs
- [ ] test

## Scope

### In

<!-- What is intentionally included? -->

### Out

<!-- What is intentionally excluded? -->

## SDD Reference

<!-- Link or cite the relevant SDD section, e.g. §7.3 Nickname Protection, §15 API Design, §16 WebSocket Event Design. -->

SDD section(s):

-

## Acceptance Criteria

<!-- Copy AC from the linked issue and check off what this PR satisfies. -->

- [ ]

## Verification

### Required

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

### If database changed

- [ ] `pnpm --filter api prisma validate`
- [ ] Migration tested against a clean local database
- [ ] Migration rollback/forward risk reviewed

### If API changed

- [ ] Request validation covered
- [ ] Error envelope uses registered error code
- [ ] Auth/access-tier behavior tested
- [ ] Rate limit behavior considered

### If WebSocket/realtime changed

- [ ] Event payload shape documented or typed
- [ ] Listener/member permission behavior tested
- [ ] Reconnect/snapshot behavior considered

### If UI changed

- [ ] Listener read-only state verified
- [ ] Protected nickname upgrade prompt verified where relevant
- [ ] Basic responsive behavior checked
- [ ] Accessibility basics checked: labels, focus states, keyboard path

### If external integration changed

- [ ] No integration secrets exposed to browser payloads
- [ ] Signature/authentication behavior tested
- [ ] Idempotency/replay behavior tested
- [ ] Outbound webhook failure does not roll back accepted state

## Screenshots / Demo

<!-- Add screenshots, terminal output, or a short demo note when useful. -->

## Risk / Rollback

Risk level:

- [ ] Low
- [ ] Medium
- [ ] High

Rollback plan:

-

## Security & Privacy Checklist

- [ ] No plaintext passwords, secrets, tokens, session IDs, or host secrets logged
- [ ] Server-side authorization enforced; no client-trust shortcut
- [ ] Native interactive actions require protected nickname/member tier where applicable
- [ ] Public payloads do not expose raw IPs, password metadata, integration secrets, or host secret metadata
- [ ] YouTube media is embedded only; no downloading, proxying, caching, or re-streaming audiovisual content

## Final Checklist

- [ ] Linked issue included with `Closes #...`
- [ ] PR is one independently reviewable unit of work
- [ ] No unrelated refactors or drive-by changes
- [ ] Docs updated if behavior changed
- [ ] CI green
