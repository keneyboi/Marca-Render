from django.urls import path
from . import views

urlpatterns = [
    path('', views.show_officer, name='officer'),
    path('create/', views.create_officer, name='create_officer'),
    path('delete/<int:officer_id>/', views.delete_officer, name='delete_officer'),
]