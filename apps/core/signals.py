from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache_utils import bump_home_cache
from .models import Event, Folder, AttendanceRecord


@receiver([post_save, post_delete], sender=Event)
@receiver([post_save, post_delete], sender=Folder)
def invalidate_home_cache(sender, instance, **kwargs):
    bump_home_cache(instance.user_id)


@receiver([post_save, post_delete], sender=AttendanceRecord)
def invalidate_attendance_home_cache(sender, instance, **kwargs):
    if instance.event_id:
        try:
            if hasattr(instance, 'event') and instance.event:
                bump_home_cache(instance.event.user_id)
            else:
                event = Event.objects.filter(pk=instance.event_id).only('user_id').first()
                if event:
                    bump_home_cache(event.user_id)
        except Exception:
            pass
