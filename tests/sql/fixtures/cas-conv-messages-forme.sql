-- Après migration, sur une base jetable du banc uniquement.
do $$
declare r text; c text; refuse boolean;
begin
  foreach r in array array['authenticated','postgres'] loop
    foreach c in array array['{"type":"media","fileType":1,"url":"https://example.test/a"}',
      '{"type":"audio","filename":1,"url":"https://example.test/a"}', '{"type":"text","rt":{"t":[]}}',
      '{"type":"text","text":{}}','{"type":"gif","url":[]}', '{"type":"location","lat":999,"lng":2}',
      '{"type":"react","target":{},"emoji":"x"}', '{"type":"text","sp":{"e":[]}}',
      '{"type":"inconnu"}', '[]', '{bad', '[bad'] loop
      execute format('set local role %I', r);
      refuse := false;
      begin insert into public.conv_messages values ('apres', c); exception when check_violation then refuse := true; end;
      if not refuse then raise exception 'INSERT invalide accepté'; end if;
      refuse := false;
      begin update public.conv_messages set content = c where id = 'avant'; exception when check_violation then refuse := true; end;
      if not refuse then raise exception 'UPDATE invalide accepté'; end if;
      execute 'reset role';
    end loop;
    execute format('set local role %I', r);
    insert into public.conv_messages values ('sain_' || r, '{"type":"text","text":"bonjour"}');
    update public.conv_messages set content = 'texte ancien' where id = 'sain_' || r;
    execute 'reset role';
  end loop;
  if (select count(*) from public.conv_messages where id in ('historique','avant')) <> 2 then raise exception 'historique modifié'; end if;
end $$;
