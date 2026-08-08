CREATE OR REPLACE FUNCTION public.vault_bid_history(p_ski_id uuid)
 RETURNS TABLE(id uuid, handle text, amount numeric, is_auto boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.id,
    CASE WHEN public.has_role(b.user_id, 'admin') THEN 'bidder***' || right(b.user_id::text,2)
    ELSE COALESCE(
      CASE WHEN p.username IS NULL OR length(p.username) < 3 THEN NULL
        ELSE left(p.username,2) || '***' || right(p.username,1) END,
      'bidder***' || right(b.user_id::text,2)
    ) END AS handle,
    b.amount, b.is_auto, b.created_at
  FROM public.vault_bids b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE b.ski_id = p_ski_id
  ORDER BY b.created_at DESC;
$function$;