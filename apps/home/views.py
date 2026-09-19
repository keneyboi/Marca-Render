from django.shortcuts import render
from django.contrib.auth.decorators import login_required

# Create your views here.
@login_required(login_url='login')
def show_home(request):
    # Fetch user events if event model exists, or pass an empty list for now
    events = [] 
    return render(request, "home/home.html", {'events': events})