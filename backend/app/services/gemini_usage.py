"""In-process Gemini usage/rate-limit tracking.

The Gemini API reports quota errors as HTTP 429 / ResourceExhausted. Its message
typically embeds two facts we can trust:
  - "limit: 20"            -> requests per window (per model)
  - "Please retry in 58.6s" -> server-provided retry delay

Rules of this tracker:
- Never invent a reset time: reset_at/reset_in are exposed ONLY when Gemini
  provided a retry delay.
- If no delay was provided, we mark the limiter active but optimistically allow
  the next real request through; success clears the flag (the backend
  determines the limit cleared by observing an actual successful call).
- Counters are in-memory for the current application instance only.
- No API key material is ever stored or exposed here.
"""

import re
import threading
import time


WINDOW_SECONDS = 60.0


def parse_quota_error(text: str) -> tuple[float | None, int | None]:
    """Extract (retry_after_seconds, requests_limit) from a quota error."""
    limit = retry = None
    m = re.search(r"limit:\s*(\d+)", text)
    if m:
        limit = int(m.group(1))
    m = re.search(r"retry[^.\n]*?([\d.]+)\s*s", text, flags=re.IGNORECASE)
    if m:
        retry = float(m.group(1))
    return retry, limit


class GeminiUsageTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._window_start: float | None = None  # monotonic
        self._used = 0
        self._limit: int | None = None           # learned only from 429 messages
        self._limited_until: float | None = None # monotonic deadline, if known
        self._limited_no_reset = False           # limited with unknown duration
        self._last_reason: str | None = None

    # ------------------------------------------------------------ recording --

    def record_request(self) -> None:
        """Count one outgoing LLM request."""
        with self._lock:
            now = time.monotonic()
            if self._window_start is None or now - self._window_start >= WINDOW_SECONDS:
                self._window_start = now
                self._used = 0
            self._used += 1

    def record_success(self) -> None:
        """A successful LLM response proves the limit has cleared."""
        with self._lock:
            self._limited_until = None
            self._limited_no_reset = False

    def record_rate_limited(self, retry_seconds: float | None, limit: int | None,
                            reason: str | None = None) -> None:
        with self._lock:
            if limit is not None:
                self._limit = limit
            if retry_seconds is not None:
                self._limited_until = time.monotonic() + retry_seconds + 0.5
                self._limited_no_reset = False
            else:
                self._limited_until = None
                self._limited_no_reset = True
            self._last_reason = reason

    def _expire_locked(self) -> None:
        now = time.monotonic()
        if self._window_start is not None and now - self._window_start >= WINDOW_SECONDS:
            self._window_start = now
            self._used = 0
        if self._limited_until is not None and now >= self._limited_until:
            self._limited_until = None

    # ------------------------------------------------------------- querying --

    def should_skip(self) -> bool:
        """True when we KNOW the limit is active for a determinable period."""
        with self._lock:
            self._expire_locked()
            return self._limited_until is not None

    def status(self) -> dict:
        with self._lock:
            self._expire_locked()
            limited = self._limited_until is not None or self._limited_no_reset
            reset_in: float | None = None
            if self._limited_until is not None:
                reset_in = max(round(self._limited_until - time.monotonic(), 1), 0)

            limit_known = self._limit is not None

            # Show the indicator once we have anything meaningful to say: any
            # local request activity, a learned server cap, or an active limit.
            visible = limit_known or limited or self._used > 0

            out: dict = {
                "visible": visible,
                # LOCAL count of calls this app instance made in the current
                # window. This is NOT the server's remaining quota.
                "requests_used": self._used,
                "requests_limit": self._limit,
                # Intentionally NO remaining/quota-left field: the server bucket
                # may be exhausted by other clients sharing this key.
                "limited": limited,
                "reset_in_seconds": reset_in,
            }
            if reset_in is not None:
                out["reset_at"] = round(time.time() + reset_in, 1)
            else:
                out["reset_at"] = None
            return out


gemini_usage = GeminiUsageTracker()
