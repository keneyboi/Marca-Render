from django.urls import path
from . import views

urlpatterns = [
    path('create/', views.create_event, name='create_event'),
    path('download-template/', views.download_roster_template, name='download_template'),
    path('<int:event_id>/', views.event_detail, name='event_detail'),
]