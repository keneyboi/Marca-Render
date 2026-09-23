import csv
import io
from django.shortcuts import render, redirect, get_object_or_404  
from django.contrib import messages
from django.http import HttpResponse
from django.db.models import Q
from apps.core.models import Event, AttendanceRecord
from .forms import EventForm

def download_roster_template(request):
    """Generates and serves a clean pre-formatted CSV template."""
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="marca_roster_template.csv"'

    writer = csv.writer(response)
    # Header row
    writer.writerow(['email', 'first_name', 'last_name', 'student_id', 'course', 'year_level'])
    # Sample rows showing both academic and non-academic formats
    writer.writerow(['john.doe@example.com', 'John', 'Doe', '21-1234-567', 'BSCS', '3'])
    writer.writerow(['jane.guest@company.com', 'Jane', 'Smith', '', '', ''])
    return response


def create_event(request):
    if request.method == 'POST':
        form = EventForm(request.POST, request.FILES)
        if form.is_valid():
            event = form.save(commit=False)
            if request.user.is_authenticated:
                event.user = request.user
            event.save()

            # Process roster file
            uploaded_file = request.FILES.get('roster_file')
            if uploaded_file and uploaded_file.name.endswith('.csv'):
                try:
                    file_data = uploaded_file.read().decode('utf-8')
                    csv_reader = csv.DictReader(io.StringIO(file_data))
                    
                    records = []
                    for row in csv_reader:
                        # Normalize headers to lowercase stripped strings
                        clean_row = {
                            str(k).strip().lower(): str(v).strip()
                            for k, v in row.items() if k is not None
                        }

                        email = clean_row.get('email', '')
                        first_name = clean_row.get('first_name', '')
                        last_name = clean_row.get('last_name', '')

                        # Only email, first_name, and last_name are strictly required
                        if email and first_name and last_name:
                            records.append(
                                AttendanceRecord(
                                    event=event,
                                    email=email,
                                    first_name=first_name,
                                    last_name=last_name,
                                    student_id=clean_row.get('student_id', '') or None,
                                    course=clean_row.get('course', '') or None,
                                    year_level=clean_row.get('year_level', '') or None,
                                )
                            )

                    if records:
                        AttendanceRecord.objects.bulk_create(records, ignore_conflicts=True)
                except Exception as e:
                    messages.warning(request, f"Event created, but roster parsing encountered an issue: {e}")

            messages.success(request, 'Event and roster created successfully!')
            return redirect('home')
        else:
            messages.error(request, 'Error creating event. Please check the form fields.')
    return redirect('home')

def event_detail(request, event_id):
    # Ensure organizers only access their own events
    event = get_object_or_404(Event, id=event_id, user=request.user)
    
    # Search and filtering
    query = request.GET.get('q', '').strip()
    status_filter = request.GET.get('status', '').strip()
    
    records = AttendanceRecord.objects.filter(event=event)
    
    if query:
        records = records.filter(
            Q(first_name__icontains=query) |
            Q(last_name__icontains=query) |
            Q(email__icontains=query) |
            Q(student_id__icontains=query)
        )
        
    if status_filter:
        records = records.filter(status=status_filter)
        
    # High-level metrics
    total_roster = AttendanceRecord.objects.filter(event=event).count()
    present_count = AttendanceRecord.objects.filter(event=event, status='PRESENT').count()
    absent_count = AttendanceRecord.objects.filter(event=event, status='ABSENT').count()
    excused_count = AttendanceRecord.objects.filter(event=event, status='EXCUSED').count()

    context = {
        'event': event,
        'records': records,
        'query': query,
        'status_filter': status_filter,
        'total_roster': total_roster,
        'present_count': present_count,
        'absent_count': absent_count,
        'excused_count': excused_count,
    }
    return render(request, 'event/event_detail.html', context)