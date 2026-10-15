from django.urls import path
from . import views

urlpatterns = [
    path('', views.notification_list_view, name='notifications'),
    path('clear/', views.clear_notifications, name='clear_notifications'),
]