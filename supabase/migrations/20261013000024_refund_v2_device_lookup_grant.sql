-- Refund V2 Edge device-key lookup: grant only the columns consumed by the
-- trusted service-role Edge handler. No write or client-role privileges.
GRANT SELECT (
  id,
  pharmacy_id,
  branch_id,
  status,
  public_key_pem
)
ON TABLE public.devices
TO service_role;
