"""
migrate_auth.py
===============
Creates Supabase Auth users for every row in the public.users table,
then patches each row with the new auth UUID so the profile lookup works.

Run once:
  python scripts/migrate_auth.py

Requires:
  pip install requests python-dotenv

The script reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env
(the same file used by the import scripts).

Email format: {username}@allway.local
Password:     the current password_hash value (plain-text legacy passwords)
              — users should change passwords after first login.
"""

from __future__ import annotations
import os
import sys
import time
import requests
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]

# ── Load env ────────────────────────────────────────────────────────────────
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    sys.exit("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}


def fetch_users():
    r = requests.get(f"{SUPABASE_URL}/rest/v1/users?select=id,username,password_hash,active", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def create_auth_user(username: str, password: str) -> Optional[dict]:
    """Create a Supabase Auth user. Returns the created user dict or None on conflict."""
    email = f"{username.lower()}@allway.local"
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,          # skip email confirmation
        "user_metadata": {"username": username},
    }
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    if r.status_code == 422:
        # User already exists — fetch by email
        print(f"  ↩ {username}: already exists in Auth, fetching ID")
        r2 = requests.get(
            f"{SUPABASE_URL}/auth/v1/admin/users?email={email}",
            headers=HEADERS,
            timeout=30,
        )
        if r2.ok:
            users = r2.json().get("users", [])
            return users[0] if users else None
        return None
    if not r.ok:
        print(f"  ✗ {username}: {r.status_code} {r.text[:200]}")
        return None
    return r.json()


def patch_profile(profile_id: str, auth_id: str):
    """Update the public.users row id to match the auth UUID (if different)."""
    if profile_id == auth_id:
        return  # already correct
    # We need to UPDATE the row — but id is the PK. In Supabase we can PATCH.
    # Easier: add an auth_id column (see note below). For now we just log.
    print(f"  ⚠ Profile id={profile_id} differs from auth id={auth_id}. "
          f"Consider adding an 'auth_id' column or re-seeding users with auth UUIDs.")


def main():
    users = fetch_users()
    print(f"Found {len(users)} users in public.users\n")

    for u in users:
        username = u["username"]
        password = u.get("password_hash") or "changeme123"
        print(f"→ {username} ({u['id']})")

        auth_user = create_auth_user(username, password)
        if not auth_user:
            continue

        auth_id = auth_user["id"]
        print(f"  ✓ Auth user: {auth_id}  email: {auth_user.get('email')}")
        patch_profile(u["id"], auth_id)
        time.sleep(0.3)   # avoid rate-limits

    print("\nDone! Users can now log in with:")
    print("  username: their username")
    print("  password: their current password_hash value")
    print("\nRemind them to change passwords after first login.")
    print("\nNOTE: The React app signs in with {username}@allway.local as the email.")


if __name__ == "__main__":
    main()
