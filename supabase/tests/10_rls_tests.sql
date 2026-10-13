\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

create schema t;
create table t.results (label text, ok boolean, detail text);
create table t.ctx (k text primary key, v text);
grant usage on schema t to authenticated, anon;
grant all on t.results, t.ctx to authenticated, anon;

-- run sql as current role; expect: 'ok' (no error), 'error' (any error), or 'rows=N' (rows affected / returned)
create function t.check(label text, stmt text, expect text) returns void language plpgsql as $$
declare n bigint; err text; passed boolean; detail text;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    detail := 'ok rows=' || n;
    passed := case when expect = 'ok' then true
                   when expect = 'error' then false
                   when expect like 'rows=%' then n = substr(expect,6)::bigint end;
  exception when others then
    err := sqlerrm; detail := 'error: ' || err;
    passed := (expect = 'error');
  end;
  insert into t.results values (label, passed, detail || ' (expected ' || expect || ')');
end $$;
grant execute on function t.check(text,text,text) to authenticated, anon;

-- scalar helper: store the result of a query for later use
create function t.keep(p_key text, p_stmt text) returns void language plpgsql as $$
declare val text;
begin execute p_stmt into val; insert into t.ctx (k, v) values (p_key, val) on conflict (k) do update set v = excluded.v; end $$;
grant execute on function t.keep(text,text) to authenticated;

create function t.as_user(u uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', u::text, false);
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','alice@x.edu','{"display_name":"Alice Owner"}'),
 ('00000000-0000-0000-0000-00000000000b','bob@x.edu','{"display_name":"Bob Admin"}'),
 ('00000000-0000-0000-0000-00000000000c','carol@x.edu','{}'),
 ('00000000-0000-0000-0000-00000000000d','dave@x.edu','{"display_name":"Dave Outsider"}'),
 ('00000000-0000-0000-0000-00000000000e','erin@x.edu','{"display_name":"Erin Outsider"}');

select t.check('signup trigger created 5 profiles', 'select 1 from public.profiles having count(*)=5', 'rows=1');
select t.check('public ids match COVA-XXXXXX', $$select 1 from public.profiles where public_id !~ '^COVA-[A-HJ-NP-Z2-9]{6}$'$$, 'rows=0');
select t.check('display name falls back to email local part', $$select 1 from public.profiles where display_name='carol'$$, 'rows=1');

grant usage on schema auth to authenticated;
set role authenticated;
-- ================= PROFILES =================
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('profiles: user can read others', $$select * from public.profiles$$, 'rows=5');
select t.check('profiles: update own display_name', $$update public.profiles set display_name='Alice O' where id=auth.uid()$$, 'rows=1');
select t.check('profiles: cannot update someone else', $$update public.profiles set display_name='Hax' where id='00000000-0000-0000-0000-00000000000b'$$, 'rows=0');
select t.check('profiles: cannot change public_id', $$update public.profiles set public_id='COVA-AAAAAA' where id=auth.uid()$$, 'error');
select t.check('profiles: cannot insert profile', $$insert into public.profiles (id, display_name) values (gen_random_uuid(),'x')$$, 'error');
select t.check('profiles: cannot delete profile', $$delete from public.profiles where id=auth.uid()$$, 'error');

-- ================= FRIENDS =================
select t.check('friends: alice -> bob request', $$select public.send_friend_request('00000000-0000-0000-0000-00000000000b')$$, 'ok');
select t.check('friends: duplicate request rejected', $$select public.send_friend_request('00000000-0000-0000-0000-00000000000b')$$, 'error');
select t.check('friends: cannot add self', $$select public.send_friend_request(auth.uid())$$, 'error');
select t.check('friends: unknown person rejected', $$select public.send_friend_request(gen_random_uuid())$$, 'error');
select t.check('friends: cannot forge from_id', $$insert into public.friendships (from_id,to_id) values ('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d')$$, 'error');
select t.check('friends: cannot insert as accepted', $$insert into public.friendships (to_id,status) values ('00000000-0000-0000-0000-00000000000c','accepted')$$, 'error');
select t.check('friends: sender cannot accept own request', $$update public.friendships set status='accepted' where to_id='00000000-0000-0000-0000-00000000000b'$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.check('friends: outsider sees none', $$select * from public.friendships$$, 'rows=0');
select t.check('friends: outsider cannot delete', $$delete from public.friendships$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('friends: recipient accepts', $$update public.friendships set status='accepted' where from_id='00000000-0000-0000-0000-00000000000a'$$, 'rows=1');
select t.check('friends: cannot change from_id/to_id', $$update public.friendships set to_id='00000000-0000-0000-0000-00000000000c'$$, 'error');
select t.check('friends: reverse request when accepted -> already friends', $$select public.send_friend_request('00000000-0000-0000-0000-00000000000a')$$, 'error');
-- cross request auto-accept: carol asks dave, dave asks carol
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('friends: carol -> dave', $$select public.send_friend_request('00000000-0000-0000-0000-00000000000d')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.check('friends: dave asking back auto-accepts', $$select public.send_friend_request('00000000-0000-0000-0000-00000000000c')$$, 'ok');
select t.check('friends: now accepted', $$select 1 from public.friendships where status='accepted' and least(from_id,to_id)='00000000-0000-0000-0000-00000000000c'$$, 'rows=1');
select t.check('friends: party can remove', $$delete from public.friendships where status='accepted' and to_id=auth.uid() or from_id=auth.uid()$$, 'rows=1');

-- ================= DIRECT MESSAGES =================
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('dm: send', $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-00000000000b','hi bob')$$, 'ok');
select t.check('dm: cannot spoof sender', $$insert into public.direct_messages (from_id,to_id,body) values ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a','fake')$$, 'error');
select t.check('dm: cannot message self', $$insert into public.direct_messages (to_id, body) values (auth.uid(),'me')$$, 'error');
select t.check('dm: empty body rejected', $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-00000000000b','   ')$$, 'error');
select t.check('dm: >2000 chars rejected', $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-00000000000b', repeat('x',2001))$$, 'error');
select t.check('dm: cannot edit', $$update public.direct_messages set body='edited'$$, 'error');
select t.check('dm: cannot delete', $$delete from public.direct_messages$$, 'error');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.check('dm: outsider cannot read', $$select * from public.direct_messages$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('dm: recipient reads', $$select * from public.direct_messages$$, 'rows=1');
select t.check('dm: mark read', $$select public.mark_thread_read('00000000-0000-0000-0000-00000000000a')$$, 'ok');
select t.check('dm: cannot write reads directly', $$insert into public.message_reads (user_id,other_id) values (auth.uid(),'00000000-0000-0000-0000-00000000000c')$$, 'error');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('dm: others cannot see my read markers', $$select * from public.message_reads$$, 'rows=0');

-- ================= COMMUNITIES =================
select t.check('community: create private (insert returning)', $$insert into public.communities (name,description,category,visibility,posting_policy) values ('Secret Club','A private study group for tests','Study','private','everyone') returning id$$, 'ok');
select t.keep('priv', $$select id::text from public.communities where name='Secret Club'$$);
select t.check('community: name too short', $$insert into public.communities (name,description) values ('ab','long enough description')$$, 'error');
select t.check('community: cannot create as someone else', $$insert into public.communities (owner_id,name,description) values ('00000000-0000-0000-0000-00000000000b','Stolen name','long enough description')$$, 'error');
select t.check('community: creator became owner', $$select 1 from public.community_members where role='owner' and user_id=auth.uid()$$, 'rows=1');
select t.check('community: owner can read join code', $$select code from public.community_join_codes$$, 'rows=1');
select t.keep('code', $$select code from public.community_join_codes$$);

select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.check('private: outsider cannot see community', $$select * from public.communities where visibility='private'$$, 'rows=0');
select t.check('private: outsider cannot read join codes', $$select * from public.community_join_codes$$, 'rows=0');
select t.check('private: outsider cannot read members', $$select * from public.community_members where role='owner'$$, 'rows=0');
select t.check('private: outsider cannot join directly', format($$insert into public.community_members (community_id) values (%L)$$, (select v from t.ctx where k='priv')), 'error');
select t.check('private: outsider cannot create request directly', format($$insert into public.join_requests (community_id) values (%L)$$, (select v from t.ctx where k='priv')), 'error');
select t.check('private: wrong code rejected', $$select public.join_by_code('ZZZZZZZZ')$$, 'error');
select t.check('private: empty code rejected', $$select public.join_by_code('  ')$$, 'error');
select t.check('private: code works with spaces/lowercase/dash', format($$select public.join_by_code(%L)$$, lower(substr((select v from t.ctx where k='code'),1,4)||' - '||substr((select v from t.ctx where k='code'),5))), 'ok');
select t.check('private: second use -> already-requested', format($$select 1 where (public.join_by_code(%L))->>'outcome' = 'already-requested'$$, (select v from t.ctx where k='code')), 'rows=1');
select t.check('private: requester can now see name (pending)', $$select * from public.communities where visibility='private'$$, 'rows=1');
select t.check('private: requester still cannot see code', $$select * from public.community_join_codes$$, 'rows=0');
select t.check('private: requester still cannot read posts', $$select * from public.community_posts$$, 'rows=0');
select t.check('private: requester cannot approve self', $$select public.decide_join_request(id, true) from public.join_requests$$, 'error');
select t.check('private: probe says exists', format($$select 1 where public.private_community_exists(%L)$$, (select v from t.ctx where k='priv')), 'rows=1');
select t.check('private: probe false for random id', $$select 1 where public.private_community_exists(gen_random_uuid())$$, 'rows=0');
select t.check('private: requester can cancel own request', $$delete from public.join_requests where user_id=auth.uid()$$, 'rows=1');

-- bob, carol, erin request; owner approves
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('req: bob', format($$select public.join_by_code(%L)$$, (select v from t.ctx where k='code')), 'ok');
select t.check('req: member without staff role cannot see requests of others', $$select * from public.join_requests$$, 'rows=1'); -- only own
select t.check('req: bob cannot approve himself', $$select public.decide_join_request(id,true) from public.join_requests$$, 'error');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('req: carol', format($$select public.join_by_code(%L)$$, (select v from t.ctx where k='code')), 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('req: erin', format($$select public.join_by_code(%L)$$, (select v from t.ctx where k='code')), 'ok');

select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('req: owner sees 3 requests', $$select * from public.join_requests$$, 'rows=3');
select t.check('req: owner approves bob', $$select public.decide_join_request(id,true) from public.join_requests where user_id='00000000-0000-0000-0000-00000000000b'$$, 'ok');
select t.check('req: owner approves carol', $$select public.decide_join_request(id,true) from public.join_requests where user_id='00000000-0000-0000-0000-00000000000c'$$, 'ok');
select t.check('req: owner declines erin', $$select public.decide_join_request(id,false) from public.join_requests where user_id='00000000-0000-0000-0000-00000000000e'$$, 'ok');
select t.check('req: 0 requests left', $$select * from public.join_requests$$, 'rows=0');
select t.check('req: erin is not a member', $$select 1 from public.community_members where user_id='00000000-0000-0000-0000-00000000000e'$$, 'rows=0');
select t.check('roles: owner makes bob admin', $$update public.community_members set role='admin' where user_id='00000000-0000-0000-0000-00000000000b'$$, 'rows=1');
select t.check('roles: cannot demote owner', $$update public.community_members set role='member' where role='owner'$$, 'rows=0');
select t.check('roles: cannot create 2nd owner', $$update public.community_members set role='owner' where user_id='00000000-0000-0000-0000-00000000000c'$$, 'error');

select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('admin: sees join code', $$select * from public.community_join_codes$$, 'rows=1');
select t.check('admin: cannot regenerate code', format($$select public.regenerate_join_code(%L)$$, (select v from t.ctx where k='priv')), 'error');
select t.check('admin: cannot assign admin', $$update public.community_members set role='admin' where user_id='00000000-0000-0000-0000-00000000000c'$$, 'rows=0');
select t.check('admin: cannot edit community', $$update public.communities set name='Hijacked'$$, 'rows=0');
select t.check('admin: cannot delete community', $$delete from public.communities$$, 'rows=0');
select t.check('admin: cannot change visibility', $$update public.communities set visibility='public'$$, 'rows=0');
select t.check('admin: cannot remove owner', $$delete from public.community_members where role='owner'$$, 'rows=0');

select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('member: cannot see join code', $$select * from public.community_join_codes$$, 'rows=0');
select t.check('member: cannot see requests', $$select * from public.join_requests$$, 'rows=0');
select t.check('member: cannot remove another member', $$delete from public.community_members where user_id='00000000-0000-0000-0000-00000000000b'$$, 'rows=0');
select t.check('member: can read other members', $$select * from public.community_members$$, 'rows=3');
select t.check('member: cannot write join code', $$update public.community_join_codes set code='AAAAAAAA'$$, 'error');

-- posting policy
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('post/everyone: owner posts', format($$insert into public.community_posts (community_id, body) values (%L,'owner post')$$, (select v from t.ctx where k='priv')), 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('post/everyone: member posts', format($$insert into public.community_posts (community_id, body) values (%L,'member post')$$, (select v from t.ctx where k='priv')), 'ok');
select t.check('post: cannot spoof author', format($$insert into public.community_posts (community_id, author_id, body) values (%L,'00000000-0000-0000-0000-00000000000a','fake')$$, (select v from t.ctx where k='priv')), 'error');
select t.check('post: empty rejected', format($$insert into public.community_posts (community_id, body) values (%L,' ')$$, (select v from t.ctx where k='priv')), 'error');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('post: non-member cannot post to private', format($$insert into public.community_posts (community_id, body) values (%L,'sneak')$$, (select v from t.ctx where k='priv')), 'error');
select t.check('post: non-member cannot read private posts', $$select * from public.community_posts$$, 'rows=0');

select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('policy: set admins-only', $$update public.communities set posting_policy='admins'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('post/admins: member blocked', format($$insert into public.community_posts (community_id, body) values (%L,'x')$$, (select v from t.ctx where k='priv')), 'error');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('post/admins: admin allowed', format($$insert into public.community_posts (community_id, body) values (%L,'admin post')$$, (select v from t.ctx where k='priv')), 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('policy: set owner-only', $$update public.communities set posting_policy='owner'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('post/owner: admin blocked', format($$insert into public.community_posts (community_id, body) values (%L,'x')$$, (select v from t.ctx where k='priv')), 'error');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('post/owner: owner allowed', format($$insert into public.community_posts (community_id, body) values (%L,'owner again')$$, (select v from t.ctx where k='priv')), 'ok');
select t.check('policy: back to everyone', $$update public.communities set posting_policy='everyone'$$, 'rows=1');

-- deleting posts
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('del post: admin cannot delete owner post', $$delete from public.community_posts where body='owner post'$$, 'rows=0');
select t.check('del post: admin cannot delete another admin?? (own post ok)', $$delete from public.community_posts where body='admin post'$$, 'rows=1');
select t.check('del post: admin deletes member post', $$delete from public.community_posts where body='member post'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('del post: member cannot delete owner post', $$delete from public.community_posts where body='owner post'$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('del post: owner deletes any', $$delete from public.community_posts where body='owner post'$$, 'rows=1');

-- removing members / admins
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('roles: make carol admin', $$update public.community_members set role='admin' where user_id='00000000-0000-0000-0000-00000000000c'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('remove: admin cannot remove another admin', $$delete from public.community_members where user_id='00000000-0000-0000-0000-00000000000c'$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('remove: owner removes admin', $$delete from public.community_members where user_id='00000000-0000-0000-0000-00000000000c'$$, 'rows=1');
select t.check('remove: owner cannot leave', $$delete from public.community_members where user_id=auth.uid()$$, 'rows=0');
-- re-add carol as plain member via request flow, then admin removes her
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('remove: carol re-requests', format($$select public.join_by_code(%L)$$, (select v from t.ctx where k='code')), 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('remove: admin approves request', $$select public.decide_join_request(id,true) from public.join_requests$$, 'ok');
select t.check('remove: admin removes plain member', $$delete from public.community_members where user_id='00000000-0000-0000-0000-00000000000c'$$, 'rows=1');
select t.check('remove: admin can leave', $$delete from public.community_members where user_id=auth.uid()$$, 'rows=1');

-- regenerate code
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('code: owner regenerates', format($$select public.regenerate_join_code(%L)$$, (select v from t.ctx where k='priv')), 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.check('code: old code no longer works', format($$select public.join_by_code(%L)$$, (select v from t.ctx where k='code')), 'error');

-- private -> public admits waiting requests
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.keep('code2', $$select code from public.community_join_codes$$);
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('vis: erin requests', format($$select public.join_by_code(%L)$$, (select v from t.ctx where k='code2')), 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('vis: owner makes it public', $$update public.communities set visibility='public'$$, 'rows=1');
select t.check('vis: waiting requests cleared', $$select * from public.join_requests$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('vis: erin admitted', $$select 1 from public.community_members where user_id=auth.uid()$$, 'rows=1');

-- public community behaviour
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('public: create', $$insert into public.communities (name,description,category,visibility,posting_policy) values ('Open Lounge','Everyone is welcome here','Other','public','everyone')$$, 'ok');
select t.keep('pub', $$select id::text from public.communities where name='Open Lounge'$$);
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.check('public: outsider can read it', $$select * from public.communities where name='Open Lounge'$$, 'rows=1');
select t.check('public: outsider cannot read its code', $$select * from public.community_join_codes$$, 'rows=0');
select t.check('public: cannot join as admin', format($$insert into public.community_members (community_id, role) values (%L,'admin')$$, (select v from t.ctx where k='pub')), 'error');
select t.check('public: cannot join as someone else', format($$insert into public.community_members (community_id, user_id) values (%L,'00000000-0000-0000-0000-00000000000e')$$, (select v from t.ctx where k='pub')), 'error');
select t.check('public: joins directly as member', format($$insert into public.community_members (community_id) values (%L)$$, (select v from t.ctx where k='pub')), 'ok');
select t.check('public: joining twice fails', format($$insert into public.community_members (community_id) values (%L)$$, (select v from t.ctx where k='pub')), 'error');
select t.check('public: member can post', format($$insert into public.community_posts (community_id, body) values (%L,'hello all')$$, (select v from t.ctx where k='pub')), 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('public: non-member can read posts', format($$select * from public.community_posts where community_id=%L$$, (select v from t.ctx where k='pub')), 'rows=1');
select t.check('public: non-member cannot post', format($$insert into public.community_posts (community_id, body) values (%L,'x')$$, (select v from t.ctx where k='pub')), 'error');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.keep('pubcode', format($$select code from public.community_join_codes where community_id=%L$$, (select v from t.ctx where k='pub')));
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('public: join_by_code -> already-member or joined', format($$select 1 where (public.join_by_code(%L))->>'outcome' in ('joined','already-member')$$, (select v from t.ctx where k='pubcode')), 'rows=1');

-- delete community cascades
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('delete: non-owner cannot delete', format($$delete from public.communities where id=%L$$, (select v from t.ctx where k='pub')), 'rows=0');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('delete: owner deletes', format($$delete from public.communities where id=%L$$, (select v from t.ctx where k='pub')), 'rows=1');
reset role;
select t.check('delete: cascade removed members/posts/code', format($$select 1 from public.community_members where community_id=%L union all select 1 from public.community_posts where community_id=%L union all select 1 from public.community_join_codes where community_id=%L$$, (select v from t.ctx where k='pub'),(select v from t.ctx where k='pub'),(select v from t.ctx where k='pub')), 'rows=0');

-- ================= SEARCH =================
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.check('search: by name', $$select * from public.search_profiles('alice')$$, 'rows=1');
select t.check('search: by partial + @', $$select * from public.search_profiles('@ali')$$, 'rows=1');
select t.check('search: 1 char returns nothing', $$select * from public.search_profiles('a')$$, 'rows=0');
select t.check('search: excludes self', $$select * from public.search_profiles('dave')$$, 'rows=0');
select t.check('search: % is literal, not wildcard', $$select * from public.search_profiles('%%')$$, 'rows=0');
select t.check('search: _ is literal', $$select * from public.search_profiles('__')$$, 'rows=0');
select t.check('search: by COVA id prefix', $$select * from public.search_profiles('cova-')$$, 'rows=4');

-- ================= ANON =================
reset role;
set role anon;
select t.check('anon: cannot read profiles', $$select * from public.profiles$$, 'error');
select t.check('anon: cannot read messages', $$select * from public.direct_messages$$, 'error');
select t.check('anon: cannot call join_by_code', $$select public.join_by_code('AAAAAAAA')$$, 'error');
select t.check('anon: cannot call search', $$select * from public.search_profiles('alice')$$, 'error');
reset role;

-- ================= account deletion =================
delete from auth.users where id='00000000-0000-0000-0000-00000000000d';
select t.check('account delete removes profile', $$select 1 from public.profiles where id='00000000-0000-0000-0000-00000000000d'$$, 'rows=0');

\echo ======== RESULTS ========
select case when ok then 'PASS' else 'FAIL' end || ' | ' || label || ' | ' || detail from t.results order by ok, label;
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok) from t.results;
