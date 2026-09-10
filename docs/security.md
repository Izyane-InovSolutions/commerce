# Security baseline

Secrets belong only in ignored `.env` files or the process environment. Commit
placeholders in `.env.example`, never working credentials. Passwords, JWTs,
refresh tokens, reset tokens, signed URL signatures, and database connection
strings must not appear in logs or audit metadata.

Passwords are hashed, opaque tokens are stored only as hashes, refresh tokens
rotate on use, and reuse revokes the user's sessions. Authorization is enforced
through authenticated route defaults, role guards, and resource ownership
checks. Public endpoints are explicit and authentication endpoints are rate
limited.

Media uploads allow JPEG, PNG, WebP, and PDF files up to the configured limit.
Signed URLs expire and are scoped to one operation and asset. When the payment
API is selected, its webhook adapter must verify the original request body
before parsing or changing state.
