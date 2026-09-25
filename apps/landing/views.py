from django.shortcuts import render, redirect

# Create your views here.
def landing_view(request):
    return render(request, 'landing/landing.html')