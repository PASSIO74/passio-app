#!/usr/bin/env python3
"""Génère schema.sql (socle Supabase minimal + schéma/policies RÉELS de prod), seed.sql et mesures.sql."""
import json, re, os
S = os.path.dirname(os.path.abspath(__file__))
pol = json.load(open(f"{S}/policies.json"))
cols = {}
for line in open(f"{S}/colonnes.txt"):
    t, c = line.rstrip("\n").split("|", 1); cols[t] = c
pks = dict(x.split(":", 1) for x in open(f"{S}/pk.txt").read().strip().split(";"))
A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; C="cccccccc-cccc-4ccc-8ccc-cccccccccccc"; D="dddddddd-dddd-4ddd-8ddd-dddddddddddd"

out = []
out.append("""
-- ===== SOCLE Supabase minimal (roles, auth.uid, storage, realtime stub) =====
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text primary key, name text, public boolean default false);
CREATE TABLE storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid, created_at timestamptz default now(), metadata jsonb);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$ DECLARE _parts text[]; BEGIN SELECT string_to_array(name, '/') INTO _parts; RETURN _parts[1:array_length(_parts,1)-1]; END $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
INSERT INTO storage.buckets VALUES ('content','content',true), ('attachments','attachments',true);
""")
out.append("-- ===== TABLES RÉELLES (colonnes de production, 2026-09-08) =====")
for t, c in cols.items():
    out.append(f"CREATE TABLE public.{t} ({c}, PRIMARY KEY {pks[t]});")
out.append("""
ALTER TABLE public.passions ADD CHECK (status = ANY (ARRAY['active','archived','pending']));
ALTER TABLE public.event_attendees ADD CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
ALTER TABLE public.passion_relations ADD CHECK (relation_type = ANY (ARRAY['related','broader','narrower']));
ALTER TABLE public.passion_relations ADD CHECK (source_passion_id <> target_passion_id);
ALTER TABLE public.passion_requests ADD CHECK (status = ANY (ARRAY['pending','approved','rejected','duplicate']));
ALTER TABLE public.comment_interactions ADD CHECK (kind = ANY (ARRAY['like','reply','emoji','gif']));
-- Grants par défaut Supabase : anon et authenticated ont TOUS les droits sur les tables, la RLS est la seule barrière.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
""")
for t in cols: out.append(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
out.append(open(f"{S}/fonctions.sql").read())
out.append("-- ===== POLICIES RÉELLES (pg_policies, 2026-09-08, 119 public + 4 storage) =====")
for p in pol:
    roles = p["r"].strip("{}")
    sql = f'CREATE POLICY "{p["p"]}" ON {p["t"]} AS PERMISSIVE FOR {p["c"]} TO {roles}'
    if p["q"] is not None: sql += f' USING ({p["q"]})'
    if p["w"] is not None: sql += f' WITH CHECK ({p["w"]})'
    out.append(sql + ";")
open(f"{S}/schema.sql", "w").write("\n".join(out))

# ===== SEED synthétique : A propriétaire (compte public), C compte PRIVÉ, B tiers, D figurant =====
seed = f"""
INSERT INTO passions(id,label) VALUES ('musique','Musique'),('velo','Vélo');
INSERT INTO passion_relations VALUES ('musique','velo','related',1,now());
INSERT INTO profiles(id,username,bio,is_private,rs_links) VALUES ('{A}','alice','bio A',false,'{{"ig":"a"}}'),('{B}','bob','bio B',false,null),('{C}','carla','bio C PRIVEE',true,null),('{D}','dan','bio D',false,null);
INSERT INTO posts(id,author_id,content) VALUES ('post_A','{A}','post de A'),('post_C','{C}','post PRIVE de C');
INSERT INTO stories(id,author_id,content) VALUES ('story_A','{A}','story A'),('story_C','{C}','story C');
INSERT INTO post_comments(id,post_id,author_id,content) VALUES ('pc_A','post_A','{A}','c'),('pc_C','post_C','{C}','c');
INSERT INTO post_likes VALUES ('post_A','{A}'),('post_C','{C}');
INSERT INTO comment_interactions(id,comment_id,post_id,user_id,kind,payload) VALUES ('ci_A','pc_A','post_A','{A}','like',null),('ci_C','pc_C','post_C','{C}','like',null);
INSERT INTO comment_likes VALUES ('pc_A','{A}',now());
INSERT INTO events(id,author_id,title,address,contact,lat,lng,conv_id) VALUES ('ev1','{A}','Sortie','12 rue Exacte, Annecy','0600000000',45.9,6.1,'evgrp_ev1');
INSERT INTO event_attendees(event_id,user_id,rsvp) VALUES ('ev1','{A}','going'),('ev1','{C}','going');
INSERT INTO event_comments(id,event_id,author_id,text) VALUES ('ec1','ev1','{A}','x');
INSERT INTO event_reactions VALUES ('ev1','{A}','🔥',now());
INSERT INTO conversations(id,created_by) VALUES ('conv1','{A}'),('evgrp_ev1','{A}');
INSERT INTO conv_members VALUES ('conv1','{A}'),('conv1','{C}'),('evgrp_ev1','{A}');
INSERT INTO conv_messages(id,conv_id,from_id,content) VALUES ('m1','conv1','{A}','message PRIVE A->C');
INSERT INTO conv_reads VALUES ('conv1','{A}',now()),('conv1','{C}',now());
INSERT INTO notifications(id,user_id,kind,from_id,content) VALUES ('n1','{A}','like','{C}','notif de A');
INSERT INTO follows VALUES ('{A}','{C}');
INSERT INTO blocks(blocker_id,blocked_id) VALUES ('{A}','{D}');
INSERT INTO user_state(user_id,data) VALUES ('{A}','{{"secret":1}}');
INSERT INTO user_safety(user_id,majority_at) VALUES ('{A}','2000-01-01');
INSERT INTO push_subscriptions VALUES ('https://push/A','{A}','{{"keys":"x"}}',now());
INSERT INTO story_views VALUES ('story_A','{A}',now());
INSERT INTO user_passions(user_id,passion_id) VALUES ('{A}','musique');
INSERT INTO passion_requests(user_id,label,normalized_label) VALUES ('{A}','Tricot','tricot');
INSERT INTO telemetry_events(type,user_id,user_label,device_id) VALUES ('action','{A}','alice','dev-A');
INSERT INTO analytics_events(user_id,event) VALUES ('{A}','open');
INSERT INTO client_errors(message,uid) VALUES ('err','{A}');
INSERT INTO reports(id,reporter_id,target_type,target_id,reason) VALUES ('r1','{A}','post','post_C','abus');
INSERT INTO step_interactions(id,thread_id,user_id,kind,content) VALUES ('si1','th1','{A}','comment','x');
INSERT INTO video_lives(id,author_id,title) VALUES ('vl1','{A}','live');
INSERT INTO cdv_lives(id,author_id,destination,visibility) VALUES ('cdv_pub','{A}','Rome','public'),('cdv_priv','{A}','Oslo','private');
INSERT INTO cdv_live_steps(id,live_id,author_id,city) VALUES ('st1','cdv_priv','{A}','Oslo');
INSERT INTO cdv_live_comments(id,live_id,author_id,text) VALUES ('cc1','cdv_priv','{A}','x');
INSERT INTO cdv_live_reactions(id,live_id,user_id,emoji) VALUES ('cr1','cdv_priv','{A}','x');
INSERT INTO cdv_live_followers VALUES ('cdv_priv','{A}',now());
INSERT INTO cdv_live_collaborators VALUES ('cdv_priv','{D}','{A}',now());
INSERT INTO post_collaborators VALUES ('post_A','{D}','{A}',now());
INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('attachments','conv/conv1/vocal-prive.webm','{A}'),('content','u/{A}/photo.jpg','{A}');
"""
open(f"{S}/seed.sql","w").write(seed)

# ===== MESURES : par table, count sous chaque rôle + UPDATE/DELETE par le tiers B (transactions annulées) =====
tables = list(cols) + ["storage.objects"]
def q(t): return t if "." in t else f"public.{t}"
def firstcol(t):
    if t == "storage.objects": return "name"
    return cols[t].split(",")[0].split()[0]
m = ["\\pset format unaligned", "\\pset tuples_only on", "\\pset fieldsep '|'"]
def role(r, uid=None):
    s = f"set local role {r};"
    if uid: s += f" set local request.jwt.claim.sub='{uid}';"
    return s
for t in tables:
    T = q(t); c = firstcol(t)
    m.append(f"select 'TOTAL|{t}|' || count(*) from {T};")
    m.append(f"begin; {role('anon')} select 'ANON_SELECT|{t}|' || count(*) from {T}; rollback;")
    m.append(f"begin; {role('authenticated',B)} select 'B_SELECT|{t}|' || count(*) from {T}; rollback;")
    m.append(f"begin; {role('authenticated',A)} select 'A_SELECT|{t}|' || count(*) from {T}; rollback;")
    m.append(f"begin; {role('authenticated',B)} with u as (update {T} set {c} = {c} returning 1) select 'B_UPDATE|{t}|' || count(*) from u; rollback;")
    m.append(f"begin; {role('authenticated',B)} with d as (delete from {T} returning 1) select 'B_DELETE|{t}|' || count(*) from d; rollback;")
open(f"{S}/mesures.sql","w").write("\n".join(m))
print("ok", len(tables), "tables,", len(pol), "policies")
