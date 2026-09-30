from django.urls import path
from . import views

urlpatterns = [
    path('', views.show_home, name='home'),
    path('folder/<int:folder_id>/', views.show_home, name='folder_detail'),
    path('folder/create/', views.create_folder, name='create_folder'),
    path('folder/<int:folder_id>/delete/', views.delete_folder, name='delete_folder'),
    path('event/<int:event_id>/move/', views.move_event_folder, name='move_event'),
    path('event/<int:event_id>/remove/', views.remove_event_from_folder, name='remove_from_folder'),
    path('switch-admin/<int:admin_id>/', views.switch_admin, name='switch_admin'),
]