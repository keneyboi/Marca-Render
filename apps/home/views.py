from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from apps.core.models import Event, Folder
from apps.event.forms import EventForm

@login_required
def show_home(request, folder_id=None):
    if hasattr(request.user, 'is_admin') and request.user.is_admin:
        owner_user = request.user
    elif hasattr(request.user, 'officer_profile') and request.user.officer_profile.admin:
        owner_user = request.user.officer_profile.admin
    else:
        owner_user = None

    if not owner_user:
        return render(request, 'home/home.html', {
            'events': [],
            'folders': [],
            'current_folder': None,
            'all_folders': [],
            'event_form': EventForm(),
            'status_choices': Event.Status.choices,
        })

    all_folders = Folder.objects.filter(user=owner_user)

    current_folder = None
    if folder_id:
        current_folder = get_object_or_404(Folder, id=folder_id, user=owner_user)
        events = owner_user.organized_events.filter(folder=current_folder).order_by('-start_time_1')
        folders = []
    else:
        folders = all_folders
        events = owner_user.organized_events.filter(folder__isnull=True).order_by('-start_time_1')

    form = EventForm()

    return render(request, 'home/home.html', {
        'events': events,
        'folders': folders,
        'current_folder': current_folder,
        'all_folders': all_folders,
        'event_form': form,
        'status_choices': Event.Status.choices,
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
    return redirect('home')

@login_required
@require_POST
def delete_folder(request, folder_id):
    folder = get_object_or_404(Folder, id=folder_id, user=request.user)
    folder.events.update(folder=None)
    folder.delete()
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

    if folder:
        return redirect('folder_detail', folder_id=folder.id)
    return redirect('home')