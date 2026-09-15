// PERF-03 — la réécriture mécanique `auth.uid()` → `(select auth.uid())`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reecrire, policyEnSql, concernee } from "../../scripts/generer-migration-initplan.mjs";

test("① un auth.uid() nu est enveloppé, un déjà enveloppé est préservé, rien d'autre ne bouge", () => {
  assert.equal(reecrire("(user_id = (auth.uid())::text)"), "(user_id = ((select auth.uid()))::text)");
  assert.equal(reecrire("(user_id = (( SELECT auth.uid() AS uid))::text)"), "(user_id = ((select auth.uid()))::text)");
  assert.equal(reecrire("(user_id = ((select auth.uid()))::text)"), "(user_id = ((select auth.uid()))::text)");
  assert.equal(reecrire("is_conv_member(conv_id, (auth.uid())::text) AND NOT is_blocked_with(auth.uid()::text)"), "is_conv_member(conv_id, ((select auth.uid()))::text) AND NOT is_blocked_with((select auth.uid())::text)");
  assert.equal(reecrire("(true)"), "(true)");
  assert.equal(reecrire(null), null);
  assert.equal(reecrire("auth.role() = 'authenticated'"), "auth.role() = 'authenticated'");
});

test("② la policy est ré-émise à l'identique : commande, rôles (texte PostgreSQL ou tableau), permissive, USING, WITH CHECK", () => {
  const sql = policyEnSql({ tablename: "posts", policyname: "Ecriture propre", permissive: "PERMISSIVE", roles: "{authenticated,anon}", cmd: "INSERT", qual: null, with_check: "(author_id = (auth.uid())::text)" });
  assert.match(sql, /drop policy if exists "Ecriture propre" on public\."posts";/);
  assert.match(sql, /create policy "Ecriture propre" on public\."posts"\n  as permissive for insert to "authenticated", "anon"\n  with check \(\(author_id = \(\(select auth\.uid\(\)\)\)::text\)\);/);
  assert.ok(!/using/.test(sql));
  const r = policyEnSql({ tablename: "x", policyname: "p", permissive: "RESTRICTIVE", roles: ["public"], cmd: "SELECT", qual: "(a = auth.uid()::text)", with_check: null });
  assert.match(r, /as restrictive for select to public\n  using \(\(a = \(select auth\.uid\(\)\)::text\)\);/);
});

test("③ seules les policies qui changent sont concernées", () => {
  assert.equal(concernee({ qual: "(a = (( SELECT auth.uid() AS uid))::text)", with_check: null }), false);
  assert.equal(concernee({ qual: "(true)", with_check: "(b = auth.uid()::text)" }), true);
  assert.equal(concernee({ qual: null, with_check: null }), false);
});
