"""Stateless JWT authentication.

The Auth Service signs tokens; this service verifies the signature locally with
the shared key. It never calls the Auth Service to validate a request and never
reads a users table - the token *is* the user context.

Verification is done with PyJWT directly rather than through simplejwt, which
would drag ``django.contrib.auth`` (and a users table) into a service that owns
no users.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

AUTH_HEADER_PREFIX = "Bearer"


@dataclass(frozen=True)
class TokenUser:
    """The authenticated caller, reconstructed from JWT claims."""

    id: int
    role: str
    email: str | None = None
    username: str | None = None

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_admin(self) -> bool:
        return self.role == "ADMIN"

    @property
    def is_manager(self) -> bool:
        return self.role == "MANAGER"

    def __str__(self) -> str:
        return f"user:{self.id}({self.role})"


class ServiceJWTAuthentication(authentication.BaseAuthentication):
    www_authenticate_realm = "api"

    def authenticate_header(self, request) -> str:
        return f'{AUTH_HEADER_PREFIX} realm="{self.www_authenticate_realm}"'

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")

        if not header:
            return None

        parts = header.split()

        if len(parts) != 2 or parts[0] != AUTH_HEADER_PREFIX:
            raise exceptions.AuthenticationFailed(
                "Authorization header must be 'Bearer <token>'."
            )

        return self.authenticate_token(parts[1]), None

    def authenticate_token(self, token: str) -> TokenUser:
        try:
            claims = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
        except jwt.ExpiredSignatureError as exc:
            raise exceptions.AuthenticationFailed("Token has expired.") from exc
        except jwt.InvalidTokenError as exc:
            raise exceptions.AuthenticationFailed("Token is invalid.") from exc

        user_id = claims.get("user_id")
        role = claims.get("role")

        if user_id is None or not role:
            raise exceptions.AuthenticationFailed(
                "Token is missing the user_id or role claim."
            )

        return TokenUser(
            id=int(user_id),
            role=role,
            email=claims.get("email"),
            username=claims.get("username"),
        )
