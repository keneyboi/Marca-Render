from django.shortcuts import render

# Create your views here.
def show_officer(request):
    return render(request, "officer/officer.html", )