from django.urls import path
from . import views

urlpatterns = [
    path('create/', views.create_event, name='create_event'),
    path('download-template-csv/', views.download_attendance_template_csv, name='download_template_csv'),
    path('download-template-xlsx/', views.download_attendance_template_xlsx, name='download_template_xlsx'),
    path('<int:event_id>/', views.event_detail, name='event_detail'),
    path('<int:event_id>/delete/', views.delete_event, name='delete_event'),
    path('<int:event_id>/records/add/', views.add_attendance_record, name='add_attendance_record'),
    path('<int:event_id>/records/<int:record_id>/delete/', views.delete_attendance_record, name='delete_attendance_record'),
]