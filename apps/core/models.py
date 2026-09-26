from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    email = models.EmailField(unique=True)

    def __str__(self):
        return f"{self.username} ({self.email})"

class Folder(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=100)

    class Meta:
        ordering = ['name']
        unique_together = ('user', 'name')

    def __str__(self):
        return self.name


class Event(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = 'SCHEDULED', 'Scheduled'
        ONGOING = 'ONGOING', 'Ongoing'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    class SessionType(models.TextChoices):
        SESSION_1 = '1', 'Time In Only'
        SESSION_2 = '2', 'Time In & Time Out'
        SESSION_3 = '3', 'Two-Part (Time In 1, Time Out 1, Time In 2, Time Out 2)'

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='organized_events'
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=255)
    session_type = models.CharField(
        max_length=20,
        choices=SessionType.choices,
        default=SessionType.SESSION_1
    )
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.SCHEDULED
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    folder = models.ForeignKey(
        Folder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='events'
    )

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
    
    email = models.EmailField(blank=True, null=True)
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
            models.UniqueConstraint(
                fields=['event', 'email'],
                condition=models.Q(email__isnull=False) & ~models.Q(email=''),
                name='unique_event_email'
            ),
            models.UniqueConstraint(
                fields=['event', 'student_id'],
                condition=models.Q(student_id__isnull=False) & ~models.Q(student_id=''),
                name='unique_event_student_id'
            ),
        ]

    def __str__(self):
        ident = self.student_id or self.email or "No ID"
        return f"{self.last_name}, {self.first_name} ({ident}) - {self.status}"