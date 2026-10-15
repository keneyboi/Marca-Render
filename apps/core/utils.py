from .models import Notification

def notify_user(user, title, message, action_type, target_url=None):
    if user and user.is_authenticated:
        Notification.objects.create(
            recipient=user,
            title=title,
            message=message,
            action_type=action_type,
            target_url=target_url
        )