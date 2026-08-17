-- ═════════════════════════════════════════════════════════════════════════
-- SCHÉMA RÉEL DE LA PRODUCTION — photographie du 2026-08-17
--
-- Généré par `node scripts/schema-baseline.js`. NE PAS ÉDITER À LA MAIN :
-- ce fichier décrit ce qui EST, pas ce qu'on voudrait. Pour voir ce qui a
-- changé depuis la dernière photographie : régénérer, puis `git diff`.
--
-- Il ne contient AUCUNE donnée — structure et règles d'accès uniquement.
-- ═════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════
-- TABLES ET COLONNES (schéma public)
-- ═════════════════════════════════════════════════════════════════════════
-- analytics_events
--   id                           uuid NOT NULL default gen_random_uuid()
--   user_id                      text NOT NULL
--   event                        text NOT NULL
--   properties                   jsonb default '{}'::jsonb
--   created_at                   timestamp with time zone NOT NULL default now()
-- blocks
--   blocker_id                   text NOT NULL
--   blocked_id                   text NOT NULL
--   created_at                   timestamp with time zone default now()
-- cdv_live_collaborators
--   live_id                      text NOT NULL
--   user_id                      text NOT NULL
--   added_by                     text NOT NULL
--   created_at                   timestamp with time zone default now()
-- cdv_live_comments
--   id                           text NOT NULL
--   live_id                      text NOT NULL
--   author_id                    text NOT NULL
--   author_name                  text
--   text                         text
--   created_at                   timestamp with time zone default now()
-- cdv_live_followers
--   live_id                      text NOT NULL
--   user_id                      text NOT NULL
--   created_at                   timestamp with time zone default now()
-- cdv_live_reactions
--   id                           text NOT NULL
--   live_id                      text NOT NULL
--   user_id                      text NOT NULL
--   emoji                        text
--   created_at                   timestamp with time zone default now()
-- cdv_live_steps
--   id                           text NOT NULL
--   live_id                      text NOT NULL
--   author_id                    text NOT NULL
--   city                         text
--   emoji                        text
--   content                      text
--   photos                       jsonb default '[]'::jsonb
--   rating                       integer default 0
--   budget                       text
--   created_at                   timestamp with time zone default now()
--   lat                          double precision
--   lng                          double precision
--   video                        text
-- cdv_lives
--   id                           text NOT NULL
--   author_id                    text NOT NULL
--   destination                  text
--   description                  text
--   duration                     text
--   visibility                   text default 'public'::text
--   status                       text default 'live'::text
--   created_at                   timestamp with time zone default now()
--   updated_at                   timestamp with time zone default now()
-- client_errors
--   id                           bigint NOT NULL
--   message                      text
--   source                       text
--   line                         integer
--   stack                        text
--   url                          text
--   ua                           text
--   uid                          text
--   created_at                   timestamp with time zone default now()
-- client_errors_par_heure
--   heure                        timestamp with time zone
--   erreurs                      bigint
-- client_errors_top_24h
--   message                      text
--   occurrences                  bigint
--   utilisateurs                 bigint
--   derniere_occurrence          timestamp with time zone
-- comment_interactions
--   id                           text NOT NULL
--   comment_id                   text NOT NULL
--   post_id                      text
--   user_id                      text NOT NULL
--   kind                         text NOT NULL
--   payload                      text
--   created_at                   timestamp with time zone NOT NULL default now()
-- comment_likes
--   comment_id                   text NOT NULL
--   user_id                      text NOT NULL
--   created_at                   timestamp with time zone default now()
-- conv_members
--   conv_id                      text NOT NULL
--   user_id                      text NOT NULL
-- conv_messages
--   id                           text NOT NULL
--   conv_id                      text
--   from_id                      text
--   content                      text
--   created_at                   timestamp without time zone default now()
-- conv_reads
--   conv_id                      text NOT NULL
--   user_id                      text NOT NULL
--   last_read_at                 timestamp with time zone NOT NULL default now()
-- conversations
--   id                           text NOT NULL
--   is_group                     boolean default false
--   group_name                   text
--   passion_id                   text
--   created_by                   text
--   created_at                   timestamp without time zone default now()
--   description                  text
-- event_attendees
--   event_id                     text NOT NULL
--   user_id                      text NOT NULL
--   created_at                   timestamp with time zone default now()
--   rsvp                         text NOT NULL default 'going'::text
--   checked_in_at                timestamp without time zone
--   rating                       smallint
--   feedback                     text
--   rated_at                     timestamp with time zone
-- event_comments
--   id                           text NOT NULL
--   event_id                     text NOT NULL
--   author_id                    text NOT NULL
--   author_name                  text
--   text                         text
--   created_at                   timestamp with time zone default now()
-- event_reactions
--   event_id                     text NOT NULL
--   user_id                      text NOT NULL
--   emoji                        text NOT NULL
--   created_at                   timestamp with time zone NOT NULL default now()
-- events
--   id                           text NOT NULL
--   author_id                    text
--   title                        text
--   passion_id                   text
--   lat                          double precision
--   lng                          double precision
--   city                         text
--   description                  text
--   emoji                        text default '📍'::text
--   max_attendees                integer
--   date_at                      timestamp without time zone
--   created_at                   timestamp without time zone default now()
--   venue                        text
--   address                      text
--   postal_code                  text
--   price                        double precision default 0
--   contact                      text
--   external_link                text
--   event_type                   text default 'Autre'::text
--   cover_url                    text
--   organizer_id                 text
--   end_at                       timestamp without time zone
--   status                       text NOT NULL default 'active'::text
--   updated_at                   timestamp without time zone
--   co_organizers                jsonb NOT NULL default '[]'::jsonb
--   series_id                    text
--   recurrence                   text NOT NULL default 'none'::text
--   conv_id                      text
-- follows
--   follower_id                  text NOT NULL
--   following_id                 text NOT NULL
-- notifications
--   id                           text NOT NULL
--   user_id                      text
--   kind                         text
--   from_id                      text
--   ref_id                       text
--   content                      text
--   seen                         boolean default false
--   created_at                   timestamp without time zone default now()
-- passions
--   id                           text NOT NULL
--   emoji                        text NOT NULL
--   label                        text NOT NULL
--   color                        text
--   sort_order                   integer NOT NULL default 0
-- post_collaborators
--   post_id                      text NOT NULL
--   user_id                      text NOT NULL
--   added_by                     text NOT NULL
--   created_at                   timestamp with time zone default now()
-- post_comments
--   id                           text NOT NULL
--   post_id                      text
--   author_id                    text
--   content                      text
--   created_at                   timestamp without time zone default now()
-- post_likes
--   post_id                      text NOT NULL
--   user_id                      text NOT NULL
-- posts
--   id                           text NOT NULL
--   author_id                    text
--   passion_id                   text
--   mood                         text
--   content                      text
--   media_url                    text
--   likes                        integer default 0
--   created_at                   timestamp without time zone default now()
--   shared_from_post_id          text
--   shared_data                  text
--   is_reel                      boolean default false
--   overlays                     jsonb
--   vlog                         jsonb
--   event_id                     text
-- profiles
--   id                           text NOT NULL
--   username                     text NOT NULL
--   emoji                        text default '✨'::text
--   color                        text default '#8b5cf6'::text
--   passion_id                   text
--   bio                          text
--   created_at                   timestamp without time zone default now()
--   avatar_url                   text
--   cover_url                    text
--   passions                     jsonb default '[]'::jsonb
--   is_private                   boolean NOT NULL default false
--   rs_links                     jsonb
-- push_subscriptions
--   endpoint                     text NOT NULL
--   user_id                      text NOT NULL
--   subscription                 jsonb NOT NULL
--   created_at                   timestamp with time zone default now()
-- reports
--   id                           text NOT NULL
--   reporter_id                  text
--   target_type                  text
--   target_id                    text
--   reason                       text
--   created_at                   timestamp with time zone default now()
-- step_interactions
--   id                           text NOT NULL
--   thread_id                    text NOT NULL
--   user_id                      text NOT NULL
--   kind                         text NOT NULL
--   content                      text
--   author_name                  text
--   author_emoji                 text
--   created_at                   timestamp with time zone NOT NULL default now()
-- stories
--   id                           text NOT NULL
--   author_id                    text
--   passion_id                   text
--   content                      text
--   emoji                        text default '✨'::text
--   created_at                   timestamp without time zone default now()
--   media_url                    text
--   media_type                   text
--   overlays                     jsonb
-- story_views
--   story_id                     text NOT NULL
--   user_id                      text NOT NULL
--   seen_at                      timestamp with time zone NOT NULL default now()
-- telemetry_events
--   id                           uuid NOT NULL default gen_random_uuid()
--   event_id                     text
--   received_at                  timestamp with time zone NOT NULL default now()
--   client_ts                    timestamp with time zone
--   env                          text NOT NULL default 'production'::text
--   type                         text NOT NULL
--   action                       text
--   screen                       text
--   status                       text
--   severity                     text NOT NULL default 'info'::text
--   duration_ms                  integer
--   user_id                      text
--   user_label                   text
--   session_id                   text
--   device_id                    text
--   platform                     text
--   browser                      text
--   app_version                  text
--   screen_size                  text
--   connection                   text
--   endpoint                     text
--   http_status                  integer
--   correlation_id               text
--   message                      text
--   stack                        text
--   meta                         jsonb NOT NULL default '{}'::jsonb
-- telemetry_last24h
--   type                         text
--   severity                     text
--   n                            bigint
--   last_seen                    timestamp with time zone
-- user_state
--   user_id                      text NOT NULL
--   data                         jsonb NOT NULL default '{}'::jsonb
--   updated_at                   timestamp with time zone NOT NULL default now()
-- video_lives
--   id                           text NOT NULL
--   author_id                    text NOT NULL
--   author_name                  text
--   author_emoji                 text
--   author_photo                 text
--   title                        text
--   status                       text NOT NULL default 'live'::text
--   started_at                   timestamp with time zone NOT NULL default now()
--   last_seen                    timestamp with time zone NOT NULL default now()
--   ended_at                     timestamp with time zone

-- ═════════════════════════════════════════════════════════════════════════
-- CLÉS PRIMAIRES, ÉTRANGÈRES ET UNIQUES
-- ═════════════════════════════════════════════════════════════════════════
--   analytics_events.analytics_events_pkey : PRIMARY KEY (id)
--   blocks.blocks_pkey : PRIMARY KEY (blocker_id, blocked_id)
--   cdv_live_collaborators.cdv_live_collaborators_pkey : PRIMARY KEY (live_id, user_id)
--   cdv_live_comments.cdv_live_comments_pkey : PRIMARY KEY (id)
--   cdv_live_comments.fk_cdv_comments_live : FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE
--   cdv_live_followers.cdv_live_followers_pkey : PRIMARY KEY (live_id, user_id)
--   cdv_live_followers.fk_cdv_followers_live : FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE
--   cdv_live_reactions.cdv_live_reactions_pkey : PRIMARY KEY (id)
--   cdv_live_reactions.fk_cdv_reactions_live : FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE
--   cdv_live_steps.cdv_live_steps_pkey : PRIMARY KEY (id)
--   cdv_live_steps.fk_cdv_steps_live : FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE
--   cdv_lives.cdv_lives_pkey : PRIMARY KEY (id)
--   client_errors.client_errors_pkey : PRIMARY KEY (id)
--   comment_interactions.comment_interactions_pkey : PRIMARY KEY (id)
--   comment_likes.comment_likes_pkey : PRIMARY KEY (comment_id, user_id)
--   conv_members.conv_members_conv_id_fkey : FOREIGN KEY (conv_id) REFERENCES conversations(id)
--   conv_members.conv_members_pkey : PRIMARY KEY (conv_id, user_id)
--   conv_members.conv_members_user_id_fkey : FOREIGN KEY (user_id) REFERENCES profiles(id)
--   conv_messages.conv_messages_conv_id_fkey : FOREIGN KEY (conv_id) REFERENCES conversations(id)
--   conv_messages.conv_messages_from_id_fkey : FOREIGN KEY (from_id) REFERENCES profiles(id)
--   conv_messages.conv_messages_pkey : PRIMARY KEY (id)
--   conv_reads.conv_reads_pkey : PRIMARY KEY (conv_id, user_id)
--   conversations.conversations_passion_fk : FOREIGN KEY (passion_id) REFERENCES passions(id)
--   conversations.conversations_pkey : PRIMARY KEY (id)
--   event_attendees.event_attendees_pkey : PRIMARY KEY (event_id, user_id)
--   event_comments.event_comments_pkey : PRIMARY KEY (id)
--   event_reactions.event_reactions_pkey : PRIMARY KEY (event_id, user_id, emoji)
--   events.events_passion_fk : FOREIGN KEY (passion_id) REFERENCES passions(id)
--   events.events_pkey : PRIMARY KEY (id)
--   follows.follows_pkey : PRIMARY KEY (follower_id, following_id)
--   notifications.notifications_pkey : PRIMARY KEY (id)
--   passions.passions_pkey : PRIMARY KEY (id)
--   post_collaborators.post_collaborators_pkey : PRIMARY KEY (post_id, user_id)
--   post_comments.post_comments_author_id_fkey : FOREIGN KEY (author_id) REFERENCES profiles(id)
--   post_comments.post_comments_pkey : PRIMARY KEY (id)
--   post_likes.post_likes_pkey : PRIMARY KEY (post_id, user_id)
--   posts.posts_author_id_fkey : FOREIGN KEY (author_id) REFERENCES profiles(id)
--   posts.posts_passion_fk : FOREIGN KEY (passion_id) REFERENCES passions(id)
--   posts.posts_pkey : PRIMARY KEY (id)
--   profiles.profiles_passion_fk : FOREIGN KEY (passion_id) REFERENCES passions(id)
--   profiles.profiles_pkey : PRIMARY KEY (id)
--   push_subscriptions.push_subscriptions_pkey : PRIMARY KEY (endpoint)
--   reports.reports_pkey : PRIMARY KEY (id)
--   step_interactions.step_interactions_pkey : PRIMARY KEY (id)
--   stories.stories_author_id_fkey : FOREIGN KEY (author_id) REFERENCES profiles(id)
--   stories.stories_passion_fk : FOREIGN KEY (passion_id) REFERENCES passions(id)
--   stories.stories_pkey : PRIMARY KEY (id)
--   story_views.story_views_pkey : PRIMARY KEY (story_id, user_id)
--   telemetry_events.telemetry_events_pkey : PRIMARY KEY (id)
--   user_state.user_state_pkey : PRIMARY KEY (user_id)
--   video_lives.video_lives_pkey : PRIMARY KEY (id)

-- ═════════════════════════════════════════════════════════════════════════
-- INDEX
-- ═════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX analytics_events_pkey ON public.analytics_events USING btree (id);
CREATE INDEX idx_analytics_created_at ON public.analytics_events USING btree (created_at DESC);
CREATE INDEX idx_analytics_event ON public.analytics_events USING btree (event);
CREATE INDEX idx_analytics_user_id ON public.analytics_events USING btree (user_id);
CREATE UNIQUE INDEX blocks_pkey ON public.blocks USING btree (blocker_id, blocked_id);
CREATE UNIQUE INDEX cdv_live_collaborators_pkey ON public.cdv_live_collaborators USING btree (live_id, user_id);
CREATE INDEX idx_cdv_collab_live ON public.cdv_live_collaborators USING btree (live_id);
CREATE INDEX idx_cdv_collab_user ON public.cdv_live_collaborators USING btree (user_id);
CREATE UNIQUE INDEX cdv_live_comments_pkey ON public.cdv_live_comments USING btree (id);
CREATE INDEX idx_cdv_comments_live ON public.cdv_live_comments USING btree (live_id);
CREATE INDEX idx_cdv_live_comments_author ON public.cdv_live_comments USING btree (author_id);
CREATE UNIQUE INDEX cdv_live_followers_pkey ON public.cdv_live_followers USING btree (live_id, user_id);
CREATE UNIQUE INDEX cdv_live_reactions_pkey ON public.cdv_live_reactions USING btree (id);
CREATE INDEX idx_cdv_reactions_live ON public.cdv_live_reactions USING btree (live_id);
CREATE UNIQUE INDEX cdv_live_steps_pkey ON public.cdv_live_steps USING btree (id);
CREATE INDEX idx_cdv_steps_live ON public.cdv_live_steps USING btree (live_id);
CREATE UNIQUE INDEX cdv_lives_pkey ON public.cdv_lives USING btree (id);
CREATE INDEX idx_cdv_lives_status ON public.cdv_lives USING btree (status);
CREATE UNIQUE INDEX client_errors_pkey ON public.client_errors USING btree (id);
CREATE INDEX idx_client_errors_created ON public.client_errors USING btree (created_at DESC);
CREATE UNIQUE INDEX comment_interactions_pkey ON public.comment_interactions USING btree (id);
CREATE INDEX idx_ci_comment ON public.comment_interactions USING btree (comment_id);
CREATE INDEX idx_ci_user_created ON public.comment_interactions USING btree (user_id, created_at);
CREATE UNIQUE INDEX comment_likes_pkey ON public.comment_likes USING btree (comment_id, user_id);
CREATE INDEX idx_comment_likes_comment ON public.comment_likes USING btree (comment_id);
CREATE UNIQUE INDEX conv_members_pkey ON public.conv_members USING btree (conv_id, user_id);
CREATE INDEX idx_conv_members_user ON public.conv_members USING btree (user_id);
CREATE UNIQUE INDEX conv_messages_pkey ON public.conv_messages USING btree (id);
CREATE INDEX idx_conv_messages_conv ON public.conv_messages USING btree (conv_id, created_at DESC);
CREATE INDEX idx_conv_messages_from ON public.conv_messages USING btree (from_id);
CREATE UNIQUE INDEX conv_reads_pkey ON public.conv_reads USING btree (conv_id, user_id);
CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id);
CREATE INDEX idx_conversations_passion ON public.conversations USING btree (passion_id);
CREATE UNIQUE INDEX event_attendees_pkey ON public.event_attendees USING btree (event_id, user_id);
CREATE INDEX idx_event_attendees_user ON public.event_attendees USING btree (user_id);
CREATE INDEX idx_event_attendees_waitlist ON public.event_attendees USING btree (event_id, rsvp, created_at);
CREATE UNIQUE INDEX event_comments_pkey ON public.event_comments USING btree (id);
CREATE INDEX idx_event_comments_author ON public.event_comments USING btree (author_id);
CREATE INDEX idx_event_comments_event ON public.event_comments USING btree (event_id);
CREATE UNIQUE INDEX event_reactions_pkey ON public.event_reactions USING btree (event_id, user_id, emoji);
CREATE INDEX idx_evr_user_created ON public.event_reactions USING btree (user_id, created_at);
CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id);
CREATE INDEX idx_events_created ON public.events USING btree (created_at DESC);
CREATE INDEX idx_events_end_at ON public.events USING btree (end_at DESC);
CREATE INDEX idx_events_passion ON public.events USING btree (passion_id);
CREATE INDEX idx_events_series ON public.events USING btree (series_id);
CREATE UNIQUE INDEX follows_pkey ON public.follows USING btree (follower_id, following_id);
CREATE INDEX idx_follows_following ON public.follows USING btree (following_id);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);
CREATE UNIQUE INDEX passions_pkey ON public.passions USING btree (id);
CREATE INDEX idx_post_collab_post ON public.post_collaborators USING btree (post_id);
CREATE INDEX idx_post_collab_user ON public.post_collaborators USING btree (user_id);
CREATE UNIQUE INDEX post_collaborators_pkey ON public.post_collaborators USING btree (post_id, user_id);
CREATE INDEX idx_comments_post ON public.post_comments USING btree (post_id, created_at DESC);
CREATE INDEX idx_post_comments_author ON public.post_comments USING btree (author_id);
CREATE UNIQUE INDEX post_comments_pkey ON public.post_comments USING btree (id);
CREATE INDEX idx_likes_post ON public.post_likes USING btree (post_id);
CREATE UNIQUE INDEX post_likes_pkey ON public.post_likes USING btree (post_id, user_id);
CREATE INDEX idx_posts_author ON public.posts USING btree (author_id);
CREATE INDEX idx_posts_created_at ON public.posts USING btree (created_at DESC);
CREATE INDEX idx_posts_event ON public.posts USING btree (event_id) WHERE (event_id IS NOT NULL);
CREATE INDEX idx_posts_passion ON public.posts USING btree (passion_id);
CREATE UNIQUE INDEX posts_pkey ON public.posts USING btree (id);
CREATE INDEX idx_profiles_passion ON public.profiles USING btree (passion_id);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE INDEX idx_push_subs_user ON public.push_subscriptions USING btree (user_id);
CREATE UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (endpoint);
CREATE INDEX idx_rep_user_created ON public.reports USING btree (reporter_id, created_at);
CREATE UNIQUE INDEX reports_pkey ON public.reports USING btree (id);
CREATE INDEX idx_si_thread ON public.step_interactions USING btree (thread_id);
CREATE INDEX idx_step_interactions_user ON public.step_interactions USING btree (user_id);
CREATE UNIQUE INDEX step_interactions_pkey ON public.step_interactions USING btree (id);
CREATE INDEX idx_stories_author ON public.stories USING btree (author_id);
CREATE INDEX idx_stories_created ON public.stories USING btree (created_at DESC);
CREATE INDEX idx_stories_passion ON public.stories USING btree (passion_id);
CREATE UNIQUE INDEX stories_pkey ON public.stories USING btree (id);
CREATE UNIQUE INDEX story_views_pkey ON public.story_views USING btree (story_id, user_id);
CREATE INDEX story_views_user_idx ON public.story_views USING btree (user_id);
CREATE INDEX idx_tel_correlation ON public.telemetry_events USING btree (correlation_id);
CREATE INDEX idx_tel_device ON public.telemetry_events USING btree (device_id);
CREATE INDEX idx_tel_received_at ON public.telemetry_events USING btree (received_at DESC);
CREATE INDEX idx_tel_session ON public.telemetry_events USING btree (session_id);
CREATE INDEX idx_tel_severity ON public.telemetry_events USING btree (severity);
CREATE INDEX idx_tel_type ON public.telemetry_events USING btree (type);
CREATE INDEX idx_tel_user ON public.telemetry_events USING btree (user_id);
CREATE UNIQUE INDEX telemetry_events_pkey ON public.telemetry_events USING btree (id);
CREATE UNIQUE INDEX user_state_pkey ON public.user_state USING btree (user_id);
CREATE INDEX idx_video_lives_active ON public.video_lives USING btree (status, last_seen DESC);
CREATE INDEX idx_video_lives_author ON public.video_lives USING btree (author_id);
CREATE UNIQUE INDEX video_lives_pkey ON public.video_lives USING btree (id);

-- ═════════════════════════════════════════════════════════════════════════
-- POLICIES RLS (public ET storage) — la frontière de confiance
-- ═════════════════════════════════════════════════════════════════════════
--   [INSERT] public.analytics_events · analytics_insert_own
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [DELETE] public.blocks · blocks_delete_own
--       using  : (blocker_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.blocks · blocks_insert_own
--       using  : -
--       check  : (blocker_id = (auth.uid())::text)
--   [SELECT] public.blocks · blocks_select_own
--       using  : (blocker_id = (( SELECT auth.uid() AS uid))::text)
--       check  : -
--   [DELETE] public.cdv_live_collaborators · cdv_collab_delete
--       using  : ((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM cdv_lives l
  WHERE ((l.id = cdv_live_collaborators.live_id) AND (l.author_id = (auth.uid())::text)))))
--       check  : -
--   [INSERT] public.cdv_live_collaborators · cdv_collab_insert_owner
--       using  : -
--       check  : ((added_by = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM cdv_lives l
  WHERE ((l.id = cdv_live_collaborators.live_id) AND (l.author_id = (auth.uid())::text)))))
--   [SELECT] public.cdv_live_collaborators · cdv_collab_select
--       using  : true
--       check  : -
--   [DELETE] public.cdv_live_comments · cdv_comments_delete_own
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.cdv_live_comments · cdv_comments_insert_own
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.cdv_live_comments · cdv_comments_select
--       using  : true
--       check  : -
--   [DELETE] public.cdv_live_followers · cdv_followers_delete_own
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.cdv_live_followers · cdv_followers_insert_own
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.cdv_live_followers · cdv_followers_select
--       using  : true
--       check  : -
--   [DELETE] public.cdv_live_reactions · cdv_reactions_delete_own
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.cdv_live_reactions · cdv_reactions_insert_own
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.cdv_live_reactions · cdv_reactions_select
--       using  : true
--       check  : -
--   [DELETE] public.cdv_live_steps · cdv_steps_delete_own
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.cdv_live_steps · cdv_steps_insert_own
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.cdv_live_steps · cdv_steps_select
--       using  : true
--       check  : -
--   [UPDATE] public.cdv_live_steps · cdv_steps_update_own
--       using  : (author_id = (auth.uid())::text)
--       check  : (author_id = (auth.uid())::text)
--   [DELETE] public.cdv_lives · cdv_lives_delete_own
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.cdv_lives · cdv_lives_insert_own
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.cdv_lives · cdv_lives_select
--       using  : ((visibility <> 'private'::text) OR (author_id = (( SELECT auth.uid() AS uid))::text))
--       check  : -
--   [UPDATE] public.cdv_lives · cdv_lives_update_own
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.client_errors · Insert erreurs
--       using  : -
--       check  : true
--   [DELETE] public.comment_interactions · ci_delete
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.comment_interactions · ci_insert
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.comment_interactions · Lecture selon visibilite de la cible
--       using  : ((user_id = (( SELECT auth.uid() AS uid))::text) OR comment_target_visible(comment_id))
--       check  : -
--   [DELETE] public.comment_likes · comment_likes_delete_own
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.comment_likes · comment_likes_insert_own
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.comment_likes · comment_likes_select
--       using  : true
--       check  : -
--   [DELETE] public.conv_members · Suppression admin
--       using  : ((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conv_members.conv_id) AND (c.created_by = (auth.uid())::text)))))
--       check  : -
--   [DELETE] public.conv_members · Suppression propre
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.conv_members · Ecriture propre
--       using  : -
--       check  : ((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conv_members.conv_id) AND (c.created_by = (auth.uid())::text)))))
--   [SELECT] public.conv_members · conv_members_select_member
--       using  : is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text)
--       check  : -
--   [DELETE] public.conv_messages · Suppression propre
--       using  : (from_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.conv_messages · Ecriture propre
--       using  : -
--       check  : (from_id = (auth.uid())::text)
--   [SELECT] public.conv_messages · conv_messages_select_member
--       using  : is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text)
--       check  : -
--   [UPDATE] public.conv_messages · Update propre
--       using  : (from_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.conv_reads · reads_upsert
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.conv_reads · reads_select
--       using  : true
--       check  : -
--   [UPDATE] public.conv_reads · reads_update
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.conversations · Ecriture propre
--       using  : -
--       check  : true
--   [INSERT] public.conversations · Insert conversations
--       using  : -
--       check  : true
--   [SELECT] public.conversations · conversations_select_member
--       using  : is_conv_member(id, (( SELECT auth.uid() AS uid))::text)
--       check  : -
--   [DELETE] public.event_attendees · Suppression propre
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.event_attendees · Ecriture propre
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.event_attendees · Lecture publique
--       using  : true
--       check  : -
--   [UPDATE] public.event_attendees · Maj de sa propre participation
--       using  : (user_id = (auth.uid())::text)
--       check  : (user_id = (auth.uid())::text)
--   [DELETE] public.event_comments · event_comments_delete_own
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.event_comments · event_comments_insert_own
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.event_comments · event_comments_select
--       using  : true
--       check  : -
--   [DELETE] public.event_reactions · event_reactions_delete
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.event_reactions · event_reactions_insert
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.event_reactions · event_reactions_select
--       using  : true
--       check  : -
--   [DELETE] public.events · Suppression propre
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.events · Ecriture propre
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.events · Lecture publique
--       using  : true
--       check  : -
--   [SELECT] public.events · Read events
--       using  : true
--       check  : -
--   [UPDATE] public.events · Update organisateurs
--       using  : ((author_id = (auth.uid())::text) OR jsonb_exists(co_organizers, (auth.uid())::text))
--       check  : -
--   [DELETE] public.follows · Suppression cote suivi
--       using  : (following_id = (auth.uid())::text)
--       check  : -
--   [DELETE] public.follows · Suppression propre
--       using  : (follower_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.follows · Ecriture propre
--       using  : -
--       check  : (follower_id = (auth.uid())::text)
--   [SELECT] public.follows · Lecture publique
--       using  : true
--       check  : -
--   [SELECT] public.follows · Read follows
--       using  : true
--       check  : -
--   [DELETE] public.notifications · Suppression propre
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.notifications · notifications_insert_own_author
--       using  : -
--       check  : (from_id = (( SELECT auth.uid() AS uid))::text)
--   [SELECT] public.notifications · Lecture propre
--       using  : (user_id = (( SELECT auth.uid() AS uid))::text)
--       check  : -
--   [UPDATE] public.notifications · Update propre
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [SELECT] public.passions · passions_select_all
--       using  : true
--       check  : -
--   [DELETE] public.post_collaborators · post_collab_delete
--       using  : ((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_collaborators.post_id) AND (p.author_id = (auth.uid())::text)))))
--       check  : -
--   [INSERT] public.post_collaborators · post_collab_insert_owner
--       using  : -
--       check  : ((added_by = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_collaborators.post_id) AND (p.author_id = (auth.uid())::text)))))
--   [SELECT] public.post_collaborators · post_collab_select
--       using  : true
--       check  : -
--   [DELETE] public.post_comments · Suppression propre
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.post_comments · Ecriture propre
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.post_comments · Lecture selon visibilite du post
--       using  : ((author_id = (( SELECT auth.uid() AS uid))::text) OR post_is_visible(post_id))
--       check  : -
--   [UPDATE] public.post_comments · Update propre
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [DELETE] public.post_likes · Suppression propre
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.post_likes · Ecriture propre
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.post_likes · Lecture selon visibilite du post
--       using  : ((user_id = (( SELECT auth.uid() AS uid))::text) OR post_is_visible(post_id))
--       check  : -
--   [DELETE] public.posts · Suppression propre
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.posts · Ecriture propre
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.posts · Lecture respectant les comptes prives
--       using  : ((author_id = (( SELECT auth.uid() AS uid))::text) OR (NOT (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = posts.author_id) AND (pr.is_private = true))))) OR (EXISTS ( SELECT 1
   FROM follows f
  WHERE ((f.follower_id = (( SELECT auth.uid() AS uid))::text) AND (f.following_id = posts.author_id)))))
--       check  : -
--   [UPDATE] public.posts · Update propre
--       using  : can_edit_post(id)
--       check  : can_edit_post(id)
--   [DELETE] public.profiles · Suppression propre
--       using  : (id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.profiles · Upsert propre
--       using  : -
--       check  : (id = (auth.uid())::text)
--   [SELECT] public.profiles · Lecture publique
--       using  : true
--       check  : -
--   [SELECT] public.profiles · Read profiles
--       using  : true
--       check  : -
--   [UPDATE] public.profiles · Update propre
--       using  : (id = (auth.uid())::text)
--       check  : -
--   [DELETE] public.push_subscriptions · push_delete_own
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.push_subscriptions · push_insert_own
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.push_subscriptions · push_select_own
--       using  : (user_id = (( SELECT auth.uid() AS uid))::text)
--       check  : -
--   [UPDATE] public.push_subscriptions · push_update_own
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.reports · reports_insert
--       using  : -
--       check  : (reporter_id = (auth.uid())::text)
--   [DELETE] public.step_interactions · si_delete
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.step_interactions · si_insert
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.step_interactions · si_select
--       using  : true
--       check  : -
--   [DELETE] public.stories · Suppression propre
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.stories · Ecriture propre
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.stories · Lecture stories respectant les comptes prives
--       using  : ((author_id = (( SELECT auth.uid() AS uid))::text) OR (NOT (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = stories.author_id) AND (pr.is_private = true))))) OR (EXISTS ( SELECT 1
   FROM follows f
  WHERE ((f.follower_id = (( SELECT auth.uid() AS uid))::text) AND (f.following_id = stories.author_id)))))
--       check  : -
--   [DELETE] public.story_views · story_views_delete_own
--       using  : (user_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.story_views · story_views_insert_own
--       using  : -
--       check  : (user_id = (auth.uid())::text)
--   [SELECT] public.story_views · story_views_select_own
--       using  : (user_id = (( SELECT auth.uid() AS uid))::text)
--       check  : -
--   [INSERT] public.telemetry_events · telemetry_insert_own
--       using  : -
--       check  : ((user_id IS NULL) OR (user_id = (auth.uid())::text))
--   [DELETE] public.user_state · user_state_delete_own
--       using  : ((auth.uid())::text = user_id)
--       check  : -
--   [INSERT] public.user_state · user_state_insert_own
--       using  : -
--       check  : ((auth.uid())::text = user_id)
--   [SELECT] public.user_state · user_state_select_own
--       using  : ((( SELECT auth.uid() AS uid))::text = user_id)
--       check  : -
--   [UPDATE] public.user_state · user_state_update_own
--       using  : ((auth.uid())::text = user_id)
--       check  : ((auth.uid())::text = user_id)
--   [DELETE] public.video_lives · video_lives_delete
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [INSERT] public.video_lives · video_lives_insert
--       using  : -
--       check  : (author_id = (auth.uid())::text)
--   [SELECT] public.video_lives · video_lives_select
--       using  : true
--       check  : -
--   [UPDATE] public.video_lives · video_lives_update
--       using  : (author_id = (auth.uid())::text)
--       check  : -
--   [DELETE] storage.objects · passio_media_delete
--       using  : ((bucket_id = ANY (ARRAY['content'::text, 'attachments'::text])) AND (owner = auth.uid()))
--       check  : -
--   [INSERT] storage.objects · passio_media_insert_cloisonne
--       using  : -
--       check  : storage_chemin_autorise(bucket_id, name)
--   [SELECT] storage.objects · passio_media_read
--       using  : (bucket_id = ANY (ARRAY['content'::text, 'attachments'::text]))
--       check  : -
--   [UPDATE] storage.objects · passio_media_update_cloisonne
--       using  : ((bucket_id = ANY (ARRAY['content'::text, 'attachments'::text])) AND (owner = ( SELECT auth.uid() AS uid)))
--       check  : storage_chemin_autorise(bucket_id, name)

-- ═════════════════════════════════════════════════════════════════════════
-- RLS ACTIVÉE ? — une table sans RLS est ouverte à tous
-- ═════════════════════════════════════════════════════════════════════════
--   RLS analytics_events
--   RLS blocks
--   RLS cdv_live_collaborators
--   RLS cdv_live_comments
--   RLS cdv_live_followers
--   RLS cdv_live_reactions
--   RLS cdv_live_steps
--   RLS cdv_lives
--   RLS client_errors
--   RLS comment_interactions
--   RLS comment_likes
--   RLS conv_members
--   RLS conv_messages
--   RLS conv_reads
--   RLS conversations
--   RLS event_attendees
--   RLS event_comments
--   RLS event_reactions
--   RLS events
--   RLS follows
--   RLS notifications
--   RLS passions
--   RLS post_collaborators
--   RLS post_comments
--   RLS post_likes
--   RLS posts
--   RLS profiles
--   RLS push_subscriptions
--   RLS reports
--   RLS step_interactions
--   RLS stories
--   RLS story_views
--   RLS telemetry_events
--   RLS user_state
--   RLS video_lives

-- ═════════════════════════════════════════════════════════════════════════
-- FONCTIONS (dont les SECURITY DEFINER, qui contournent la RLS)
-- ═════════════════════════════════════════════════════════════════════════
--   SECURITY DEFINER broadcast_conv_message_to_users()
--   SECURITY DEFINER can_edit_post(pid text)
--   SECURITY DEFINER comment_target_visible(cid text)
--   SECURITY DEFINER identite_affichage_canonique()
--   SECURITY DEFINER is_conv_member(_conv_id text, _uid text)
--   SECURITY DEFINER post_is_visible(pid text)
--   posts_freeze_author()
--   SECURITY DEFINER propager_identite_affichage()
--   SECURITY DEFINER purge_telemetry(keep_days integer)
--   SECURITY DEFINER rate_limit_insert()
--   storage_chemin_autorise(_bucket text, _name text)
--   user_state_horodatage_serveur()

-- ═════════════════════════════════════════════════════════════════════════
-- DÉCLENCHEURS
-- ═════════════════════════════════════════════════════════════════════════
--   cdv_live_comments → trg_identite_affichage
--   comment_interactions → trg_rate_limit
--   conv_messages → broadcast_conv_message_users_trigger
--   cron.job → cron_job_cache_invalidate
--   event_comments → trg_identite_affichage
--   event_reactions → trg_rate_limit
--   posts → trg_posts_freeze_author
--   profiles → trg_propager_identite
--   realtime.subscription → tr_check_filters
--   reports → trg_rate_limit
--   step_interactions → trg_identite_affichage
--   storage.buckets → enforce_bucket_name_length_trigger
--   storage.buckets → protect_buckets_delete
--   storage.objects → protect_objects_delete
--   storage.objects → update_objects_updated_at
--   user_state → trg_user_state_horodatage
--   video_lives → trg_identite_affichage

-- ═════════════════════════════════════════════════════════════════════════
-- PUBLICATION REALTIME — ce qui est diffusé en direct
-- ═════════════════════════════════════════════════════════════════════════
--   supabase_realtime : public.cdv_live_collaborators
--   supabase_realtime : public.cdv_live_comments
--   supabase_realtime : public.cdv_live_followers
--   supabase_realtime : public.cdv_live_reactions
--   supabase_realtime : public.cdv_live_steps
--   supabase_realtime : public.cdv_lives
--   supabase_realtime : public.comment_interactions
--   supabase_realtime : public.comment_likes
--   supabase_realtime : public.conv_members
--   supabase_realtime : public.conv_messages
--   supabase_realtime : public.conv_reads
--   supabase_realtime : public.conversations
--   supabase_realtime : public.event_comments
--   supabase_realtime : public.event_reactions
--   supabase_realtime : public.events
--   supabase_realtime : public.notifications
--   supabase_realtime : public.post_collaborators
--   supabase_realtime : public.post_comments
--   supabase_realtime : public.post_likes
--   supabase_realtime : public.posts
--   supabase_realtime : public.profiles
--   supabase_realtime : public.step_interactions
--   supabase_realtime : public.stories
--   supabase_realtime : public.telemetry_events
--   supabase_realtime : public.video_lives
--   supabase_realtime_messages_publication : realtime.messages_2026_08_14
--   supabase_realtime_messages_publication : realtime.messages_2026_08_15
--   supabase_realtime_messages_publication : realtime.messages_2026_08_16
--   supabase_realtime_messages_publication : realtime.messages_2026_08_17
--   supabase_realtime_messages_publication : realtime.messages_2026_08_18
--   supabase_realtime_messages_publication : realtime.messages_2026_08_19
--   supabase_realtime_messages_publication : realtime.messages_2026_08_20

-- ═════════════════════════════════════════════════════════════════════════
-- SEAUX DE STOCKAGE
-- ═════════════════════════════════════════════════════════════════════════
--   attachments · PUBLIC · taille max 52428800 o · types (aucune liste)
--   content · PUBLIC · taille max 52428800 o · types (aucune liste)
