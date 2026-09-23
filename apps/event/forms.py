from django import forms
from apps.core.models import Event

class EventForm(forms.ModelForm):
    roster_file = forms.FileField(
        required=False,
        widget=forms.FileInput(attrs={
            'id': 'rosterFileInput',
            'accept': '.csv, .xlsx, .xls',
            'style': 'display: none;'
        })
    )

    class Meta:
        model = Event
        fields = ['name', 'description', 'location', 'start_time', 'end_time', 'session_type']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Event Name'}),
            'description': forms.Textarea(attrs={'class': 'form-control', 'rows': 3, 'placeholder': 'Description'}),
            'location': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Location'}),
            'start_time': forms.DateTimeInput(attrs={'class': 'form-control', 'type': 'datetime-local'}),
            'end_time': forms.DateTimeInput(attrs={'class': 'form-control', 'type': 'datetime-local'}),
            'session_type': forms.RadioSelect(),
        }