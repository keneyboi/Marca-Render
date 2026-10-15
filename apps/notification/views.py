from django.shortcuts import get_object_or_404, redirect, render
from django.contrib.auth.decorators import login_required
from apps.core.models import Notification

@login_required
def notification_list_view(request):
    notifications = request.notifications.all() if hasattr(request, 'notifications') else Notification.objects.filter(recipient=request.user)
    
    # Optional: Automatically mark all as read when visiting the tab
    notifications.filter(is_read=False).update(is_read=True)
    
    context = {'notifications': notifications}
    return render(request, 'notification/notification.html', context)

@login_required
def clear_notifications(request):
    if request.method == 'POST':
        request.user.notifications.all().delete()
    return redirect('notifications')