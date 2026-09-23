from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    email = models.EmailField(unique=True)

    def __str__(self):
        return f"{self.username} ({self.email})"


class Event(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = 'SCHEDULED', 'Scheduled'
        ONGOING = 'ONGOING', 'Ongoing'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    class SessionType(models.TextChoices):
        MORNING = '1', '1'
        AFTERNOON = '2', '2'
        BOTH = '3', '3'

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='organized_events'
    )
    name = models.CharField(max_length=150)
    location = models.CharField(max_length=255)
    session_type = models.CharField(
        max_length=20,
        choices=SessionType.choices,
        default=SessionType.BOTH
    )
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.SCHEDULED
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    def __str__(self):
        return f"{self.name} ({self.get_session_type_display()}) - {self.location}"


class AttendanceRecord(models.Model):
    class Status(models.TextChoices):
        ABSENT = 'ABSENT', 'Absent'
        PRESENT = 'PRESENT', 'Present'
        LATE = 'LATE', 'Late'

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='attendance_records'
    )
    
    email = models.EmailField()
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    student_id = models.CharField(max_length=50, blank=True, null=True)
    year_level = models.CharField(max_length=20, blank=True, null=True)
    course = models.CharField(max_length=50, blank=True, null=True)

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.ABSENT
    )

    timed_in_1 = models.DateTimeField(blank=True, null=True)
    timed_out_1 = models.DateTimeField(blank=True, null=True)
    timed_in_2 = models.DateTimeField(blank=True, null=True)
    timed_out_2 = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['event', 'email'], name='unique_event_attendee')
        ]

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.email}) - {self.status}"