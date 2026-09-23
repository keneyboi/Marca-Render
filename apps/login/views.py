from django.shortcuts import render, redirect
from .forms import CustomLoginForm
from django.contrib.auth import login, logout

def show_login(request):
    if request.method == 'POST':
        form = CustomLoginForm(request, data=request.POST)
        
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            return redirect('home')
    else:
        form = CustomLoginForm()
    
    return render(request, "login/login.html", {'form' : form})

def logout_view(request):
        logout(request)
        return redirect('login')