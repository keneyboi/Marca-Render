from django.urls import path
from . import views

urlpatterns = [
    path('update/', views.set_attendance, name='set_attendance'),
    path('edit/', views.set_attendance, name='edit_attendance'),
    path('clear/', views.set_attendance, name='clear_attendance'),
    path('batch/scan/', views.batch_scan, name='batch_scan'),
    path('batch/status/', views.batch_set_status, name='batch_set_status'),
]