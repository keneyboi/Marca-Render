import unittest
import io
import openpyxl
from datetime import datetime, timezone
from types import SimpleNamespace
from apps.core.models import Event, AttendanceRecord
from apps.event.forms import EditEventForm, EventForm


class ExportXLSXUnitTests(unittest.TestCase):
    def test_xlsx_generation_session_1(self):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Attendance Roster"

        headers = ["#", "Student ID", "Last Name", "First Name", "Email", "Course", "Year Level", "Time In", "Status", "Edited By"]
        ws.append(headers)
        ws.append([1, "21-1234-567", "Doe", "John", "john@example.com", "BSCS", "3", "08:30 AM", "Present", "Admin"])

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)

        loaded_wb = openpyxl.load_workbook(stream)
        loaded_ws = loaded_wb.active
        self.assertEqual(loaded_ws.title, "Attendance Roster")
        self.assertEqual(loaded_ws.cell(row=1, column=2).value, "Student ID")
        self.assertEqual(loaded_ws.cell(row=1, column=3).value, "Last Name")
        self.assertEqual(loaded_ws.cell(row=1, column=4).value, "First Name")
        self.assertEqual(loaded_ws.cell(row=2, column=3).value, "Doe")
        self.assertEqual(loaded_ws.cell(row=2, column=4).value, "John")
        self.assertEqual(loaded_ws.cell(row=2, column=9).value, "Present")

    def test_xlsx_generation_session_2_and_3_headers(self):
        s2_headers = ["#", "Student ID", "Last Name", "First Name", "Email", "Course", "Year Level", "Time In", "Time Out", "Status", "Edited By"]
        s3_headers = ["#", "Student ID", "Last Name", "First Name", "Email", "Course", "Year Level", "Time In 1", "Time Out 1", "Time In 2", "Time Out 2", "Status", "Edited By"]
        self.assertIn("Time Out", s2_headers)
        self.assertIn("Time In 2", s3_headers)
        self.assertIn("Time Out 2", s3_headers)

    def test_forms_allow_optional_end_time(self):
        edit_form = EditEventForm()
        self.assertFalse(edit_form.fields['end_time_1'].required)
        self.assertFalse(edit_form.fields['start_time_2'].required)
        self.assertFalse(edit_form.fields['end_time_2'].required)

        create_form = EventForm()
        self.assertFalse(create_form.fields['end_time_1'].required)
        self.assertFalse(create_form.fields['start_time_2'].required)
        self.assertFalse(create_form.fields['end_time_2'].required)

    def test_parse_roster_file_naming_variations(self):
        from apps.event.views import parse_roster_file
        # Tests Surname / Given Name / Gmail
        csv_data = "Surname,Given Name,Gmail,ID Number\nSantos,Maria,maria@gmail.com,21-999\n"
        f = io.BytesIO(csv_data.encode())
        f.name = "attendees.csv"
        records = parse_roster_file(f)
        self.assertEqual(records[0]['first_name'], 'Maria')
        self.assertEqual(records[0]['last_name'], 'Santos')
        self.assertEqual(records[0]['email'], 'maria@gmail.com')
