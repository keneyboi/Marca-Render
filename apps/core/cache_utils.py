"""Small cache helpers for the home page (events + folders).

Each owner has a "version" number stored in the cache. Cached entries include
that version in their key. Bumping the version (on any change to the owner's
events or folders) makes every old entry unreachable at once, so there is no
need to track and delete individual keys. Entries also expire after TTL as a
safety net.
"""
import time

from django.core.cache import cache

TTL = 300  # seconds


def _version_key(owner_id):
    return f'home:ver:{owner_id}'


def _get_version(owner_id):
    key = _version_key(owner_id)
    version = cache.get(key)
    if version is None:
        cache.add(key, time.time_ns(), None)  # no-op if another request won
        version = cache.get(key) or time.time_ns()
    return version


def bump_home_cache(owner_id):
    """Invalidate every cached home-page entry for this owner."""
    if owner_id is not None:
        cache.set(_version_key(owner_id), time.time_ns(), None)


def _key(owner_id, name):
    return f'home:{owner_id}:{_get_version(owner_id)}:{name}'


def get_folders(owner):
    """All of the owner's folders, each with .item_count (no per-folder query)."""
    from django.db.models import Count
    from apps.core.models import Folder

    key = _key(owner.pk, 'folders')
    folders = cache.get(key)
    if folders is None:
        folders = list(
            Folder.objects.filter(user=owner).annotate(item_count=Count('events'))
        )
        cache.set(key, folders, TTL)
    return folders


def get_events(owner, folder_id=None):
    """Events in one folder (or the root when folder_id is None), newest first."""
    key = _key(owner.pk, f'events:{folder_id or "root"}')
    events = cache.get(key)
    if events is None:
        qs = owner.organized_events.all()
        qs = qs.filter(folder_id=folder_id) if folder_id else qs.filter(folder__isnull=True)
        events = list(qs.order_by('-start_time_1'))
        cache.set(key, events, TTL)
    return events