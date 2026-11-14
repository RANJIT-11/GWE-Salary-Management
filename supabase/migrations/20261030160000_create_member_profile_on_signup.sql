  CREATE OR REPLACE FUNCTION public.create_member_profile()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
  BEGIN
    INSERT INTO public.profiles (id, username, full_name, role)
    VALUES (
      NEW.id,
      NULLIF(LOWER(BTRIM(NEW.raw_user_meta_data ->> 'username')), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      'member'::public.user_role
    );

    RETURN NEW;
  END;
  $function$;

  REVOKE ALL ON FUNCTION public.create_member_profile() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.create_member_profile() FROM anon, authenticated;

  DROP TRIGGER IF EXISTS gwe_create_member_profile ON auth.users;
  CREATE TRIGGER gwe_create_member_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_member_profile();
