--
-- PostgreSQL database dump
--

\restrict BQeCr5RSJzbY4WfXGUgbwiYSvnNrRomlzBqXQp55i8YfKV3NCZzTEEJdScQWfFm

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- 注意：pg_dump 生成的 `CREATE SCHEMA public;` 已手工移除 —— 新数据库默认已有
-- public schema，保留它会让 `psql -f db/schema.sql` 在第一步就报 already exists。


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: engagement_apply(text, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_apply(p_mod_id text, p_action text, p_device_id text, p_day date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_liked           boolean;
  v_favorited       boolean;
  v_last_view_day   date;
  v_last_download_day date;
  v_delta_likes     integer := 0;
  v_delta_favorites integer := 0;
  v_delta_views     integer := 0;
  v_delta_downloads integer := 0;
  v_total_likes     bigint;
  v_total_favorites bigint;
  v_total_views     bigint;
  v_total_downloads bigint;
begin
  if p_device_id is null or length(p_device_id) = 0 then
    raise exception 'device_id required' using errcode = '22023';
  end if;

  -- 行不存在时先插入，保证下面的 SELECT ... FOR UPDATE 一定能锁住一行；
  -- 并发首次写入时，晚到的一方会卡在这里等锁，不会两条 INSERT 都成功。
  insert into public.engagement_devices (mod_id, device_id)
  values (p_mod_id, p_device_id)
  on conflict (mod_id, device_id) do nothing;

  select liked, favorited, last_view_day, last_download_day
    into v_liked, v_favorited, v_last_view_day, v_last_download_day
    from public.engagement_devices
   where mod_id = p_mod_id and device_id = p_device_id
   for update;

  if p_action = 'like' then
    if v_liked then
      v_liked := false;
      v_delta_likes := -1;
    else
      v_liked := true;
      v_delta_likes := 1;
    end if;

  elsif p_action = 'unlike' then
    if v_liked then
      v_liked := false;
      v_delta_likes := -1;
    end if;

  elsif p_action = 'favorite' then
    if v_favorited then
      v_favorited := false;
      v_delta_favorites := -1;
    else
      v_favorited := true;
      v_delta_favorites := 1;
    end if;

  elsif p_action = 'unfavorite' then
    if v_favorited then
      v_favorited := false;
      v_delta_favorites := -1;
    end if;

  elsif p_action = 'view' then
    -- 「今天看过」才计数；设备行的 last_view_day 就是去重键
    if v_last_view_day is distinct from p_day then
      v_delta_views := 1;
    end if;

  elsif p_action = 'download' then
    -- 与浏览同一套规则：同一设备同一天只算一次（2026-10-22 用户要求）。
    -- 连点多下、夸克迅雷各点一次，当天都只 +1；隔天再下载算新的一次。
    -- 不去重的话一个人一分钟就能刷出几十次下载，下载量就失去意义了。
    if v_last_download_day is distinct from p_day then
      v_delta_downloads := 1;
    end if;
  end if;

  update public.engagement_devices
     set liked         = v_liked,
         favorited     = v_favorited,
         favorited_at  = case
                           when v_favorited then coalesce(favorited_at, now())
                           else null
                         end,
         last_view_day = case
                           when p_action = 'view' then p_day
                           else last_view_day
                         end,
         last_download_day = case
                           when p_action = 'download' then p_day
                           else last_download_day
                         end,
         updated_at    = now()
   where mod_id = p_mod_id and device_id = p_device_id;

  insert into public.engagement_totals (mod_id, likes, favorites, views, downloads)
  values (
    p_mod_id,
    greatest(v_delta_likes, 0),
    greatest(v_delta_favorites, 0),
    v_delta_views,
    v_delta_downloads
  )
  on conflict (mod_id) do update
     set likes      = greatest(0, public.engagement_totals.likes + v_delta_likes),
         favorites  = greatest(0, public.engagement_totals.favorites + v_delta_favorites),
         views      = public.engagement_totals.views + v_delta_views,
         downloads  = public.engagement_totals.downloads + v_delta_downloads,
         updated_at = now();

  select likes, favorites, views, downloads
    into v_total_likes, v_total_favorites, v_total_views, v_total_downloads
    from public.engagement_totals
   where mod_id = p_mod_id;

  return jsonb_build_object(
    'likes',     coalesce(v_total_likes, 0),
    'favorites', coalesce(v_total_favorites, 0),
    'views',     coalesce(v_total_views, 0),
    'downloads', coalesce(v_total_downloads, 0),
    'liked',     v_liked,
    'favorited', v_favorited
  );
end;
$$;


--
-- Name: engagement_read(text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_read(p_ids text[], p_device_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  return jsonb_build_object(
    'counts', coalesce(
      (
        select jsonb_object_agg(
                 mod_id,
                 jsonb_build_object('likes', likes, 'favorites', favorites, 'views', views, 'downloads', downloads)
               )
          from public.engagement_totals
         where mod_id = any (p_ids)
      ),
      '{}'::jsonb
    ),
    'mine', coalesce(
      (
        select jsonb_object_agg(
                 mod_id,
                 jsonb_build_object('liked', liked, 'favorited', favorited)
               )
          from public.engagement_devices
         where device_id = p_device_id
           and mod_id = any (p_ids)
           -- 没赞也没收藏的设备行不返回，payload 能小一个数量级
           and (liked or favorited)
      ),
      '{}'::jsonb
    )
  );
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: comment_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    value smallint NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT comment_reactions_value_check CHECK ((value = ANY (ARRAY['-1'::integer, 1])))
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mod_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    parent_id uuid,
    is_pinned boolean DEFAULT false NOT NULL,
    CONSTRAINT comments_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 1000)))
);


--
-- Name: engagement_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_devices (
    mod_id text NOT NULL,
    device_id text NOT NULL,
    liked boolean DEFAULT false NOT NULL,
    favorited boolean DEFAULT false NOT NULL,
    favorited_at timestamp with time zone,
    last_view_day date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_download_day date
);


--
-- Name: engagement_totals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_totals (
    mod_id text NOT NULL,
    views bigint DEFAULT 0 NOT NULL,
    likes bigint DEFAULT 0 NOT NULL,
    favorites bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    downloads bigint DEFAULT 0 NOT NULL,
    CONSTRAINT engagement_totals_non_negative CHECK (((views >= 0) AND (likes >= 0) AND (favorites >= 0)))
);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mod_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: gamebanana_mods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamebanana_mods (
    gb_id integer NOT NULL,
    title text NOT NULL,
    "character" text NOT NULL,
    gb_root_category text,
    gb_subcategory text,
    description text,
    images text[] DEFAULT '{}'::text[] NOT NULL,
    cover_url text,
    download_url text NOT NULL,
    author_name text,
    author_url text,
    version text,
    visibility text DEFAULT 'show'::text NOT NULL,
    like_count integer DEFAULT 0 NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    download_count integer DEFAULT 0 NOT NULL,
    file_size bigint,
    av_status text,
    gb_created_at timestamp with time zone,
    gb_updated_at timestamp with time zone,
    synced_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT gamebanana_mods_visibility_check CHECK ((visibility = ANY (ARRAY['show'::text, 'warn'::text, 'hide'::text])))
);


--
-- Name: likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mod_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: mods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    "character" text NOT NULL,
    version text NOT NULL,
    game_version text NOT NULL,
    description text NOT NULL,
    images text[] DEFAULT '{}'::text[] NOT NULL,
    video_url text,
    download_url text,
    nsfw boolean DEFAULT false NOT NULL,
    mod_author_url text,
    xxmi_install_guide text NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    favorites_count integer DEFAULT 0 NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    comments_count integer DEFAULT 0 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    rating_count integer DEFAULT 0 NOT NULL,
    rating_average numeric(3,2) DEFAULT 0 NOT NULL,
    downloads_count integer DEFAULT 0 NOT NULL,
    game_key text DEFAULT 'wuthering-waves'::text NOT NULL,
    drive_links jsonb DEFAULT '[]'::jsonb,
    variant_images jsonb DEFAULT '{}'::jsonb,
    is_featured boolean DEFAULT false,
    featured_order integer,
    cover_width integer,
    cover_height integer,
    cover_source text
);


--
-- Name: COLUMN mods.cover_width; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mods.cover_width IS '封面图（images[0]）原始宽度，像素；瀑布流首帧排版用';


--
-- Name: COLUMN mods.cover_height; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mods.cover_height IS '封面图（images[0]）原始高度，像素';


--
-- Name: COLUMN mods.cover_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mods.cover_source IS '上面两个尺寸对应的封面 URL；与 images[1] 不一致即待重算';


--
-- Name: mod_character_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.mod_character_counts WITH (security_invoker='true') AS
 SELECT "character",
    (count(*))::integer AS mod_count
   FROM public.mods m
  WHERE (is_published AND is_available AND ("character" IS NOT NULL) AND (btrim("character") <> ''::text))
  GROUP BY "character";


--
-- Name: mods_publish_backup_20261011; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mods_publish_backup_20261011 (
    id uuid,
    is_published boolean,
    is_available boolean
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    role text DEFAULT 'user'::text NOT NULL,
    display_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    phone text,
    bio text,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'vip'::text])))
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mod_id uuid NOT NULL,
    user_id uuid NOT NULL,
    score integer NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT ratings_score_check CHECK (((score >= 1) AND (score <= 5)))
);


--
-- Name: tutorial_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutorial_chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    chapter_key text NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    intro text,
    video_src text,
    video_poster text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT tutorial_chapters_type_check CHECK ((type = ANY (ARRAY['text'::text, 'images'::text])))
);


--
-- Name: tutorial_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutorial_configs (
    id text NOT NULL,
    title text NOT NULL,
    subtitle text NOT NULL,
    image_base_path text NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    version_id text NOT NULL,
    status text NOT NULL,
    video_src text,
    video_poster text,
    CONSTRAINT tutorial_configs_status_check CHECK ((status = ANY (ARRAY['published'::text, 'draft'::text])))
);


--
-- Name: COLUMN tutorial_configs.video_src; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tutorial_configs.video_src IS '页面级配套视频地址（整篇教程一个），与 tutorial_chapters.video_src 的章节视频不是一回事';


--
-- Name: COLUMN tutorial_configs.video_poster; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tutorial_configs.video_poster IS '页面级配套视频封面图地址';


--
-- Name: tutorial_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutorial_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    url text NOT NULL,
    filename text NOT NULL,
    alt text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: tutorial_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutorial_tools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    description text,
    required boolean DEFAULT false NOT NULL,
    cloud_baidu text,
    cloud_quark text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: tutorial_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutorial_versions (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: comment_reactions comment_reactions_comment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_comment_id_user_id_key UNIQUE (comment_id, user_id);


--
-- Name: comment_reactions comment_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: engagement_devices engagement_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_devices
    ADD CONSTRAINT engagement_devices_pkey PRIMARY KEY (mod_id, device_id);


--
-- Name: engagement_totals engagement_totals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_totals
    ADD CONSTRAINT engagement_totals_pkey PRIMARY KEY (mod_id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_user_id_mod_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_mod_id_key UNIQUE (user_id, mod_id);


--
-- Name: gamebanana_mods gamebanana_mods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamebanana_mods
    ADD CONSTRAINT gamebanana_mods_pkey PRIMARY KEY (gb_id);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (id);


--
-- Name: likes likes_user_id_mod_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_mod_id_key UNIQUE (user_id, mod_id);


--
-- Name: mods mods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mods
    ADD CONSTRAINT mods_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_phone_key UNIQUE (phone);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_user_id_mod_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_mod_id_key UNIQUE (user_id, mod_id);


--
-- Name: tutorial_chapters tutorial_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_chapters
    ADD CONSTRAINT tutorial_chapters_pkey PRIMARY KEY (id);


--
-- Name: tutorial_configs tutorial_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_configs
    ADD CONSTRAINT tutorial_configs_pkey PRIMARY KEY (id);


--
-- Name: tutorial_configs tutorial_configs_version_status_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_configs
    ADD CONSTRAINT tutorial_configs_version_status_unique UNIQUE (version_id, status);


--
-- Name: tutorial_images tutorial_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_images
    ADD CONSTRAINT tutorial_images_pkey PRIMARY KEY (id);


--
-- Name: tutorial_tools tutorial_tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_tools
    ADD CONSTRAINT tutorial_tools_pkey PRIMARY KEY (id);


--
-- Name: tutorial_versions tutorial_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_versions
    ADD CONSTRAINT tutorial_versions_pkey PRIMARY KEY (id);


--
-- Name: comment_reactions_comment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_reactions_comment_id_idx ON public.comment_reactions USING btree (comment_id);


--
-- Name: comment_reactions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_reactions_user_id_idx ON public.comment_reactions USING btree (user_id);


--
-- Name: comment_reactions_value_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_reactions_value_idx ON public.comment_reactions USING btree (value);


--
-- Name: comments_mod_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_mod_id_idx ON public.comments USING btree (mod_id);


--
-- Name: comments_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_parent_id_idx ON public.comments USING btree (parent_id);


--
-- Name: engagement_devices_favorited_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engagement_devices_favorited_idx ON public.engagement_devices USING btree (device_id, favorited_at DESC) WHERE favorited;


--
-- Name: favorites_mod_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX favorites_mod_id_idx ON public.favorites USING btree (mod_id);


--
-- Name: favorites_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX favorites_user_id_idx ON public.favorites USING btree (user_id);


--
-- Name: gamebanana_mods_character_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gamebanana_mods_character_idx ON public.gamebanana_mods USING btree ("character");


--
-- Name: gamebanana_mods_gb_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gamebanana_mods_gb_created_at_idx ON public.gamebanana_mods USING btree (gb_created_at DESC);


--
-- Name: gamebanana_mods_like_count_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gamebanana_mods_like_count_idx ON public.gamebanana_mods USING btree (like_count DESC);


--
-- Name: likes_mod_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX likes_mod_id_idx ON public.likes USING btree (mod_id);


--
-- Name: likes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX likes_user_id_idx ON public.likes USING btree (user_id);


--
-- Name: mods_character_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mods_character_idx ON public.mods USING btree ("character");


--
-- Name: mods_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mods_created_at_idx ON public.mods USING btree (created_at DESC);


--
-- Name: mods_downloads_count_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mods_downloads_count_idx ON public.mods USING btree (downloads_count DESC);


--
-- Name: mods_game_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mods_game_key_idx ON public.mods USING btree (game_key);


--
-- Name: mods_is_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mods_is_published_idx ON public.mods USING btree (is_published);


--
-- Name: ratings_mod_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ratings_mod_id_idx ON public.ratings USING btree (mod_id);


--
-- Name: ratings_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ratings_user_id_idx ON public.ratings USING btree (user_id);


--
-- Name: tutorial_chapters_config_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tutorial_chapters_config_idx ON public.tutorial_chapters USING btree (config_id, sort_order);


--
-- Name: tutorial_images_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tutorial_images_chapter_idx ON public.tutorial_images USING btree (chapter_id, sort_order);


--
-- Name: tutorial_tools_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tutorial_tools_chapter_idx ON public.tutorial_tools USING btree (chapter_id, sort_order);


--
-- Name: tutorial_versions_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tutorial_versions_sort_idx ON public.tutorial_versions USING btree (sort_order);


--
-- Name: comment_reactions comment_reactions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comment_reactions_set_updated_at BEFORE UPDATE ON public.comment_reactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: comments comments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comments_set_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gamebanana_mods gamebanana_mods_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gamebanana_mods_set_updated_at BEFORE UPDATE ON public.gamebanana_mods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: mods mods_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mods_set_updated_at BEFORE UPDATE ON public.mods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ratings ratings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ratings_set_updated_at BEFORE UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tutorial_chapters tutorial_chapters_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tutorial_chapters_set_updated_at BEFORE UPDATE ON public.tutorial_chapters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tutorial_configs tutorial_configs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tutorial_configs_set_updated_at BEFORE UPDATE ON public.tutorial_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tutorial_versions tutorial_versions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tutorial_versions_set_updated_at BEFORE UPDATE ON public.tutorial_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: comment_reactions comment_reactions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comment_reactions comment_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_mod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_mod_id_fkey FOREIGN KEY (mod_id) REFERENCES public.mods(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_mod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_mod_id_fkey FOREIGN KEY (mod_id) REFERENCES public.mods(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: likes likes_mod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_mod_id_fkey FOREIGN KEY (mod_id) REFERENCES public.mods(id) ON DELETE CASCADE;


--
-- Name: likes likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mods mods_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mods
    ADD CONSTRAINT mods_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ratings ratings_mod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_mod_id_fkey FOREIGN KEY (mod_id) REFERENCES public.mods(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tutorial_chapters tutorial_chapters_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_chapters
    ADD CONSTRAINT tutorial_chapters_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.tutorial_configs(id) ON DELETE CASCADE;


--
-- Name: tutorial_configs tutorial_configs_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_configs
    ADD CONSTRAINT tutorial_configs_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.tutorial_versions(id) ON DELETE CASCADE;


--
-- Name: tutorial_images tutorial_images_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_images
    ADD CONSTRAINT tutorial_images_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.tutorial_chapters(id) ON DELETE CASCADE;


--
-- Name: tutorial_tools tutorial_tools_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutorial_tools
    ADD CONSTRAINT tutorial_tools_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.tutorial_chapters(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict BQeCr5RSJzbY4WfXGUgbwiYSvnNrRomlzBqXQp55i8YfKV3NCZzTEEJdScQWfFm

