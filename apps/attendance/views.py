from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse # Use this if handling AJAX requests
from apps.core.models import AttendanceRecord, Event

@login_required(login_url='landing')
@require_POST
def set_attendance(request):
    email = request.POST.get('email')
    first_name = request.POST.get('first_name')
    last_name = request.POST.get('last_name')
    student_id = request.POST.get('student_id')
    event_id = request.POST.get('event_id')
    event = get_object_or_404(Event, id=event_id)
    option = request.POST.get('session_type')

    record = None
    # Catch missing student ID / Email inputs first
    if not student_id and not email:
        messages.error(request, "Either Student ID or Email is required.")
        return redirect(request.META.get('HTTP_REFERER', '/'))

    # Fetch record safely using try/except
    try:
        if student_id:
            record = AttendanceRecord.objects.get(
                event_id=event_id, 
                student_id=student_id, 
                first_name__iexact=first_name, 
                last_name__iexact=last_name
            )
        else:
            record = AttendanceRecord.objects.get(
                event_id=event_id, 
                email=email, 
                first_name__iexact=first_name, 
                last_name__iexact=last_name
            )
    except AttendanceRecord.DoesNotExist:
        messages.error(request, "No matching attendance record found for this student.")
        return redirect(request.META.get('HTTP_REFERER', '/'))

    # 2. Update attendance fields
    if option == '1':
        record.timed_in_1 = timezone.now()
        if record.timed_in_1 > event.start_time:
            record.status = AttendanceRecord.Status.LATE
        else: 
            record.status = AttendanceRecord.Status.PRESENT
    elif option == '2':
        record.timed_out_1 = timezone.now()
        if record.status == AttendanceRecord.Status.ABSENT:
            record.status = AttendanceRecord.Status.LATE
            
    elif option == '3':
        record.timed_in_2 = timezone.now()
        if record.status == AttendanceRecord.Status.ABSENT:
            record.status = AttendanceRecord.Status.LATE
    elif option == '4':
        record.timed_out_2 = timezone.now()
        if record.status == AttendanceRecord.Status.ABSENT:
            record.status = AttendanceRecord.Status.LATE
    else:
        messages.warning(request, "Invalid option selected.")

    record.save()
    messages.success(request, "Attendance updated successfully.")

    # 3. Always return an HttpResponse or Redirect
    return redirect(request.META.get('HTTP_REFERER', '/'))