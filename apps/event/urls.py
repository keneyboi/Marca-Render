from django.urls import path
from . import views

urlpatterns = [
    path('create/', views.create_event, name='create_event'),
    path('download-template-csv/', views.download_attendance_template_csv, name='download_template_csv'),
    path('download-template-xlsx/', views.download_attendance_template_xlsx, name='download_template_xlsx'),
    path('<int:event_id>/', views.event_detail, name='event_detail'),
]