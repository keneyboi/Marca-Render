from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    email = models.EmailField(unique=True)

    def __str__(self):
        return f"{self.username} ({self.email})"


class Event(models.Model):
    STATUS_CHOICES = [
        ('SCHEDULED', 'Scheduled'),
        ('ONGOING', 'Ongoing'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='organized_events'
    )
    name = models.CharField(max_length=150)
    location = models.CharField(max_length=255)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='SCHEDULED')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    def __str__(self):
        return f"{self.name} - {self.location}"


class AttendanceRecord(models.Model):
    STATUS_CHOICES = [
        ('ABSENT', 'Absent'),
        ('PRESENT', 'Present'),
        ('LATE', 'Late')
    ]

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

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='ABSENT')
    timed_in = models.DateTimeField(blank=True, null=True)
    timed_out = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields = ['event', 'email'], name = 'unique_event_attendee')
        ]

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.email}) - {self.status}"