import unittest
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from apps.core.models import Event, AttendanceRecord
from apps.attendance.views import apply_scan, allowed_options

class ApplyScanUnitTests(unittest.TestCase):
    def setUp(self):
        self.base_time = datetime(2026, 10, 21, 8, 0, tzinfo=timezone.utc)

    def test_session_1_flow(self):
        event = SimpleNamespace(
            session_type='1',
            start_time_1=self.base_time + timedelta(hours=1),
            end_time_1=self.base_time + timedelta(hours=3),
        )
        rec = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        # 1. On time
        changed, note = apply_scan(rec, event, '1', self.base_time + timedelta(minutes=50))
        self.assertTrue(changed)
        self.assertEqual(rec.status, AttendanceRecord.Status.PRESENT)

        # 2. Duplicate scan
        changed, note = apply_scan(rec, event, '1', self.base_time + timedelta(minutes=55))
        self.assertFalse(changed)
        self.assertIn("already timed in", note)

        # 3. Late scan
        rec2 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        changed, note = apply_scan(rec2, event, '1', self.base_time + timedelta(hours=1, minutes=10))
        self.assertTrue(changed)
        self.assertEqual(rec2.status, AttendanceRecord.Status.LATE)

    def test_session_2_flow(self):
        event = SimpleNamespace(
            session_type='2',
            start_time_1=self.base_time + timedelta(hours=1),
            end_time_1=self.base_time + timedelta(hours=3),
        )

        # 1. On time In -> INCOMPLETE_PRESENT, On time Out -> PRESENT
        rec1 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec1, event, '1', self.base_time + timedelta(minutes=50))
        self.assertEqual(rec1.status, AttendanceRecord.Status.INCOMPLETE_PRESENT)
        apply_scan(rec1, event, '2', self.base_time + timedelta(hours=2, minutes=50))
        self.assertEqual(rec1.status, AttendanceRecord.Status.PRESENT)

        # 2. Late In -> INCOMPLETE_LATE, On time Out -> LATE
        rec2 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec2, event, '1', self.base_time + timedelta(hours=1, minutes=10))
        self.assertEqual(rec2.status, AttendanceRecord.Status.INCOMPLETE_LATE)
        apply_scan(rec2, event, '2', self.base_time + timedelta(hours=2, minutes=50))
        self.assertEqual(rec2.status, AttendanceRecord.Status.LATE)

        # 3. On time In -> INCOMPLETE_PRESENT, Late Out -> LATE
        rec3 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec3, event, '1', self.base_time + timedelta(minutes=50))
        self.assertEqual(rec3.status, AttendanceRecord.Status.INCOMPLETE_PRESENT)
        apply_scan(rec3, event, '2', self.base_time + timedelta(hours=3, minutes=10))
        self.assertEqual(rec3.status, AttendanceRecord.Status.LATE)

        # 4. Out without In -> INCOMPLETE
        rec4 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec4, event, '2', self.base_time + timedelta(hours=2, minutes=50))
        self.assertEqual(rec4.status, AttendanceRecord.Status.INCOMPLETE)

    def test_session_3_flow(self):
        event = SimpleNamespace(
            session_type='3',
            start_time_1=self.base_time + timedelta(hours=1),
            end_time_1=self.base_time + timedelta(hours=3),
            start_time_2=self.base_time + timedelta(hours=5),
            end_time_2=self.base_time + timedelta(hours=7),
        )

        # 1. Perfect attendance -> PRESENT
        rec1 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec1, event, '1', self.base_time + timedelta(minutes=50))
        self.assertEqual(rec1.status, AttendanceRecord.Status.INCOMPLETE_PRESENT)
        apply_scan(rec1, event, '2', self.base_time + timedelta(hours=2, minutes=50))
        self.assertEqual(rec1.status, AttendanceRecord.Status.INCOMPLETE_PRESENT)
        apply_scan(rec1, event, '3', self.base_time + timedelta(hours=4, minutes=50))
        self.assertEqual(rec1.status, AttendanceRecord.Status.INCOMPLETE_PRESENT)
        apply_scan(rec1, event, '4', self.base_time + timedelta(hours=6, minutes=50))
        self.assertEqual(rec1.status, AttendanceRecord.Status.PRESENT)

        # 2. Missed Part 1 entirely, then scans Part 2 (user's exact scenario) -> INCOMPLETE
        rec2 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec2, event, '3', self.base_time + timedelta(hours=4, minutes=50))
        self.assertEqual(rec2.status, AttendanceRecord.Status.INCOMPLETE)
        apply_scan(rec2, event, '4', self.base_time + timedelta(hours=6, minutes=50))
        self.assertEqual(rec2.status, AttendanceRecord.Status.INCOMPLETE)

        # 3. Late for Part 2 Time In -> LATE at final checkout
        rec3 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec3, event, '1', self.base_time + timedelta(minutes=50))
        apply_scan(rec3, event, '2', self.base_time + timedelta(hours=2, minutes=50))
        apply_scan(rec3, event, '3', self.base_time + timedelta(hours=5, minutes=10)) # late
        self.assertEqual(rec3.status, AttendanceRecord.Status.INCOMPLETE_LATE)
        apply_scan(rec3, event, '4', self.base_time + timedelta(hours=6, minutes=50))
        self.assertEqual(rec3.status, AttendanceRecord.Status.LATE)

        # 4. Missed Time Out 1, scans Time In 2 -> INCOMPLETE
        rec4 = SimpleNamespace(
            timed_in_1=None, timed_out_1=None, timed_in_2=None, timed_out_2=None,
            status=AttendanceRecord.Status.ABSENT
        )
        apply_scan(rec4, event, '1', self.base_time + timedelta(minutes=50))
        self.assertEqual(rec4.status, AttendanceRecord.Status.INCOMPLETE_PRESENT)
        # skips option 2!
        apply_scan(rec4, event, '3', self.base_time + timedelta(hours=4, minutes=50))
        self.assertEqual(rec4.status, AttendanceRecord.Status.INCOMPLETE)
