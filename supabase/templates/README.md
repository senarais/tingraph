# Tingraph Auth emails

The six HTML files in this folder are generated artifacts. Change their copy
or layout in `scripts/auth-email-templates.mjs`, then regenerate and check them:

```sh
npm run auth-emails:build
npm run auth-emails:check
```

Publish them to the hosted Supabase project with a personal Management API
token in the current shell. The script reads the Tingraph project ref from
`.mcp.json`, updates only template subjects and HTML, then reads the Auth
configuration back and verifies every field.

```sh
export SUPABASE_ACCESS_TOKEN="..."
npm run auth-emails:push
unset SUPABASE_ACCESS_TOKEN
```

Never commit the token. Email delivery itself still requires a verified custom
SMTP sender in Supabase, with the sender domain's SPF, DKIM and DMARC records
configured at the mail provider. The Supabase Auth URL settings also need the
production Site URL and `<site>/auth/callback` in the redirect allow list.

The confirmation and recovery files intentionally use `TokenHash` links into
Tingraph's `/auth/callback`. Do not replace them with `ConfirmationURL`: the
default PKCE link can depend on the browser that started the request.
