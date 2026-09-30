from django.contrib import messages
from django.core.exceptions import MultipleObjectsReturned
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from apps.core.models import AttendanceRecord, Event
from django.core.exceptions import PermissionDenied

def get_data_owner(user):
    """Returns the user who owns the data (either the Admin themselves or the Officer's Admin)."""
    if hasattr(user, 'is_admin') and user.is_admin:
        return user
    if hasattr(user, 'officer_profile') and user.officer_profile.admin:
        return user.officer_profile.admin
    raise PermissionDenied("You do not have permission to access these records.")

@login_required(login_url='landing')
@require_POST
def set_attendance(request):
    event_id = request.POST.get('event_id', '')
    if not str(event_id).isdigit():
        messages.error(request, "Invalid event ID.")
        return redirect(request.META.get('HTTP_REFERER', '/'))
    
    owner_user = get_data_owner(request.user)
    
    event = get_object_or_404(Event, id=event_id, user=owner_user)

    # Reliable fallback redirect using event.id
    fallback_redirect = request.META.get('HTTP_REFERER') or redirect('event_detail', event_id=event.id).url

    email = request.POST.get('email')
    first_name = request.POST.get('first_name')
    last_name = request.POST.get('last_name')
    student_id = request.POST.get('student_id')
    option = request.POST.get('session_type')

    # Catch missing student ID / Email inputs first
    if not student_id and not email:
        messages.error(request, "Either Student ID or Email is required.")
        return redirect(fallback_redirect)

    # 3. Query records through the event relationship & catch MultipleObjectsReturned
    try:
        if student_id:
            record = event.attendance_records.get(
                student_id=student_id, 
                first_name__iexact=first_name, 
                last_name__iexact=last_name
            )
        else:
            record = event.attendance_records.get(
                email=email, 
                first_name__iexact=first_name, 
                last_name__iexact=last_name
            )
    except AttendanceRecord.DoesNotExist:
        messages.error(request, "No matching attendance record found for this student.")
        return redirect(fallback_redirect)
    except MultipleObjectsReturned:
        messages.error(request, "Multiple matching records found — please contact support.")
        return redirect(fallback_redirect)

    """Make this a derived state rather than a stored attribute to make 
    it more flexible when an event organizer wants to change the late time
    
    This allows for situations wherein organizers of said event decide to be
    lenient and change the late time to allow students not be marked late
    """
    
    # 4. Update attendance fields
    if option == '1':
        record.timed_in_1 = timezone.now()
        if record.timed_in_1 > event.start_time_1:
            record.status = AttendanceRecord.Status.LATE
        else: 
            record.status = AttendanceRecord.Status.PRESENT
    elif option == '2':
        record.timed_out_1 = timezone.now()
        if record.status == AttendanceRecord.Status.ABSENT:
            record.status = AttendanceRecord.Status.LATE
    elif option == '3':
        record.timed_in_2 = timezone.now()
        if record.timed_in_2 > event.start_time_2:
            record.status = AttendanceRecord.Status.LATE
        else: 
            record.status = AttendanceRecord.Status.PRESENT
    elif option == '4':
        record.timed_out_2 = timezone.now()
        if record.status == AttendanceRecord.Status.ABSENT:
            record.status = AttendanceRecord.Status.LATE
    else:
        messages.warning(request, "Invalid option selected.")
        return redirect(fallback_redirect)

    record.save()
    messages.success(request, "Attendance updated successfully.")

    # 5. Return redirect with fallback
    return redirect(fallback_redirect)