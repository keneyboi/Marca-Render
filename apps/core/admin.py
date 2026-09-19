from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Event, AttendanceRecord

# Register your models here.
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name']

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'status', 'start_time', 'end_time'] 

@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['event', 'first_name', 'last_name', 'email', 'student_id', 'course', 'year_level', 'status', 'timed_in', 'timed_out']
