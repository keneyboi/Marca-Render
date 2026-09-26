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
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="attendance_template.csv"'

    writer = csv.writer(response)
    writer.writerow(['student_id', 'email', 'first_name', 'last_name', 'course', 'year_level'])
    writer.writerow(['21-1234-567', '', 'John', 'Doe', 'BSCS', '3'])
    writer.writerow(['', 'jane.guest@company.com', 'Jane', 'Smith', '', ''])
    return response


@login_required(login_url='landing')
def download_attendance_template_xlsx(request):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance Template"

    headers = ['student_id', 'email', 'first_name', 'last_name', 'course', 'year_level']
    ws.append(headers)

    ws.append(['21-1234-567', '', 'John', 'Doe', 'BSCS', '3'])
    ws.append(['', 'jane.guest@company.com', 'Jane', 'Smith', '', ''])

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
    if val is None:
        return ''
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val).strip()


def _normalize_attendee(row_dict):
    clean_row = {
        str(k).strip().lower(): _clean_cell_value(v)
        for k, v in row_dict.items() if k is not None
    }

    email = clean_row.get('email', '') or None
    student_id = clean_row.get('student_id', '') or None
    first_name = clean_row.get('first_name', '')
    last_name = clean_row.get('last_name', '')

    if first_name and last_name and (student_id or email):
        return {
            'email': email,
            'student_id': student_id,
            'first_name': first_name,
            'last_name': last_name,
            'course': clean_row.get('course') or None,
            'year_level': clean_row.get('year_level') or None,
        }
    return None


def parse_roster_file(uploaded_file):
    records_to_create = []
    seen_identifiers = set()
    filename = uploaded_file.name.lower()

    def process_row(row_dict):
        attendee = _normalize_attendee(row_dict)
        if attendee:
            key = f"id:{attendee['student_id'].lower()}" if attendee['student_id'] else f"email:{attendee['email'].lower()}"
            if key not in seen_identifiers:
                seen_identifiers.add(key)
                records_to_create.append(attendee)

    if filename.endswith('.csv'):
        csv_file = io.TextIOWrapper(uploaded_file.file, encoding='utf-8-sig')
        reader = csv.DictReader(csv_file)
        for row in reader:
            process_row(row)

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
            process_row(row_dict)

        wb.close()
    else:
        raise ValueError('Unsupported file format. Please upload a .csv or .xlsx file.')

    return records_to_create


@login_required(login_url='landing')
def event_detail(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)
    all_records = event.attendance_records.all().order_by('last_name', 'first_name')

    courses = sorted({
        r.course.strip() 
        for r in all_records 
        if r.course and r.course.strip() and r.course.strip().lower() != 'nan'
    })
    
    year_levels = sorted({
        str(r.year_level).strip() 
        for r in all_records 
        if r.year_level is not None and str(r.year_level).strip() and str(r.year_level).strip().lower() != 'nan'
    }, key=lambda y: int(y) if y.isdigit() else y)

    has_student_id = all_records.exclude(student_id__isnull=True).exclude(student_id='').exclude(student_id='nan').exists()
    has_academic_info = bool(courses or year_levels)

    paginator = Paginator(all_records, 50)
    page_number = request.GET.get('page')
    records = paginator.get_page(page_number)

    st = str(event.session_type).strip()
    show_session_1 = st == '1'
    show_session_2 = st == '2'
    show_session_3 = st == '3'

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
        'total_attendance': all_records.count(),
        'present_count': all_records.filter(status=AttendanceRecord.Status.PRESENT).count(),
        'late_count': all_records.filter(status=AttendanceRecord.Status.LATE).count(),
        'absent_count': all_records.filter(status=AttendanceRecord.Status.ABSENT).count(),
    }
    return render(request, 'event/event_detail.html', context)


@login_required(login_url='landing')
@require_POST
def add_attendance_record(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)

    student_id = request.POST.get('student_id', '').strip() or None
    email = request.POST.get('email', '').strip() or None
    first_name = request.POST.get('first_name', '').strip()
    last_name = request.POST.get('last_name', '').strip()
    course = request.POST.get('course', '').strip() or None
    year_level = request.POST.get('year_level', '').strip() or None
    status = request.POST.get('status', AttendanceRecord.Status.ABSENT)

    if not first_name or not last_name:
        messages.error(request, 'First name and Last name are required.')
        return redirect('event_detail', event_id=event.id)

    if not student_id and not email:
        messages.error(request, 'Either Student ID or Email must be provided.')
        return redirect('event_detail', event_id=event.id)

    if student_id and AttendanceRecord.objects.filter(event=event, student_id__iexact=student_id).exists():
        messages.error(request, f'An attendee with Student ID "{student_id}" already exists for this event.')
        return redirect('event_detail', event_id=event.id)

    if email and AttendanceRecord.objects.filter(event=event, email__iexact=email).exists():
        messages.error(request, f'An attendee with Email "{email}" already exists for this event.')
        return redirect('event_detail', event_id=event.id)

    AttendanceRecord.objects.create(
        event=event,
        email=email,
        first_name=first_name,
        last_name=last_name,
        student_id=student_id,
        course=course,
        year_level=year_level,
        status=status,
    )

    messages.success(request, f'Attendee "{first_name} {last_name}" added successfully.')
    return redirect('event_detail', event_id=event.id)


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