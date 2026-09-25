import csv
import io
import openpyxl
from django.db import transaction
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import HttpResponse
from django.db.models import Q, Count
from django.core.paginator import Paginator
from django.contrib.auth.decorators import login_required
from openpyxl.utils import get_column_letter
from django.views.decorators.http import require_POST
from apps.core.models import Event, AttendanceRecord
from .forms import EventForm


@login_required(login_url='landing')
def create_event(request):
    if request.method != 'POST':
        return redirect('home')

    form = EventForm(request.POST, request.FILES)

    # Server-side safety net (in case JS is bypassed)
    if not form.is_valid():
        messages.error(request, 'Please check the event details for errors.')
        return redirect('home')

    uploaded_file = request.FILES.get('roster_file')
    records_to_create = []

    if uploaded_file:
        try:
            records_to_create = parse_roster_file(uploaded_file)
            if not records_to_create:
                messages.warning(request, 'Roster contained no valid attendees with required fields.')
        except Exception as e:
            messages.error(request, f'Roster error: {e}')
            return redirect('home')

    try:
        with transaction.atomic():
            event = form.save(commit=False)
            event.user = request.user
            event.save()

            if records_to_create:
                attendees = [
                    AttendanceRecord(event=event, **data)
                    for data in records_to_create
                ]
                AttendanceRecord.objects.bulk_create(attendees, ignore_conflicts=True)

        messages.success(request, 'Event and roster created successfully!')
        return redirect('home')

    except Exception as e:
        messages.error(request, f'Database error while saving event: {e}')
        return redirect('home')
    
@login_required(login_url='landing')
def download_attendance_template_csv(request):
    """Generates and serves a clean pre-formatted CSV template."""
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="attendance_template.csv"'

    writer = csv.writer(response)
    writer.writerow(['email', 'first_name', 'last_name', 'student_id', 'course', 'year_level'])
    writer.writerow(['john.doe@example.com', 'John', 'Doe', '21-1234-567', 'BSCS', '3'])
    writer.writerow(['jane.guest@company.com', 'Jane', 'Smith', '', '', ''])
    return response

@login_required(login_url='landing')
def download_attendance_template_xlsx(request):
    """Generates and serves a formatted Excel (.xlsx) attendance template in memory."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance Template"

    headers = ['email', 'first_name', 'last_name', 'student_id', 'course', 'year_level']
    ws.append(headers)

    # Sample rows
    ws.append(['john.doe@example.com', 'John', 'Doe', '21-1234-567', 'BSCS', '3'])
    ws.append(['jane.guest@company.com', 'Jane', 'Smith', '', '', ''])

    # Format column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="attendance_template.xlsx"'
    wb.save(response)
    return response

def _clean_cell_value(val):
    """Normalizes cell values, converting whole floats (e.g., 3.0) to strings ('3')."""
    if val is None:
        return ''
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val).strip()

def _normalize_attendee(row_dict):
    """Sanitizes row keys/values and returns an attendee dict if valid."""
    clean_row = {
        str(k).strip().lower(): _clean_cell_value(v)
        for k, v in row_dict.items() if k is not None
    }

    email = clean_row.get('email', '')
    first_name = clean_row.get('first_name', '')
    last_name = clean_row.get('last_name', '')

    if email and first_name and last_name:
        return {
            'email': email,
            'first_name': first_name,
            'last_name': last_name,
            'student_id': clean_row.get('student_id') or None,
            'course': clean_row.get('course') or None,
            'year_level': clean_row.get('year_level') or None,
        }
    return None

def parse_roster_file(uploaded_file):
    """Parses in-memory CSV or Excel files into a deduplicated list of attendee dicts."""
    records_to_create = []
    seen_emails = set()
    filename = uploaded_file.name.lower()

    if filename.endswith('.csv'):
        csv_file = io.TextIOWrapper(uploaded_file.file, encoding='utf-8-sig')
        reader = csv.DictReader(csv_file)
        for row in reader:
            attendee = _normalize_attendee(row)
            if attendee and attendee['email'].lower() not in seen_emails:
                seen_emails.add(attendee['email'].lower())
                records_to_create.append(attendee)

    elif filename.endswith(('.xlsx', '.xlsm')):
        wb = openpyxl.load_workbook(uploaded_file, read_only=True, data_only=True)
        sheet = wb.active

        rows = sheet.iter_rows(values_only=True)
        raw_headers = next(rows, None)
        if not raw_headers:
            wb.close()
            return []

        headers = [str(h).strip().lower() if h is not None else '' for h in raw_headers]

        for row in rows:
            row_dict = {
                headers[idx]: val
                for idx, val in enumerate(row)
                if idx < len(headers)
            }
            attendee = _normalize_attendee(row_dict)
            if attendee and attendee['email'].lower() not in seen_emails:
                seen_emails.add(attendee['email'].lower())
                records_to_create.append(attendee)

        wb.close()
    else:
        raise ValueError('Unsupported file format. Please upload a .csv or .xlsx file.')

    return records_to_create

@login_required(login_url='landing')
def event_detail(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)

    records = event.attendance_records.all().order_by('last_name', 'first_name')

    courses = sorted({
        r.course.strip() 
        for r in records 
        if r.course and r.course.strip() and r.course.strip().lower() != 'nan'
    })
    
    year_levels = sorted({
        str(r.year_level).strip() 
        for r in records 
        if r.year_level is not None and str(r.year_level).strip() and str(r.year_level).strip().lower() != 'nan'
    }, key=lambda y: int(y) if y.isdigit() else y)

    has_student_id = records.exclude(student_id__isnull=True).exclude(student_id='').exclude(student_id='nan').exists()
    has_academic_info = bool(courses or year_levels)

    st = str(event.session_type).strip().upper()
    show_session_1 = st in ('1')
    show_session_2 = st in ('2')
    show_session_3 = st in ('3')

    context = {
        'event': event,
        'records': records,
        'status_choices': AttendanceRecord.Status.choices,
        'unique_courses': courses,
        'unique_year_levels': year_levels,
        'show_session_1': show_session_1,
        'show_session_2': show_session_2,
        'show_session_3': show_session_3,
        'has_student_id': has_student_id,
        'has_academic_info': has_academic_info,
        'total_attendance': records.count(),
        'present_count': records.filter(status=AttendanceRecord.Status.PRESENT).count(),
        'late_count': records.filter(status=AttendanceRecord.Status.LATE).count(),
        'absent_count': records.filter(status=AttendanceRecord.Status.ABSENT).count(),
    }
    return render(request, 'event/event_detail.html', context)

@login_required(login_url='landing')
@require_POST
def delete_attendance_record(request, event_id, record_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)
    record = get_object_or_404(AttendanceRecord, id=record_id, event=event)
    
    attendee_name = f"{record.first_name} {record.last_name}".strip()
    record.delete()
    
    messages.success(request, f'Attendee "{attendee_name}" was removed from attendance records.')
    return redirect('event_detail', event_id=event.id)

@login_required(login_url='landing')
@require_POST
def delete_event(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)
    name = event.name
    event.delete()
    messages.success(request, f'Event "{name}" and its attendance was successfully deleted.')
    return redirect('home')