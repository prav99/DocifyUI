# Docify — Real OAuth Setup Runbook

**Goal:** turn on real Google / GitHub / GitLab / Bitbucket sign-in on the live
site (`https://docifydocai.com`), so users authenticate through the provider
and Docify reads *their* repositories instead of the built-in demo account.

> **Google is different from the code hosts.** "Continue with Google" is
> sign-in only: it authenticates the person (OpenID Connect, `openid email
> profile` scopes), creates or matches their account by verified email, and
> stores **no** Google tokens. It never touches repositories — ideal for
> executives and evaluators who want to explore before connecting a code host.

## Why this is needed (read first)

The application code already implements real OAuth end-to-end. It stays in
"demo mode" only because the OAuth **credentials are not present** in the
Railway environment. The server decides per-provider like this:

```
realProv(p) = Boolean(CLIENT_ID for p AND CLIENT_SECRET for p)
```

If those two values are missing for a provider, `/api/auth/providers` reports
`false`, and the sign-in button can't do a real handshake. Once you complete the
steps below, real OAuth switches on automatically — no code change required for
that part.

> These steps involve creating OAuth apps in your own developer accounts and
> pasting secret values into Railway. They must be done by you (or an admin) —
> they can't be automated on your behalf.

---

## Step 0 — Values you'll reuse

| Thing | Value |
|---|---|
| Production URL | `https://docifydocai.com` |
| Google redirect URI | `https://docifydocai.com/api/auth/google/callback` |
| GitHub callback URL | `https://docifydocai.com/api/auth/github/callback` |
| GitLab callback URL | `https://docifydocai.com/api/auth/gitlab/callback` |
| Bitbucket callback URL | `https://docifydocai.com/api/auth/bitbucket/callback` |

---

## Step 1 — Register the OAuth apps

### Google
1. Go to **Google Cloud Console → APIs & Services**
   (`https://console.cloud.google.com/apis/credentials`). Create a project
   (e.g. "Docify") if you don't have one.
2. First configure the **OAuth consent screen** (Branding):
   - **User type:** External
   - **App name:** Docify · **Support email:** your support address
   - **Authorized domain:** `docifydocai.com`
   - Scopes: only the non-sensitive defaults (`openid`, `email`, `profile`) —
     nothing to add manually; **do not** request any Drive/Gmail scopes.
   - Publish the app (leaving it in "Testing" limits sign-in to allowlisted
     test accounts and shows scary warnings to everyone else).
3. Then **Credentials → Create credentials → OAuth client ID**:
   - **Application type:** Web application
   - **Name:** Docify Web
   - **Authorized JavaScript origins:** `https://docifydocai.com`
   - **Authorized redirect URIs:** `https://docifydocai.com/api/auth/google/callback`
     (for local development also add `http://localhost:4000/api/auth/google/callback`)
4. Copy the **Client ID** and **Client secret**.

### GitHub
1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (`https://github.com/settings/developers`).
2. Fill in:
   - **Application name:** Docify
   - **Homepage URL:** `https://docifydocai.com`
   - **Authorization callback URL:** `https://docifydocai.com/api/auth/github/callback`
3. Create the app, then **Generate a new client secret**.
4. Copy the **Client ID** and **Client secret** (you'll set them in Step 2).
   - Scopes are requested by the app at runtime (`read:user user:email repo`);
     nothing to configure here.

### GitLab
1. Go to **GitLab → User Settings → Applications**
   (`https://gitlab.com/-/profile/applications`).
2. Fill in:
   - **Name:** Docify
   - **Redirect URI:** `https://docifydocai.com/api/auth/gitlab/callback`
   - **Confidential:** checked
   - **Scopes:** `read_user`, `read_api`, `read_repository`
3. Save. Copy the **Application ID** (client id) and **Secret**.

### Bitbucket
1. Go to **Bitbucket → Workspace settings → OAuth consumers → Add consumer**
   (`https://bitbucket.org/<workspace>/workspace/settings/api`).
2. Fill in:
   - **Name:** Docify
   - **Callback URL:** `https://docifydocai.com/api/auth/bitbucket/callback`
   - **Permissions:** Account → **Read**, Repositories → **Read**, Email → **Read**
3. Save. Expand the consumer to copy the **Key** (client id) and **Secret**.

> You only need to register the providers you actually want live. GitHub alone
> is enough to fix the main issue; GitLab and Bitbucket are optional.

---

## Step 2 — Set environment variables in Railway

Open your Docify service in Railway → **Variables** tab → add these.

**Always required (so redirects point at production, not localhost):**

| Variable | Value |
|---|---|
| `OAUTH_REDIRECT_BASE` | `https://docifydocai.com` |
| `CLIENT_ORIGIN` | `https://docifydocai.com` |

**Per provider you registered in Step 1:**

| Variable | From |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub Client secret |
| `GITLAB_CLIENT_ID` | GitLab Application ID |
| `GITLAB_CLIENT_SECRET` | GitLab Secret |
| `BITBUCKET_CLIENT_ID` | Bitbucket Key |
| `BITBUCKET_CLIENT_SECRET` | Bitbucket Secret |

Also confirm these already-present variables are correct:
`JWT_SECRET` (long random string), `DATABASE_URL`, `ANTHROPIC_API_KEY`.

Save — Railway will redeploy automatically.

---

## Step 3 — Deploy the code change

A small code fix was made so that, when a provider **isn't** configured, the app
now says so honestly instead of silently signing you in as a placeholder
(`praveen@acme.dev`) account. File changed: `client/src/pages/Auth.jsx`.

Deploy it by committing and pushing to the branch Railway builds from:

```bash
git add client/src/pages/Auth.jsx docs/OAUTH-SETUP.md
git commit -m "Honest OAuth fallback + OAuth setup runbook"
git push
```

(If you'd rather I not touch git, you can review the diff first — nothing has
been committed or pushed automatically.)

---

## Step 4 — Verify it works

1. Open `https://docifydocai.com/api/auth/providers` in a browser. You should see
   `true` for each provider you configured, e.g. `{"github":true,"google":true,...}`.
   - **Google:** on the signup page click **Continue with Google**, pick an
     account, and you should land on the dashboard signed in. Check
     Settings → Sign-in & security shows Google as connected. No repository
     source should appear anywhere (Google is sign-in only).
2. Go to the sign-in page, click **Continue with GitHub**. You should now be
   redirected to **github.com** to authorize Docify (this is the step that was
   missing before).
3. After authorizing, you land back in Docify and the repository picker shows
   **your real repositories** — not the `acme/...` demo list.
4. Generate a document from one of your repos; the run history should no longer
   say "template content was used."

If a provider still shows `false`, its `CLIENT_ID`/`CLIENT_SECRET` pair isn't set
correctly in Railway. If the redirect returns an error, the callback URL in the
provider app doesn't exactly match the one in Step 0.

---

## Security note

While reviewing the backend I saw a live `ANTHROPIC_API_KEY` in
`server/.env`. That file **is** in `.gitignore`, so it is not committed to the
repo — good. But if that key has ever been shared, pasted, or shown on screen,
rotate it in the Anthropic console and update the Railway variable, as a
precaution.
