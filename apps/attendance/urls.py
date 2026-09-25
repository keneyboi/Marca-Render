from django.urls import path
from . import views

urlpatterns = [
    path('update/', views.set_attendance, name='set_attendance'),
    path('edit/', views.set_attendance, name='edit_attendance'),
    path('clear/', views.set_attendance, name='clear_attendance'),
]
