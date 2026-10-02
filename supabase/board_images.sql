-- 자유게시판 사진 첨부
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요.

-- 1) 게시글에 사진 URL 목록 컬럼 추가
alter table posts add column if not exists image_urls text[] not null default '{}';

-- 2) 사진 저장용 공개 버킷 (파일당 최대 5MB, 이미지 형식만 허용)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- 3) 버킷 접근 정책
--    이 앱은 Supabase Auth 대신 자체 로그인(localStorage)을 쓰므로 anon 키로 업로드/삭제합니다.
drop policy if exists "post-images read" on storage.objects;
create policy "post-images read" on storage.objects
  for select using (bucket_id = 'post-images');

drop policy if exists "post-images upload" on storage.objects;
create policy "post-images upload" on storage.objects
  for insert with check (bucket_id = 'post-images');

drop policy if exists "post-images delete" on storage.objects;
create policy "post-images delete" on storage.objects
  for delete using (bucket_id = 'post-images');
