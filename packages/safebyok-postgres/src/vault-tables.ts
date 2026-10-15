/**
 * The SQL that makes safebyok's tables in your Postgres (14 or later, in a UTF8 database): one
 * bundle per vault in `safebyok_bundles`, one row per lockbox in `safebyok_lockboxes`, each record
 * a column to a field and its ciphered values opaque jsonb; row-level security on, with no policy,
 * so only the tables' owner reaches them; and the trigger that notifies {@link VaultChangeChannel}
 * after every write. Run it once, as a migration or at your server's start: it is safe to run
 * again. The package also ships it as `vault-tables.sql`, for a migration tool to copy.
 *
 * @example await pool.query(VaultTablesSql)  // pg runs several statements in one query without parameters
 * @example await pglite.exec(VaultTablesSql)
 */
export const VaultTablesSql = `-- safebyok-postgres: the tables a safebyok vault is stored in, and the trigger that tells
-- listeners when a vault changes. For Postgres 14 or later, in a UTF8 database. Safe to run
-- again: it creates only the tables that are missing, and replaces its function and triggers.
--
-- Each record is stored field by field, a column to a field, exactly as safebyok wrote it:
-- text as text, a time or a count as a bigint, and each encrypted value (a cipherIv and its
-- ciphertext) as one opaque jsonb. A record's secret fields are ciphertext, every one.

-- One bundle per vault.
CREATE TABLE IF NOT EXISTS safebyok_bundles (
  applabel                     text   NOT NULL,
  user_id                      text   NOT NULL,
  vaultlabel                   text   NOT NULL,
  format                       text   NOT NULL,
  vault_id                     text   NOT NULL,
  passphrase_epoch             bigint NOT NULL,
  key_deriver_label            text   NOT NULL,
  passphrase_salt_b64          text   NOT NULL,
  vault_key_passphrase_wrapped jsonb  NOT NULL,
  registered_at                bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel),
  -- What a lockbox's foreign key names: its vault, down to the vault_id.
  UNIQUE (applabel, user_id, vaultlabel, vault_id)
);

-- One lockbox per boxlabel, beside its vault's scope and vault_id. A lockbox stands only while
-- its vault's bundle does, under the same vault_id: erasing the bundle erases its lockboxes with
-- it, and no write can leave a lockbox in a vault made anew. A null note is a lockbox with none.
CREATE TABLE IF NOT EXISTS safebyok_lockboxes (
  applabel            text   NOT NULL,
  user_id             text   NOT NULL,
  vaultlabel          text   NOT NULL,
  vault_id            text   NOT NULL,
  format              text   NOT NULL,
  boxlabel            text   NOT NULL,
  revision_id         text   NOT NULL,
  lockbox_key_wrapped jsonb  NOT NULL,
  whisper_ciphered    jsonb  NOT NULL,
  note                text,
  registered_at       bigint NOT NULL,
  changed_at          bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel, boxlabel),
  FOREIGN KEY (applabel, user_id, vaultlabel, vault_id)
    REFERENCES safebyok_bundles (applabel, user_id, vaultlabel, vault_id) ON DELETE CASCADE
);

-- Row-level security on, with no policy: the tables' owner -- the role your server connects as --
-- reaches them as before, and every other role reaches no row at all. On Supabase, that keeps
-- them out of the Data API's reach.
ALTER TABLE safebyok_bundles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_lockboxes ENABLE ROW LEVEL SECURITY;

-- After any write that changes a vault, a notification on the channel safebyok_vault_changes,
-- whose payload is the vault's scope as JSON: {"applabel" : ..., "user_id" : ..., "vaultlabel" : ...}.
-- A scope too long for a payload (8000 bytes) sends an empty one, which every listener hears as
-- its own. Postgres delivers a transaction's identical notifications as one, after it commits.
CREATE OR REPLACE FUNCTION safebyok_vault_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  payload text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    payload := json_build_object('applabel', OLD.applabel, 'user_id', OLD.user_id, 'vaultlabel', OLD.vaultlabel)::text;
  ELSE
    payload := json_build_object('applabel', NEW.applabel, 'user_id', NEW.user_id, 'vaultlabel', NEW.vaultlabel)::text;
  END IF;
  IF octet_length(payload) >= 8000 THEN
    payload := '';
  END IF;
  PERFORM pg_notify('safebyok_vault_changes', payload);
  RETURN NULL;
END
$$;

CREATE OR REPLACE TRIGGER safebyok_bundles_changed
  AFTER INSERT OR UPDATE OR DELETE ON safebyok_bundles
  FOR EACH ROW EXECUTE FUNCTION safebyok_vault_changed();

CREATE OR REPLACE TRIGGER safebyok_lockboxes_changed
  AFTER INSERT OR UPDATE OR DELETE ON safebyok_lockboxes
  FOR EACH ROW EXECUTE FUNCTION safebyok_vault_changed();
`

/**
 * The channel {@link VaultTablesSql}'s trigger notifies after every write that changes a vault.
 * Its payload is the vault's scope as JSON -- applabel, user_id and vaultlabel, no record and
 * nothing ciphered -- or empty, for a scope too long for one, which every listener hears as its own.
 */
export const VaultChangeChannel = 'safebyok_vault_changes'
