from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache_utils import bump_home_cache
from .models import Event, Folder


@receiver([post_save, post_delete], sender=Event)
@receiver([post_save, post_delete], sender=Folder)
def invalidate_home_cache(sender, instance, **kwargs):
    bump_home_cache(instance.user_id)