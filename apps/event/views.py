import csv
import io
import re
from urllib.parse import quote
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from django.db import transaction, IntegrityError
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django.db.models import Q, Count
from django.core.paginator import Paginator
from django.utils.functional import cached_property
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from apps.core.models import Event, AttendanceRecord
from .forms import EventForm, EditEventForm
from django.core.exceptions import PermissionDenied
from apps.core.access import get_data_owner
from apps.core.cache_utils import bump_home_cache
from apps.core.utils import notify_user
from django.urls import reverse
from django.views.decorators.cache import never_cache
from django.views.decorators.vary import vary_on_headers
from datetime import datetime

def _clean_cell_value(val):
    if val is None:
        return ''
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val).strip()


def _clean_header(val):
    """Normalizes header keys: strips punctuation/symbols, replaces - and _ with spaces."""
    s = str(val or '').strip().lower()
    s = s.replace('_', ' ').replace('-', ' ')
    s = re.sub(r'[^\w\s]', '', s)
    return ' '.join(s.split())


FIRST_NAME_KEYS = {'first name', 'firstname', 'given name', 'givenname', 'fname', 'first'}
LAST_NAME_KEYS = {'last name', 'lastname', 'surname', 'family name', 'familyname', 'lname', 'last'}
FULL_NAME_KEYS = {'full name', 'fullname', 'name', 'student name', 'complete name', 'attendee name'}
STUDENT_ID_KEYS = {'student id', 'studentid', 'id number', 'id no', 'idno', 'id', 'sid', 'school id', 'student number'}
EMAIL_KEYS = {'email', 'email address', 'e mail', 'e mail address', 'mail', 'gmail', 'gmail address'}
COURSE_KEYS = {'course', 'program', 'degree', 'track', 'strand'}
YEAR_LEVEL_KEYS = {'year level', 'yearlevel', 'year', 'level', 'yr level', 'grade level'}


def _get_field_by_keys(row_dict, key_set):
    for k in key_set:
        val = row_dict.get(k)
        if val:
            return val
    return ''


def _normalize_attendee(row_dict, row_number):
    """
    Sanitizes row keys/values and handles both:
    1. Separate first name and last name columns (with any alias: first_name, surname, etc.)
    2. A single 'full name' / 'name' column (e.g. 'LASTNAME, FIRSTNAME' or 'Firstname Lastname')
    Accepts aliases for all fields (id number -> student_id, gmail -> email, etc.).
    """
    clean_row = {
        _clean_header(k): _clean_cell_value(v)
        for k, v in row_dict.items() if k is not None
    }

    # Ignore trailing empty lines
    if not any(clean_row.values()):
        return None

    # Handle First and Last Name resolution
    first_name = _get_field_by_keys(clean_row, FIRST_NAME_KEYS)
    last_name = _get_field_by_keys(clean_row, LAST_NAME_KEYS)

    if not first_name or not last_name:
        # Check for unified "full name" / "name" / "student name" column
        full_name = _get_field_by_keys(clean_row, FULL_NAME_KEYS)
        if full_name:
            if ',' in full_name:
                parts = full_name.split(',', 1)
                last_name = parts[0].strip().title()
                first_name = parts[1].strip().title()
            else:
                parts = full_name.split()
                if len(parts) >= 2:
                    first_name = ' '.join(parts[:-1]).title()
                    last_name = parts[-1].title()
                else:
                    first_name = full_name.strip().title()
                    last_name = ''

    # Handle Student ID aliases
    student_id = _get_field_by_keys(clean_row, STUDENT_ID_KEYS) or None

    # Handle Email aliases
    email = _get_field_by_keys(clean_row, EMAIL_KEYS) or None

    # Validation guards
    if not first_name:
        raise ValueError(f"Row {row_number}: First name is missing.")
    if not last_name:
        raise ValueError(f"Row {row_number}: Last name is missing.")
    if not student_id and not email:
        raise ValueError(f"Row {row_number} ({first_name} {last_name}): Either Student ID or Email must be provided.")

    return {
        'first_name': first_name,
        'last_name': last_name,
        'student_id': student_id,
        'email': email,
        'course': _get_field_by_keys(clean_row, COURSE_KEYS) or None,
        'year_level': _get_field_by_keys(clean_row, YEAR_LEVEL_KEYS) or None,
    }


def parse_roster_file(uploaded_file):
    records_to_create = []
    seen_student_ids = set()
    seen_emails = set()
    filename = uploaded_file.name.lower()

    def is_header_row(cleaned_cells):
        norm_cells = {_clean_header(c) for c in cleaned_cells if c is not None}
        has_separate_names = bool(norm_cells & FIRST_NAME_KEYS) and bool(norm_cells & LAST_NAME_KEYS)
        has_full_name = bool(norm_cells & FULL_NAME_KEYS)
        has_id = bool(norm_cells & STUDENT_ID_KEYS)
        has_email = bool(norm_cells & EMAIL_KEYS)
        return (has_separate_names or has_full_name) and (has_id or has_email)

    if filename.endswith('.csv'):
        raw_content = uploaded_file.read()
        try:
            text = raw_content.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw_content.decode('latin-1')

        lines = text.splitlines()

        header_idx = -1
        for idx, line in enumerate(lines):
            row_items = [item.strip().lower() for item in line.split(',')]
            if is_header_row(row_items):
                header_idx = idx
                break

        if header_idx == -1:
            raise ValueError("Could not find valid column headers. Ensure the file has Name ('first_name'/'last_name' or 'full name') and an ID or Email.")

        reader = csv.DictReader(lines[header_idx:])
        for idx, row in enumerate(reader, start=header_idx + 2):
            attendee = _normalize_attendee(row, row_number=idx)
            if attendee is None:
                continue

            sid, em = attendee['student_id'], attendee['email']
            if sid:
                sid_lower = sid.lower()
                if sid_lower in seen_student_ids:
                    raise ValueError(f"Row {idx}: Duplicate Student ID '{sid}' found in file.")
                seen_student_ids.add(sid_lower)
            if em:
                em_lower = em.lower()
                if em_lower in seen_emails:
                    raise ValueError(f"Row {idx}: Duplicate Email '{em}' found in file.")
                seen_emails.add(em_lower)

            records_to_create.append(attendee)

    elif filename.endswith(('.xlsx', '.xlsm')):
        wb = openpyxl.load_workbook(uploaded_file, read_only=True, data_only=True)
        sheet = wb.active

        rows_iter = sheet.iter_rows(values_only=True)
        headers = None
        start_row_num = 0

        for idx, row in enumerate(rows_iter, start=1):
            cleaned = [str(cell).strip().lower() if cell is not None else '' for cell in row]
            if is_header_row(cleaned):
                headers = cleaned
                start_row_num = idx
                break

        if not headers:
            wb.close()
            raise ValueError("Could not find valid column headers. Ensure the sheet has Name ('first_name'/'last_name' or 'full name') and an ID or Email.")

        for idx, row in enumerate(rows_iter, start=start_row_num + 1):
            row_dict = {
                headers[c_idx]: val
                for c_idx, val in enumerate(row)
                if c_idx < len(headers)
            }
            attendee = _normalize_attendee(row_dict, row_number=idx)
            if attendee is None:
                continue

            sid, em = attendee['student_id'], attendee['email']
            if sid:
                sid_lower = sid.lower()
                if sid_lower in seen_student_ids:
                    wb.close()
                    raise ValueError(f"Row {idx}: Duplicate Student ID '{sid}' found in file.")
                seen_student_ids.add(sid_lower)
            if em:
                em_lower = em.lower()
                if em_lower in seen_emails:
                    wb.close()
                    raise ValueError(f"Row {idx}: Duplicate Email '{em}' found in file.")
                seen_emails.add(em_lower)

            records_to_create.append(attendee)

        wb.close()
    else:
        raise ValueError('Unsupported file format. Please upload a .csv or .xlsx file.')

    if not records_to_create:
        raise ValueError("Roster contains no valid attendee records.")

    return records_to_create


@login_required(login_url='landing')
@never_cache
@vary_on_headers('X-Requested-With')
def create_event(request):
    if request.method != 'POST':
        return redirect('home')

    form = EventForm(request.POST, request.FILES)

    if not form.is_valid():
        messages.error(request, 'Please check the event details for errors.')
        return redirect('home')

    uploaded_file = request.FILES.get('roster_file')
    if not uploaded_file:
        messages.error(request, 'Please upload a roster file.')
        return redirect('home')

    # Parse and validate the file BEFORE creating the event
    try:
        records_to_create = parse_roster_file(uploaded_file)
    except Exception as e:
        # Abort immediately if any error occurs
        messages.error(request, f'Roster error: {e}')
        return redirect('home')

    # Atomic creation: If any database error occurs, roll back the event completely
    try:
        with transaction.atomic():
            event = form.save(commit=False)
            event.user = request.user
            event.save()

            attendees = [
                AttendanceRecord(event=event, status=AttendanceRecord.Status.ABSENT, **data)
                for data in records_to_create
            ]
            AttendanceRecord.objects.bulk_create(attendees)
            bump_home_cache(event.user_id)

        notify_user(
            request.user, 
            title="Event Created", 
            message=f"Successfully created event '{event.name}'.", 
            action_type="event_created",
            target_url=reverse('event_detail', args=[event.id]) 
        )
        messages.success(request, f'Event "{event.name}" and {len(records_to_create)} attendee records created successfully!')
        return redirect('home')

    except Exception as e:
        messages.error(request, f'Failed to create event: {e}')
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


class _KnownCountPaginator(Paginator):
    """Paginator that reuses a count we already computed (skips its COUNT query)."""

    def __init__(self, *args, known_count, **kwargs):
        super().__init__(*args, **kwargs)
        self._known_count = known_count

    @cached_property
    def count(self):
        return self._known_count


@login_required(login_url='landing')
def event_detail(request, event_id):
    owner_user = get_data_owner(request)
    if owner_user is None:
        raise PermissionDenied("You do not have permission to access these records.")

    event = get_object_or_404(Event, id=event_id, user=owner_user)
    records_qs = event.attendance_records
    all_records = records_qs.select_related('edited_by').order_by('last_name', 'first_name')

    folder = event.folder
    
    # Distinct values only (a few rows) instead of loading the whole roster.
    courses = sorted({
        c.strip()
        for c in records_qs.order_by().values_list('course', flat=True).distinct()
        if c and c.strip() and c.strip().lower() != 'nan'
    })

    year_levels = sorted({  
        str(y).strip()
        for y in records_qs.order_by().values_list('year_level', flat=True).distinct()
        if y is not None and str(y).strip() and str(y).strip().lower() != 'nan'
    }, key=lambda y: (0, int(y)) if str(y).isdigit() else (1, str(y)))

    incomplete_filter = Q(status__in=[
        AttendanceRecord.Status.INCOMPLETE,
        AttendanceRecord.Status.INCOMPLETE_PRESENT,
        AttendanceRecord.Status.INCOMPLETE_LATE,
        AttendanceRecord.Status.INCOMPLETE_ABSENT,
    ])
    stats = records_qs.aggregate(
        total=Count('id'),
        present=Count('id', filter=Q(status=AttendanceRecord.Status.PRESENT)),
        late=Count('id', filter=Q(status=AttendanceRecord.Status.LATE)),
        incomplete=Count('id', filter=incomplete_filter),
        absent=Count('id', filter=Q(status=AttendanceRecord.Status.ABSENT)),
        with_student_id=Count(
            'id',
            filter=~Q(student_id__isnull=True) & ~Q(student_id='') & ~Q(student_id='nan'),
        ),
    )
    has_student_id = stats['with_student_id'] > 0
    has_academic_info = bool(courses or year_levels)

    filtered = _apply_filters(all_records, request.GET)
    is_filtered = any(request.GET.get(k, '').strip() for k in ('q', 'status', 'course', 'year'))

    if is_filtered:
        paginator = Paginator(filtered, 50)
    else:
        paginator = _KnownCountPaginator(filtered, 50, known_count=stats['total'])
    records = paginator.get_page(request.GET.get('page'))

    qs_params = request.GET.copy()
    qs_params.pop('page', None)
    extra_qs = qs_params.urlencode()

    st = str(event.session_type).strip()
    show_session_1 = st == '1'
    show_session_2 = st == '2'
    show_session_3 = st == '3'

    context = {
        'folder': folder,
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
        'total_attendance': stats['total'],
        'present_count': stats['present'],
        'late_count': stats['late'],
        'incomplete_count': stats['incomplete'],
        'absent_count': stats['absent'],
        'request': request,
        'is_filtered': is_filtered,
        'extra_qs': qs_params.urlencode(),
        'q': request.GET.get('q', ''),
        'sel_status': request.GET.get('status', '').upper(),
        'sel_course': request.GET.get('course', ''),
        'sel_year': request.GET.get('year', ''),
    }
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'rows_html': render_to_string('event/_roster_rows.html', context, request=request),
            'pagination_html': render_to_string('event/_pagination.html', context, request=request),
            'count': paginator.count,
        })
    return render(request, 'event/event_detail.html', context)

INCOMPLETE_STATUSES = [
    AttendanceRecord.Status.INCOMPLETE,
    AttendanceRecord.Status.INCOMPLETE_PRESENT,
    AttendanceRecord.Status.INCOMPLETE_LATE,
    AttendanceRecord.Status.INCOMPLETE_ABSENT,
]

def _apply_filters(qs, params):
    q = params.get('q', '').strip()
    for term in q.split():  # every word must match, so "john doe" works
        qs = qs.filter(
            Q(first_name__icontains=term) | Q(last_name__icontains=term) |
            Q(email__icontains=term) | Q(student_id__icontains=term)
        )

    status = params.get('status', '').strip().upper()
    if status == 'INCOMPLETE':
        qs = qs.filter(status__in=INCOMPLETE_STATUSES)
    elif status:
        qs = qs.filter(status=status)

    course = params.get('course', '').strip()
    if course:
        qs = qs.filter(course=course)

    year = params.get('year', '').strip()
    if year:
        qs = qs.filter(year_level=year)

    return qs


@login_required(login_url='landing')
def export_event_xlsx(request, event_id):
    owner_user = get_data_owner(request)
    if owner_user is None:
        raise PermissionDenied("You do not have permission to access these records.")

    event = get_object_or_404(Event, id=event_id, user=owner_user)
    records_qs = event.attendance_records.select_related('edited_by').order_by('last_name', 'first_name')
    records_qs = _apply_filters(records_qs, request.GET)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance Roster"
    ws.views.sheetView[0].showGridLines = True

    # Build Header Columns based on Session Type
    headers = ["#", "Student ID", "First Name", "Last Name", "Email", "Course", "Year Level"]
    if event.session_type == Event.SessionType.SESSION_1:
        headers += ["Time In", "Status"]
    elif event.session_type == Event.SessionType.SESSION_2:
        headers += ["Time In", "Time Out", "Status"]
    elif event.session_type == Event.SessionType.SESSION_3:
        headers += ["Time In 1", "Time Out 1", "Time In 2", "Time Out 2", "Status"]
    else:
        headers += ["Time In", "Status"]

    if request.user.is_admin:
        headers.append("Edited By")

    ws.append(headers)

    # Header styling
    header_fill = PatternFill(start_color="2B2320", end_color="2B2320", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style="thin", color="DCD4CC"),
        right=Side(style="thin", color="DCD4CC"),
        top=Side(style="thin", color="DCD4CC"),
        bottom=Side(style="thin", color="DCD4CC"),
    )

    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws.row_dimensions[1].height = 28

    # Status badge styles matching theme colors
    status_styles = {
        'Present': (PatternFill(start_color="E6F4EA", end_color="E6F4EA", fill_type="solid"), Font(name="Calibri", size=10, bold=True, color="137333")),
        'Late': (PatternFill(start_color="FEF7E0", end_color="FEF7E0", fill_type="solid"), Font(name="Calibri", size=10, bold=True, color="B06000")),
        'Incomplete': (PatternFill(start_color="FFF0EB", end_color="FFF0EB", fill_type="solid"), Font(name="Calibri", size=10, bold=True, color="C5431F")),
        'Absent': (PatternFill(start_color="FCE8E6", end_color="FCE8E6", fill_type="solid"), Font(name="Calibri", size=10, bold=True, color="C5221F")),
    }

    def _fmt_time(dt):
        if not dt:
            return "—"
        return timezone.localtime(dt).strftime('%I:%M %p')

    data_font = Font(name="Calibri", size=10, color="2B2320")
    status_col_idx = headers.index("Status") + 1

    for idx, r in enumerate(records_qs, start=1):
        row_data = [
            idx,
            r.student_id or "—",
            r.last_name or "",
            r.first_name or "",
            r.email or "—",
            r.course or "—",
            str(r.year_level) if r.year_level else "—",
        ]
        status_label = r.display_status_label

        if event.session_type == Event.SessionType.SESSION_1:
            row_data += [_fmt_time(r.timed_in_1), status_label]
        elif event.session_type == Event.SessionType.SESSION_2:
            row_data += [_fmt_time(r.timed_in_1), _fmt_time(r.timed_out_1), status_label]
        elif event.session_type == Event.SessionType.SESSION_3:
            row_data += [
                _fmt_time(r.timed_in_1),
                _fmt_time(r.timed_out_1),
                _fmt_time(r.timed_in_2),
                _fmt_time(r.timed_out_2),
                status_label,
            ]
        else:
            row_data += [_fmt_time(r.timed_in_1), status_label]

        if request.user.is_admin:
            edited_str = (r.edited_by.get_full_name() or r.edited_by.username) if r.edited_by else "—"
            row_data.append(edited_str)

        ws.append(row_data)
        current_row = ws.max_row
        ws.row_dimensions[current_row].height = 22

        for col_idx, cell in enumerate(ws[current_row], start=1):
            cell.font = data_font
            cell.border = thin_border
            header_name = headers[col_idx - 1]
            if col_idx == status_col_idx:
                fill, font = status_styles.get(status_label, (None, data_font))
                if fill:
                    cell.fill = fill
                cell.font = font
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif header_name in ["#", "Student ID", "Year Level"] or "Time" in header_name:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    ws.auto_filter.ref = ws.dimensions

    safe_title = re.sub(r'[\/:*?"<>|]', '_', event.name).strip() or "Event"
    filename = f"{safe_title}_Attendance.xlsx"

    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'
    wb.save(response)
    return response



@login_required(login_url='landing')
@require_POST
def add_attendance_record(request, event_id):
    owner_user = get_data_owner(request)
    if owner_user is None:
        raise PermissionDenied("You do not have permission to edit these records.")

    event = get_object_or_404(Event, id=event_id, user=owner_user)
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    def _err(msg):
        if is_ajax:
            return JsonResponse({'ok': False, 'message': msg}, status=400)
        messages.error(request, msg)
        return redirect('event_detail', event_id=event.id)

    student_id = request.POST.get('student_id', '').strip() or None
    email = request.POST.get('email', '').strip() or None
    first_name = request.POST.get('first_name', '').strip()
    last_name = request.POST.get('last_name', '').strip()
    course = request.POST.get('course', '').strip() or None
    year_level = request.POST.get('year_level', '').strip() or None
    status = request.POST.get('status', AttendanceRecord.Status.ABSENT)
    session_option = request.POST.get('session_type', '').strip()
    mark_attendance = request.POST.get('mark_attendance') in ('true', '1', 'on', True)

    if not first_name or not last_name:
        return _err('First name and Last name are required.')

    if not student_id and not email:
        return _err('Either Student ID or Email must be provided.')

    if student_id and AttendanceRecord.objects.filter(event=event, student_id__iexact=student_id).exists():
        return _err(f'An attendee with Student ID "{student_id}" already exists for this event.')

    if email and AttendanceRecord.objects.filter(event=event, email__iexact=email).exists():
        return _err(f'An attendee with Email "{email}" already exists for this event.')

    from apps.attendance.views import apply_scan, allowed_options, _row_payload, _status_counts

    try:
        with transaction.atomic():
            record = AttendanceRecord.objects.create(
                event=event,
                email=email,
                first_name=first_name,
                last_name=last_name,
                student_id=student_id,
                course=course,
                year_level=year_level,
                status=status,
                edited_by=request.user,
            )

            if mark_attendance and session_option in allowed_options(event):
                apply_scan(record, event, session_option, timezone.now())
                record.save()
    except IntegrityError:
        ident = student_id or email
        return _err(f'An attendee with identifier "{ident}" already exists for this event.')

    # Notify the admin (owner_user)
    actor_name = request.user.get_full_name() or request.user.username
    if request.user != owner_user:
        notify_msg = f"Officer {actor_name} added unregistered attendee '{first_name} {last_name}' to {event.name}."
    else:
        notify_msg = f"Attendee '{first_name} {last_name}' added to {event.name}."

    notify_user(
        owner_user,
        title="Attendee Added",
        message=notify_msg,
        action_type="attendee_added",
        target_url=reverse('event_detail', args=[event.id])
    )

    if is_ajax:
        has_academic_filter = (Q(course__isnull=False) & ~Q(course='')) | (Q(year_level__isnull=False) & ~Q(year_level=''))
        has_student_id = bool(record.student_id) or event.attendance_records.exclude(id=record.id).exclude(student_id__isnull=True).exclude(student_id='').exists()
        has_academic_info = bool(record.course or record.year_level) or event.attendance_records.exclude(id=record.id).filter(has_academic_filter).exists()

        row_html = render_to_string(
            'event/attendance_row_snippet.html',
            {
                'record': record,
                'event': event,
                'has_student_id': has_student_id,
                'has_academic_info': has_academic_info,
                'show_session_1': str(event.session_type) == '1',
                'show_session_2': str(event.session_type) == '2',
                'show_session_3': str(event.session_type) == '3',
                'request': request,
            },
            request=request
        )
        return JsonResponse({
            'ok': True,
            'message': f'Attendee "{first_name} {last_name}" added successfully.',
            'record_id': record.id,
            'row': _row_payload(record),
            'row_html': row_html,
            'counts': _status_counts(event),
            **_row_payload(record),
        })

    messages.success(request, f'Attendee "{first_name} {last_name}" added successfully.')
    return redirect('event_detail', event_id=event.id)


@login_required(login_url='landing')
@require_POST
def delete_attendance_record(request, event_id, record_id):
    if not request.user.is_admin:
        raise PermissionDenied("Only administrators can delete attendance records.")

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


@login_required(login_url='landing')
@require_POST
def edit_event(request, event_id):
    event = get_object_or_404(Event, id=event_id, user=request.user)

    # Use EditEventForm instead of EventForm
    form = EditEventForm(request.POST, instance=event)

    if not form.is_valid():
        first_error = next(iter(form.errors.values()))[0] if form.errors else 'Invalid input.'
        messages.error(request, f'Failed to update event: {first_error}')
        return redirect('home')

    try:
        updated_event = form.save()
        notify_user(
            request.user, 
            title="Event Updated", 
            message=f"Details for '{event.name}' were updated.", 
            action_type="event_edited"
        )
        messages.success(request, f'Event "{updated_event.name}" was successfully updated!')
    except Exception as e:
        messages.error(request, f'Failed to update event: {e}')

    return redirect('home')





"check lang sah"

def _combine_time(value, existing, fallback):
    """
    'HH:MM' + a date -> aware datetime. The date comes from the existing
    recorded scan if there is one, else from the event time it belongs to.
    """
    value = (value or '').strip()
    if not value:
        return None
    for fmt in ('%H:%M', '%H:%M:%S'):
        try:
            t = datetime.strptime(value, fmt).time()
            break
        except ValueError:
            continue
    else:
        raise ValueError('Invalid time.')
    base = existing or fallback
    day = timezone.localtime(base).date()
    return timezone.make_aware(datetime.combine(day, t))


@login_required(login_url='landing')
@require_POST
def edit_attendance_times(request, event_id, record_id):
    owner_user = get_data_owner(request)
    if owner_user is None:
        raise PermissionDenied("You do not have permission to edit these records.")

    event = get_object_or_404(Event, id=event_id, user=owner_user)

    from apps.attendance.views import allowed_options, recompute_status, _row_payload, _status_counts

    def err(msg):
        return JsonResponse({'ok': False, 'message': msg}, status=400)

    ordered = [('1', 'timed_in_1'), ('2', 'timed_out_1'), ('3', 'timed_in_2'), ('4', 'timed_out_2')]
    allowed = allowed_options(event)
    fields = [f for opt, f in ordered if opt in allowed]

    # Which event time supplies the date when the scan doesn't exist yet
    fallbacks = {
        'timed_in_1': event.start_time_1,
        'timed_out_1': event.end_time_1 or event.start_time_1,
        'timed_in_2': event.start_time_2 or event.start_time_1,
        'timed_out_2': event.end_time_2 or event.start_time_1,
    }

    with transaction.atomic():
        record = get_object_or_404(
            AttendanceRecord.objects.select_for_update(), id=record_id, event=event
        )

        try:
            new_values = {
                f: _combine_time(request.POST.get(f), getattr(record, f), fallbacks[f])
                for f in fields
            }
        except ValueError:
            return err('One of the times is not valid.')

        given = [new_values[f] for f in fields if new_values[f]]
        if any(a > b for a, b in zip(given, given[1:])):
            return err('Times must be in order: each time must not be earlier than the one before it.')

        for f in fields:
            setattr(record, f, new_values[f])

        if request.POST.get('recalc') in ('on', 'true', '1'):
            record.status = recompute_status(record, event)

        record.edited_by = request.user
        record.save()

    return JsonResponse({
        'ok': True,
        'message': f'Times updated for {record.first_name} {record.last_name}.',
        'row': _row_payload(record),
        'counts': _status_counts(event),
    })