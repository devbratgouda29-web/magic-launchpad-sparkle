create policy "Admins manage notes bucket"
on storage.objects for all to authenticated
using (bucket_id = 'notes-bucket' and public.has_role(auth.uid(), 'admin'))
with check (bucket_id = 'notes-bucket' and public.has_role(auth.uid(), 'admin'));

create policy "Public can read notes bucket images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'notes-bucket' and (name like 'covers/%' or name like 'previews/%'));

create policy "Signed-in users can read notes bucket pdfs"
on storage.objects for select to authenticated
using (bucket_id = 'notes-bucket' and name like 'pdfs/%');