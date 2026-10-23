import unittest
import io
import openpyxl
from datetime import datetime, timezone
from types import SimpleNamespace
from apps.core.models import Event, AttendanceRecord


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
