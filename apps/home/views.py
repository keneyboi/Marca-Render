from django.shortcuts import render
from django.contrib.auth.decorators import login_required

# Create your views here.
def home_view(request):
    events = request.user.organized_events.all().order_by('-start_time')
    return render(request, 'home/home.html', {'events':events})