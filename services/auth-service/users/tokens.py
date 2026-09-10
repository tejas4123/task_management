"""JWT issuance.

Access tokens carry ``user_id``, ``role`` and ``email`` so downstream services
can authorize a request from the token alone, without calling this service.
"""

from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


def build_refresh_token(user: User) -> RefreshToken:
    """Return a refresh token carrying the service-wide claims.

    ``RefreshToken.access_token`` copies these claims onto the access token, so
    tokens minted by ``/auth/refresh/`` keep the role claim too.
    """
    refresh = RefreshToken.for_user(user)
    # simplejwt stringifies the id claim; downstream services compare it against
    # integer ids, so pin the type here rather than coercing in three services.
    refresh["user_id"] = user.id
    refresh["role"] = user.role
    refresh["email"] = user.email
    refresh["username"] = user.username
    return refresh


def issue_token_pair(user: User) -> dict[str, str]:
    refresh = build_refresh_token(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }
