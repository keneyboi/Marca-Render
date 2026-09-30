from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Event, AttendanceRecord, Officer

# Register your models here.
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'type']
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Role', {'fields': ('type',)}),
    )

    # Include 'type' when creating a new user through admin
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Custom Role', {'fields': ('type',)}),
    )

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'status', 'session_type', 'start_time_1', 'end_time_1', 'start_time_2', 'end_time_2'] 

@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['event', 'first_name', 'last_name', 'email', 'student_id', 'course', 'year_level', 'status', 'timed_in_1', 'timed_out_1', 'timed_in_2', 'timed_out_2']

@admin.register(Officer)
class OfficerAdmin(admin.ModelAdmin):
    list_display = ['officer', 'admin']
