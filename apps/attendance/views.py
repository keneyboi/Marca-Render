from django.contrib import messages
from django.core.exceptions import MultipleObjectsReturned
from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from apps.core.models import AttendanceRecord, Event
from django.core.exceptions import PermissionDenied
from apps.core.access import get_data_owner


def _is_ajax(request):
    return request.headers.get('X-Requested-With') == 'XMLHttpRequest'

# the main optimization, returnm a json if request is an ajax if else do the same thing as before
def _respond(request, ok, message, redirect_to, level=None, extra=None):
    if _is_ajax(request):
        data = {'ok': ok, 'message': message}
        if extra:
            data.update(extra)
        return JsonResponse(data, status=200 if ok else 400)

    level = level or (messages.success if ok else messages.error)
    level(request, message)
    return redirect(redirect_to)

# time formatter
def _clock(dt):
    return timezone.localtime(dt).strftime('%H:%M') if dt else '\u2014'

# one query of counts for status cards
def _status_counts(event):
    raw = {
        row['status']: row['n']
        for row in event.attendance_records.values('status').annotate(n=Count('id'))
    }
    return {
        'present': raw.get(AttendanceRecord.Status.PRESENT, 0),
        'late': raw.get(AttendanceRecord.Status.LATE, 0),
        'absent': raw.get(AttendanceRecord.Status.ABSENT, 0),
        'total': sum(raw.values()),
    }


@login_required(login_url='landing')
@require_POST
def set_attendance(request):
    event_id = request.POST.get('event_id', '')
    if not str(event_id).isdigit():
        return _respond(request, False, "Invalid event ID.", request.META.get('HTTP_REFERER', '/'))
    
    owner_user = get_data_owner(request)
    
    if owner_user is None:
        raise PermissionDenied("You do not have permission to edit these records.")
    
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
        return _respond(request, False, "Either Student ID or Email is required.", fallback_redirect)

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
        return _respond(request, False, "No matching attendance record found for this student.", fallback_redirect)
    except MultipleObjectsReturned:
        return _respond(request, False, "Multiple matching records found \u2014 please contact support.", fallback_redirect)

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
        return _respond(request, False, "Invalid option selected.", fallback_redirect, level=messages.warning)

    record.edited_by = request.user
    record.save()

    # Everything the page needs to patch ONE row + the counters, nothing more
    return _respond(
        request, True,
        f"Attendance updated for {record.first_name} {record.last_name}.",
        fallback_redirect,
        extra={
            'record_id': record.id,
            'status': record.status,
            'status_label': record.get_status_display(),
            'timed_in_1': _clock(record.timed_in_1),
            'timed_out_1': _clock(record.timed_out_1),
            'timed_in_2': _clock(record.timed_in_2),
            'timed_out_2': _clock(record.timed_out_2),
            'edited_by': request.user.get_full_name() or request.user.username,
            'counts': _status_counts(event),
        },
    )