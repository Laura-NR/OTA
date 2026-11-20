# Drop `supplier_profiles.credential_document_url`: schema diff for review

**Status:** **Approved 2026-11-20 as recommended (U1a, U2a) and built the same day** (§5). **A
migration** that deletes a column and its values.
**Scope:** the clean-up `docs/schema-w-credentials.md` V8 left for later. Since W-Credentials
(2026-11-14), no code writes or reads the column. Each value it held was copied into
`supplier_credentials` by the backfill in `20261114143342_w_credentials`.

## 1. Today

- `supplier_profiles.credential_document_url` (TEXT, nullable): a storage key from before
  W-Credentials. It has no reader or writer in `apps/` or `packages/`. Only the Prisma model,
  the applied migrations and three tests name it.
- Dev DB (read 2026-11-20): 1 of 3 suppliers has a value, and that key is also a
  `supplier_credentials.storage_key`. **No file is referenced only by this column.**
- Production has never run (no release tag), so it holds no values.
- `credential_expires_at` **stays**: dispatch, the expiry scan, Ops Lite and W-Home read it, and
  W-Credentials rewrites it at every approval.

## 2. Data change (this is why it is Article 2)

```sql
-- Migration drop_credential_document_url
ALTER TABLE "supplier_profiles" DROP COLUMN "credential_document_url";
```

```prisma
model SupplierProfile {
  // removed: credentialDocumentUrl String? @map("credential_document_url")
}
```

The values are deleted. Nothing is backfilled. The applied migration that reads the column
(`20261114143342_w_credentials`) is left as it is, since migrations run in order.

## 3. Decisions (options and recommendation)

**U1 · Drop now.**
(a) **Recommended:** drop it now, before the first release, while production has no values. A
column nobody reads is a trap for the PII review (it lists every place a document key lives).
(b) Keep it until after launch. Each release then carries a dead column, and the drop gets
harder once production has rows.

**U2 · The live backfill test.**
`apps/api/test/supplier-credentials.integration.test.ts` "backfills an old credential file as the
category's main document (V8a)" re-runs the backfill SQL against the live dev DB. After the drop
that SQL cannot run (it selects the column).
(a) **Recommended:** delete that one test. The backfill ran once on 2026-11-14, and its proof is
in the history and the handoff. The file's other tests stay, and its supplier fixture loses the
`credentialDocumentUrl` field.
(b) Keep it by re-adding the column inside the test's transaction. That's test-only DDL against
the dev DB, to prove a migration that will never run again.

**Also changed (no decision):** the fake supplier rows in `apps/api/test/dispatch.service.test.ts`
and `apps/api/test/suppliers.e2e.test.ts` lose the field. `docs/pii-at-rest-review.md` and
`docs/schema-w-credentials.md` §7 record the drop.

## 4. What lands once approved

- The migration (generated with `prisma migrate dev --name drop_credential_document_url`, the
  model edited by hand, not through `prisma format`), applied to the dev DB.
- The test changes above. `pnpm typecheck`, the unit suite and the live tests run, and
  `prisma migrate diff` reports no difference.

## 5. As built (2026-11-20)

- Migration `20261120101001_drop_credential_document_url` (written from `prisma migrate diff`,
  since `migrate dev` refuses a data-losing step without a terminal; applied with `migrate
  deploy`). Dev DB: the one value dropped, and `migrate diff` reports no difference.
- The backfill test is deleted. The file's other live test, `dispatch.service.test.ts` and
  `suppliers.e2e.test.ts` pass without the field.
