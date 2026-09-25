from django import forms
from apps.core.models import Event

class EventForm(forms.ModelForm):
    roster_file = forms.FileField(
        required=True,
        widget=forms.FileInput(attrs={
            'id': 'rosterFileInput',
            'accept': '.csv, .xlsx, .xlsm',
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
            'start_time': forms.DateTimeInput(
                format='%Y-%m-%dT%H:%M',
                attrs={
                    'class': 'form-control',
                    'type': 'datetime-local',
                    'id': 'id_start_time',
                }
            ),
            'end_time': forms.DateTimeInput(
                format='%Y-%m-%dT%H:%M',
                attrs={
                    'class': 'form-control',
                    'type': 'datetime-local',
                    'id': 'id_end_time',
                }
            ),
            'session_type': forms.RadioSelect(),
        }

    def clean_roster_file(self):
        file = self.cleaned_data.get('roster_file')
        if file:
            valid_extensions = ('.csv', '.xlsx', '.xlsm')
            if not file.name.lower().endswith(valid_extensions):
                raise forms.ValidationError('Unsupported file format. Please upload a .csv or .xlsx file.')
            
            # 5 MB upload limit
            if file.size > 5 * 1024 * 1024:
                raise forms.ValidationError('Roster file size cannot exceed 5 MB.')
        return file

    def clean(self):
        cleaned_data = super().clean()
        start = cleaned_data.get('start_time')
        end = cleaned_data.get('end_time')

        if start and end and end <= start:
            self.add_error('end_time', 'End time must be later than the start time.')

        return cleaned_data