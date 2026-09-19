from django.shortcuts import render
from django.contrib.auth.views import LoginView, LogoutView

# Create your views here.
class CustomLoginView(LoginView):
    template_name = 'login/login.html'
    redirect_authenticated_user = True

class CustomLogoutView(LogoutView):
    pass