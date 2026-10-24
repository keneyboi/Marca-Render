import json
from datetime import timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import MultipleObjectsReturned, PermissionDenied
from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_POST

from apps.core.access import get_data_owner
from apps.core.models import AttendanceRecord, Event

# Most items one batch request may carry. Protects the server from a single
# huge request, and keeps the SQL statements a sensible size.
MAX_BATCH_ITEMS = 500

# A scan can be at most this old when it reaches the server (24 hours).
MAX_SECONDS_AGO = 24 * 60 * 60



def _is_ajax(request):
    """True when the page's JavaScript (fetch) made this request."""
    return request.headers.get('X-Requested-With') == 'XMLHttpRequest'


def _respond(request, ok, message, redirect_to, level=None, extra=None):
    """
    One exit for every outcome of set_attendance.
      - fetch() call  -> small JSON answer (no redirect, no page render)
      - normal form   -> flash message + redirect, exactly as before
    """
    if _is_ajax(request):
        data = {'ok': ok, 'message': message}
        if extra:
            data.update(extra)
        # Not-found is a valid scan outcome that prompts to add the attendee, not a malformed HTTP request
        status_code = 200 if (ok or (extra and extra.get('not_found'))) else 400
        return JsonResponse(data, status=status_code)

    level = level or (messages.success if ok else messages.error)
    level(request, message)
    return redirect(redirect_to)


def _clock(dt):
    """'09:05' in the project's local timezone, or an em dash when empty."""
    return timezone.localtime(dt).strftime('%H:%M') if dt else '—'


def _status_counts(event):
    """Present/late/incomplete/absent/total in ONE query."""
    raw = {
        row['status']: row['n']
        for row in event.attendance_records.values('status').annotate(n=Count('id'))
    }
    incomplete_count = (
        raw.get(AttendanceRecord.Status.INCOMPLETE, 0) +
        raw.get(AttendanceRecord.Status.INCOMPLETE_PRESENT, 0) +
        raw.get(AttendanceRecord.Status.INCOMPLETE_LATE, 0) +
        raw.get(AttendanceRecord.Status.INCOMPLETE_ABSENT, 0)
    )
    return {
        'present': raw.get(AttendanceRecord.Status.PRESENT, 0),
        'late': raw.get(AttendanceRecord.Status.LATE, 0),
        'incomplete': incomplete_count,
        'absent': raw.get(AttendanceRecord.Status.ABSENT, 0),
        'total': sum(raw.values()),
    }


def _editor_name(user):
    return user.get_full_name() or user.username


def _row_payload(record):
    """Everything the page needs to patch ONE table row."""
    editor_name = _editor_name(record.edited_by) if record.edited_by_id else '\u2014'
    return {
        'record_id': record.id,
        'status': record.status,
        'status_label': record.display_status_label,
        'status_class': record.display_status_class,
        'timed_in_1': _clock(record.timed_in_1),
        'timed_out_1': _clock(record.timed_out_1),
        'timed_in_2': _clock(record.timed_in_2),
        'timed_out_2': _clock(record.timed_out_2),
        'edited_by': editor_name,
    }


def allowed_options(event):
    """Which scan options make sense for this event's session type."""
    st = str(event.session_type).strip()
    if st == '1':
        return {'1'}
    if st == '2':
        return {'1', '2'}
    return {'1', '2', '3', '4'}


def apply_scan(record, event, option, when):
    """
    Apply one scan to an in-memory record using a finite state machine. Does NOT save.

    Returns (changed, note):
      changed - True if the record was modified (caller must save it)
      note    - a short message when nothing changed ("already timed in ...")

    Rules:
      wa nay rules2 oi buot, buot. 
      ang idea kay everyone starts as absent!
      
      if they have an attendance throughtout the time, they become incomplete
      and only become either present or late on the time out of the event.
      
      initial status -> absent
      
      ok boss eto na yung flow:
      initial for all is absent
      if di nakascan during the whole event then incomplete absent but if after the last time out di paren naka scan so absent final status 
      if mixed, like may time na naka scan then merong missing then incomplete ang final status, example session 3 di umattend morning so if mag scan sya afternoon
      automatic incomplete na sya, then yung iba same lang if present then incomplete present then if late sa next then incomplete late then sa final incomplete late
    """
    Status = AttendanceRecord.Status
    session = str(event.session_type).strip()

    if option == '1':
        if record.timed_in_1:
            return False, f"already timed in at {_clock(record.timed_in_1)}"
        record.timed_in_1 = when
        is_late = bool(event.start_time_1 and when > event.start_time_1)
        if session == '1':
            record.status = Status.LATE if is_late else Status.PRESENT
        else:
            record.status = Status.INCOMPLETE_LATE if is_late else Status.INCOMPLETE_PRESENT

    elif option == '2':
        if record.timed_out_1:
            return False, f"already timed out at {_clock(record.timed_out_1)}"
        record.timed_out_1 = when
        is_late = bool(event.end_time_1 and when > event.end_time_1)

        if not record.timed_in_1 or record.status == Status.INCOMPLETE:
            record.status = Status.INCOMPLETE
        elif session == '2':
            record.status = Status.LATE if (is_late or record.status == Status.INCOMPLETE_LATE) else Status.PRESENT
        else:
            record.status = Status.INCOMPLETE_LATE if (is_late or record.status == Status.INCOMPLETE_LATE) else Status.INCOMPLETE_PRESENT

    elif option == '3':
        if record.timed_in_2:
            return False, f"already timed in (2) at {_clock(record.timed_in_2)}"
        record.timed_in_2 = when
        is_late = bool(event.start_time_2 and when > event.start_time_2)

        if not record.timed_out_1 or record.status == Status.INCOMPLETE:
            record.status = Status.INCOMPLETE
        elif record.status == Status.INCOMPLETE_LATE or is_late:
            record.status = Status.INCOMPLETE_LATE
        else:
            record.status = Status.INCOMPLETE_PRESENT

    elif option == '4':
        if record.timed_out_2:
            return False, f"already timed out (2) at {_clock(record.timed_out_2)}"
        record.timed_out_2 = when
        is_late = bool(event.end_time_2 and when > event.end_time_2)

        if not record.timed_in_2 or record.status == Status.INCOMPLETE:
            record.status = Status.INCOMPLETE
        elif record.status == Status.INCOMPLETE_LATE or is_late:
            record.status = Status.LATE
        else:
            record.status = Status.PRESENT

    else:
        raise ValueError('Invalid option selected.')

    return True, ''


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

    email = (request.POST.get('email') or '').strip() or None
    first_name = (request.POST.get('first_name') or '').strip()
    last_name = (request.POST.get('last_name') or '').strip()
    student_id = (request.POST.get('student_id') or '').strip() or None
    option = (request.POST.get('session_type') or '').strip()

    if not student_id and not email:
        return _respond(request, False, "Either Student ID or Email is required.", fallback_redirect)

    try:
        record = None
        if student_id:
            try:
                record = event.attendance_records.get(
                    student_id__iexact=student_id,
                    last_name__iexact=last_name
                )
            except AttendanceRecord.DoesNotExist:
                if email:
                    record = event.attendance_records.get(
                        email__iexact=email,
                        last_name__iexact=last_name
                    )
                else:
                    raise
        else:
            record = event.attendance_records.get(
                email__iexact=email,
                last_name__iexact=last_name
            )
    except AttendanceRecord.DoesNotExist:
        prev_info = lookup_previous_academic_info(owner_user, student_id=student_id, email=email)
        extra = {
            'not_found': True,
            'student': {
                'student_id': student_id or '',
                'email': email or '',
                'first_name': first_name or '',
                'last_name': last_name or '',
                'course': prev_info.get('course', '') if prev_info else '',
                'year_level': prev_info.get('year_level', '') if prev_info else '',
                'session_type': option,
            }
        }
        return _respond(request, False, "No matching attendance record found for this student.", fallback_redirect, extra=extra)
    except MultipleObjectsReturned:
        return _respond(request, False, "Multiple matching records found — please contact support.", fallback_redirect)

    """Make this a derived state rather than a stored attribute to make
    it more flexible when an event organizer wants to change the late time

    This allows for situations wherein organizers of said event decide to be
    lenient and change the late time to allow students not be marked late
    """

    if option not in allowed_options(event):
        return _respond(request, False, "Invalid option selected.", fallback_redirect, level=messages.warning)

    changed, note = apply_scan(record, event, option, timezone.now())

    if changed:
        record.edited_by = request.user
        record.save()
        message = f"Attendance updated for {record.first_name} {record.last_name}."
    else:
        message = f"{record.first_name} {record.last_name} is {note}."

    return _respond(
        request, True, message, fallback_redirect,
        extra={**_row_payload(record), 'counts': _status_counts(event)},
    )


class _BadRequest(Exception):
    """The request as a whole is unusable (as opposed to one bad item)."""


def _load_batch(request):
    """Parse the JSON body and find the event this user may edit."""
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        raise _BadRequest("Request body must be valid JSON.")
    if not isinstance(payload, dict):
        raise _BadRequest("Request body must be a JSON object.")

    event_id = payload.get('event_id')
    if not str(event_id).isdigit():
        raise _BadRequest("Invalid event ID.")

    owner_user = get_data_owner(request)
    if owner_user is None:
        raise PermissionDenied("You do not have permission to edit these records.")

    event = get_object_or_404(Event, id=int(event_id), user=owner_user)
    return payload, event


def _batch_summary(results):
    saved = sum(1 for r in results if r['ok'] and not r.get('skipped'))
    skipped = sum(1 for r in results if r['ok'] and r.get('skipped'))
    failed = sum(1 for r in results if not r['ok'])
    parts = [f"Saved {saved}"]
    if skipped:
        parts.append(f"{skipped} already recorded")
    if failed:
        parts.append(f"{failed} failed")
    return ", ".join(parts) + "."


def _text(value):
    return str(value).strip() if value is not None else ''


@login_required(login_url='landing')
@require_POST
def batch_scan(request):
    """
    Apply many scans at once.

    Body: {"event_id": 12, "items": [
        {"option": "1", "student_id": "..", "email": "..",
         "first_name": "..", "last_name": "..", "seconds_ago": 42}, ...]}

    Partial success: valid items are saved, invalid ones are reported back
    one by one. The reply lists a result for every item, in the same order.
    """
    try:
        payload, event = _load_batch(request)
        items = payload.get('items')
        if not isinstance(items, list) or not items:
            raise _BadRequest("No scans to process.")
        if len(items) > MAX_BATCH_ITEMS:
            raise _BadRequest(f"Too many scans in one request (max {MAX_BATCH_ITEMS}).")
    except _BadRequest as exc:
        return JsonResponse({'ok': False, 'message': str(exc)}, status=400)

    now = timezone.now()
    valid_options = allowed_options(event)
    results = [None] * len(items)
    work = []  # (when, index, item) for items that passed validation

    # 1) Validate each item on its own (cheap, no database).
    for index, raw in enumerate(items):
        if not isinstance(raw, dict):
            results[index] = {'index': index, 'ok': False, 'error': 'Malformed scan.'}
            continue

        item = {
            'option': _text(raw.get('option')),
            'student_id': _text(raw.get('student_id')),
            'email': _text(raw.get('email')),
            'first_name': _text(raw.get('first_name')),
            'last_name': _text(raw.get('last_name')),
        }
        if item['option'] not in valid_options:
            results[index] = {'index': index, 'ok': False, 'error': 'Invalid option for this event.'}
            continue
        if not item['student_id'] and not item['email']:
            results[index] = {'index': index, 'ok': False, 'error': 'Student ID or email is required.'}
            continue

        try:
            seconds_ago = float(raw.get('seconds_ago', 0))
        except (TypeError, ValueError):
            results[index] = {'index': index, 'ok': False, 'error': 'Invalid scan time.'}
            continue
        # Clamp: never in the future, never older than 24 hours.
        seconds_ago = min(max(seconds_ago, 0), MAX_SECONDS_AGO)

        work.append((now - timedelta(seconds=seconds_ago), index, item))

    # Oldest scan first, so "first scan wins" / "latest scan wins" are exact
    # even when the same student appears twice in one batch.
    work.sort(key=lambda w: (w[0], w[1]))

    changed = {}

    with transaction.atomic():
        # 2) ONE query for every record any item could refer to. The rows are
        #    locked until we finish, so a second officer's batch waits instead
        #    of overwriting ours.
        student_ids = {i['student_id'] for _, _, i in work if i['student_id']}
        emails = {i['email'] for _, _, i in work if i['email']}

        by_key = {}
        if student_ids or emails:
            candidates = (
                event.attendance_records
                .filter(Q(student_id__in=student_ids) | Q(email__in=emails))
                .select_related('edited_by')
                .select_for_update(of=('self',))
            )
            for rec in candidates:
                lname = _text(rec.last_name).lower()
                if rec.student_id:
                    by_key.setdefault(('sid', rec.student_id.lower(), lname), []).append(rec)
                if rec.email:
                    by_key.setdefault(('em', rec.email.lower(), lname), []).append(rec)

        # 3) Decide every outcome in memory.
        for when, index, item in work:
            lname = item['last_name'].lower()
            sid_key = ('sid', item['student_id'].lower(), lname) if item['student_id'] else None
            em_key = ('em', item['email'].lower(), lname) if item['email'] else None

            matches = []
            if sid_key:
                matches = by_key.get(sid_key, [])
            if not matches and em_key:
                matches = by_key.get(em_key, [])

            if not matches:
                results[index] = {'index': index, 'ok': False,
                                  'error': 'No matching attendance record.'}
                continue
            if len(matches) > 1:
                results[index] = {'index': index, 'ok': False,
                                  'error': 'Multiple matching records — contact support.'}
                continue

            record = matches[0]
            did_change, note = apply_scan(record, event, item['option'], when)
            if did_change:
                record.edited_by = request.user
                changed[record.id] = record
            results[index] = {'index': index, 'ok': True, 'record': record,
                              'skipped': not did_change, 'note': note}

        # 4) ONE bulk UPDATE for everything that changed.
        if changed:
            AttendanceRecord.objects.bulk_update(
                list(changed.values()),
                ['status', 'timed_in_1', 'timed_out_1', 'timed_in_2', 'timed_out_2', 'edited_by'],
                batch_size=250,
            )

    # 5) Build the reply. Rows are rendered from the final in-memory state.
    for res in results:
        record = res.pop('record', None)
        if record is not None:
            res['row'] = _row_payload(record)
            if res.get('skipped'):
                res['message'] = f"{record.first_name} {record.last_name} is {res['note']}."
        res.pop('note', None)

    return JsonResponse({
        'ok': True,
        'message': _batch_summary(results),
        'results': results,
        'counts': _status_counts(event),
    })


@login_required(login_url='landing')
@require_POST
def batch_set_status(request):
    """
    Manually set the status of many selected roster rows at once.

    Body: {"event_id": 12, "status": "PRESENT", "record_ids": [1, 2, 3]}
    Only the status changes; recorded times are left untouched.
    """
    try:
        payload, event = _load_batch(request)
        status = _text(payload.get('status'))
        if status not in AttendanceRecord.Status.values:
            raise _BadRequest("Invalid status.")
        raw_ids = payload.get('record_ids')
        if not isinstance(raw_ids, list) or not raw_ids:
            raise _BadRequest("No rows selected.")
        if len(raw_ids) > MAX_BATCH_ITEMS:
            raise _BadRequest(f"Too many rows selected (max {MAX_BATCH_ITEMS}).")
        if not all(isinstance(i, int) and not isinstance(i, bool) for i in raw_ids):
            raise _BadRequest("Row ids must be whole numbers.")
    except _BadRequest as exc:
        return JsonResponse({'ok': False, 'message': str(exc)}, status=400)

    results = []
    changed = []

    with transaction.atomic():
        # ONE query; ownership is guaranteed because we only look inside this event.
        records = {
            r.id: r
            for r in (event.attendance_records.filter(id__in=raw_ids)
                      .select_related('edited_by').select_for_update(of=('self',)))
        }
        for index, rid in enumerate(raw_ids):
            record = records.get(rid)
            if record is None:
                results.append({'index': index, 'ok': False, 'error': 'Row not found in this event.'})
                continue
            skipped = record.status == status
            if not skipped:
                record.status = status
                record.edited_by = request.user
                changed.append(record)
            results.append({'index': index, 'ok': True, 'skipped': skipped,
                            'row': _row_payload(record)})

        if changed:
            AttendanceRecord.objects.bulk_update(changed, ['status', 'edited_by'], batch_size=250)

    return JsonResponse({
        'ok': True,
        'message': _batch_summary(results),
        'results': results,
        'counts': _status_counts(event),
    })


def lookup_previous_academic_info(owner_user, student_id=None, email=None):
    """
    Look up latest known academic info (course, year_level) for a student
    across previous events under this data owner (direct DB query, no cache).
    """
    if not owner_user or (not student_id and not email):
        return None

    sid_clean = str(student_id).strip() if student_id else ''
    em_clean = str(email).strip() if email else ''

    q = Q()
    if sid_clean:
        q |= Q(student_id__iexact=sid_clean)
    if em_clean:
        q |= Q(email__iexact=em_clean)

    has_academic = (
        (Q(course__isnull=False) & ~Q(course='')) |
        (Q(year_level__isnull=False) & ~Q(year_level=''))
    )

    rec = (
        AttendanceRecord.objects
        .filter(event__user=owner_user)
        .filter(q)
        .filter(has_academic)
        .order_by('-event__start_time_1')
        .values('course', 'year_level')
        .first()
    )
    return rec


@login_required(login_url='landing')
@require_POST
def lookup_student(request):
    owner_user = get_data_owner(request)
    if not owner_user:
        return JsonResponse({'found': False}, status=403)

    student_id = request.POST.get('student_id', '').strip()
    email = request.POST.get('email', '').strip()

    if not student_id and not email:
        return JsonResponse({'found': False})

    info = lookup_previous_academic_info(owner_user, student_id=student_id, email=email)
    if info:
        return JsonResponse({
            'found': True,
            'course': info.get('course') or '',
            'year_level': info.get('year_level') or '',
        })

    return JsonResponse({'found': False})

def recompute_status(record, event):
    """
    Derive the status purely from the recorded times (mirrors apply_scan).
    Keep the two in sync if you ever change the rules.
    """
    Status = AttendanceRecord.Status
    session = str(event.session_type).strip()

    chain = [(record.timed_in_1, event.start_time_1)]
    if session in ('2', '3'):
        chain.append((record.timed_out_1, event.end_time_1))
    if session == '3':
        chain += [(record.timed_in_2, event.start_time_2),
                  (record.timed_out_2, event.end_time_2)]

    stamps = [(when, limit) for when, limit in chain if when]
    if not stamps:
        return Status.ABSENT

    is_late = any(limit and when > limit for when, limit in stamps)

    if len(stamps) == len(chain):                      # every required scan exists
        return Status.LATE if is_late else Status.PRESENT

    # Partial attendance: only a clean run from the start counts as "in progress";
    # a gap (e.g. afternoon only) is plain INCOMPLETE.
    contiguous = all(chain[i][0] for i in range(len(stamps)))
    if not contiguous:
        return Status.INCOMPLETE
    return Status.INCOMPLETE_LATE if is_late else Status.INCOMPLETE_PRESENT