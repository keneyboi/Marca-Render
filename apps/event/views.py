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

from apps.core.models import Event, AttendanceRecord
from .forms import EventForm


def download_attendance_template_csv(request):
    """Generates and serves a clean pre-formatted CSV template."""
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="attendance_template.csv"'

    writer = csv.writer(response)
    writer.writerow(['email', 'first_name', 'last_name', 'student_id', 'course', 'year_level'])
    writer.writerow(['john.doe@example.com', 'John', 'Doe', '21-1234-567', 'BSCS', '3'])
    writer.writerow(['jane.guest@company.com', 'Jane', 'Smith', '', '', ''])
    return response

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

def event_detail(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)

    # 1. Base queryset
    base_records = event.attendance_records.all()

    # 2. Check if ANY attendee has data for these fields
    # Notice the checks handle both None and empty strings
    has_student_id = base_records.exclude(student_id__isnull=True).exclude(student_id='').exclude(student_id='nan').exists()
    has_course = base_records.exclude(course__isnull=True).exclude(course='').exclude(course='nan').exists()
    has_year = base_records.exclude(year_level__isnull=True).exclude(year_level='').exclude(year_level='nan').exists()
    has_academic_info = has_course or has_year

    # 3. Session flags (checks both '1'/'2'/'3' and string names if any)
    st = str(event.session_type).strip().upper()
    show_session_1 = st in ('1', '3', 'MORNING', 'BOTH')
    show_session_2 = st in ('2', '3', 'AFTERNOON', 'BOTH')

    # 4. Search & Filter
    records = base_records.order_by('last_name', 'first_name')
    query = request.GET.get('q', '').strip()
    status_filter = request.GET.get('status', '').strip()

    if query:
        records = records.filter(
            Q(first_name__icontains=query) |
            Q(last_name__icontains=query) |
            Q(email__icontains=query) |
            Q(student_id__icontains=query)
        )
    if status_filter:
        records = records.filter(status=status_filter)

    paginator = Paginator(records, 50)
    page_obj = paginator.get_page(request.GET.get('page'))

    # 5. Make sure EVERY flag is included in the context dictionary!
    context = {
        'event': event,
        'records': page_obj,
        'query': query,
        'status_filter': status_filter,
        'show_session_1': show_session_1,
        'show_session_2': show_session_2,
        'has_student_id': has_student_id,
        'has_academic_info': has_academic_info,
        'total_roster': base_records.count(),
        'present_count': base_records.filter(status=AttendanceRecord.Status.PRESENT).count(),
        'late_count': base_records.filter(status=AttendanceRecord.Status.LATE).count(),
        'absent_count': base_records.filter(status=AttendanceRecord.Status.ABSENT).count(),
    }
    return render(request, 'event/event_detail.html', context)