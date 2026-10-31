from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.http import Http404, JsonResponse
from django.urls import reverse
from apps.core.utils import notify_user
from apps.core.models import Event, Folder
from apps.event.forms import EventForm
from django.contrib import messages
from apps.core.access import get_data_owner, get_officer_admins
from apps.core.cache_utils import bump_home_cache, get_events, get_all_events, get_folders
from django.utils import timezone

@login_required
def show_home(request, folder_id=None):
    owner_user = get_data_owner(request)
    officer_admins = [] if request.user.is_admin else list(get_officer_admins(request.user))

    if not owner_user:
        return render(request, 'home.html', {
            'events': [],
            'folders': [],
            'current_folder': None,
            'all_folders': [],
            'event_form': EventForm(),
            'status_choices': Event.Status.choices,
            'officer_admins': officer_admins,
            'active_admin': owner_user,
            'spotlight_heading': "Upcoming Events",
            'spotlight_events': [],
            'is_today': False,
        })

    # Cached per owner; cleared automatically when events/folders change.
    all_folders = get_folders(owner_user)

    current_folder = None
    if folder_id:
        current_folder = next((f for f in all_folders if f.id == folder_id), None)
        if current_folder is None:
            raise Http404("Folder not found.")
        events = get_events(owner_user, folder_id)
        folders = []
    else:
        folders = all_folders
        events = get_all_events(owner_user)

    # Determine spotlight events (Today vs. Upcoming)
    now = timezone.localtime()
    today_date = now.date()

    def _to_localtime(dt):
        if not dt:
            return None
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return timezone.localtime(dt)

    today_events = [
        e for e in events
        if e.start_time_1
        and _to_localtime(e.start_time_1).date() == today_date
        and e.status != Event.Status.CANCELLED
    ]
    today_events.sort(key=lambda x: _to_localtime(x.start_time_1))

    is_today = len(today_events) > 0

    if is_today:
        spotlight_heading = "Today's Events"
        spotlight_events = today_events[:3]
    else:
        spotlight_heading = "Upcoming Events"
        future_events = [
            e for e in events
            if e.start_time_1
            and _to_localtime(e.start_time_1) >= now
            and e.status not in (Event.Status.CANCELLED, Event.Status.COMPLETED)
        ]
        future_events.sort(key=lambda x: _to_localtime(x.start_time_1))
        spotlight_events = future_events[:3]

    form = EventForm()

    return render(request, 'home.html', {
        'events': events,
        'folders': folders,
        'current_folder': current_folder,
        'all_folders': all_folders,
        'event_form': form,
        'status_choices': Event.Status.choices,
        'officer_admins': officer_admins,
        'active_admin': owner_user,
        'spotlight_heading': spotlight_heading,
        'spotlight_events': spotlight_events,
        'is_today': is_today,
    })

@login_required
@require_POST
def create_folder(request):
    name = request.POST.get('folder_name', '').strip()
    event_ids_str = request.POST.get('event_ids', '').strip()

    if name:
        folder, _ = Folder.objects.get_or_create(user=request.user, name=name)
        # If created by merging cards via drag-and-drop
        if event_ids_str:
            ids = [int(i.strip()) for i in event_ids_str.split(',') if i.strip().isdigit()]
            request.user.organized_events.filter(id__in=ids).update(folder=folder)
            bump_home_cache(request.user.pk)
        notify_user(
            request.user, 
            title="Folder Created", 
            message=f"New folder '{folder.name}' was created.", 
            action_type="folder_created",
            target_url=reverse('folder_detail', args=[folder.id])
        )
    return redirect('home')

@login_required
@require_POST
def delete_folder(request, folder_id):
    folder = get_object_or_404(Folder, id=folder_id, user=request.user)
    folder_name = folder.name
    folder.events.update(folder=None)
    folder.delete()
    bump_home_cache(request.user.pk)
    notify_user(
        request.user, 
        title="Folder Deleted", 
        message=f"{folder_name} was deleted.", 
        action_type="folder_created",
        target_url=reverse('home')
    )
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'status': 'success', 'folder_id': folder_id, 'folder_name': folder_name})
    return redirect('home')

@login_required
@require_POST
def move_event_folder(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)
    target_folder_id = request.POST.get('target_folder_id', '').strip()

    if target_folder_id and target_folder_id.isdigit():
        folder = get_object_or_404(Folder, id=int(target_folder_id), user=request.user)
        event.folder = folder
    else:
        event.folder = None
    event.save()

    return JsonResponse({
        'status': 'success',
        'event_id': event.id,
        'folder_id': target_folder_id or None
    })

@login_required
@require_POST
def remove_event_from_folder(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)
    folder = event.folder
    event.folder = None
    event.save()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'status': 'success', 'event_id': event.id})

    referer = request.headers.get('Referer') or request.META.get('HTTP_REFERER')
    if referer:
        return redirect(referer)
    if folder:
        return redirect('folder_detail', folder_id=folder.id)
    return redirect('home')


@login_required
@require_POST
def switch_admin(request, admin_id):
    admin = get_officer_admins(request.user).filter(pk=admin_id).first()
    if admin is None:
        messages.error(request, 'You are not an officer under that admin.')
    else:
        request.session['active_admin_id'] = admin.pk
    return redirect('home')