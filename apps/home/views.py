from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from apps.core.models import Event
from apps.event.forms import EventForm

@login_required
def show_home(request):
    events = Event.objects.filter(user=request.user).order_by('-start_time')
    form = EventForm()
    return render(request, 'home/home.html', {
        'events': events,
        'event_form': form,
    })