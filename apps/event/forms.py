from datetime import datetime
from django import forms
from apps.core.models import Event

class EditEventForm(forms.ModelForm):
    class Meta:
        model = Event
        fields = [
            'name', 
            'location', 
            'description', 
            'session_type', 
            'start_time_1', 
            'end_time_1', 
            'start_time_2', 
            'end_time_2'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['start_time_2'].required = False
        self.fields['end_time_2'].required = False


class EventForm(forms.ModelForm):
    roster_file = forms.FileField(
        required=True,
        widget=forms.FileInput(attrs={
            'id': 'rosterFileInput',
            'accept': '.csv, .xlsx, .xlsm',
            'style': 'display: none;'
        })
    )

    # 1. Non-model field for the shared date picker
    event_date = forms.DateField(
        widget=forms.DateInput(attrs={'class': 'form-control', 'type': 'date', 'id': 'shared_event_date'})
    )

    # 2. Time-only fields for the session inputs
    start_time_1 = forms.TimeField(
        required=False, 
        widget=forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}, format='%H:%M')
    )
    end_time_1 = forms.TimeField(
        required=False, 
        widget=forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}, format='%H:%M')
    )
    start_time_2 = forms.TimeField(
        required=False, 
        widget=forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}, format='%H:%M')
    )
    end_time_2 = forms.TimeField(
        required=False, 
        widget=forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}, format='%H:%M')
    )

    class Meta:
        model = Event
        fields = ['name', 'description', 'location', 'session_type', 'event_date', 'start_time_1', 'end_time_1', 'start_time_2', 'end_time_2']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Event Name'}),
            'description': forms.Textarea(attrs={'class': 'form-control', 'rows': 3, 'placeholder': 'Description'}),
            'location': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Location'}),
            'session_type': forms.RadioSelect(),
        }

    def clean_roster_file(self):
        file = self.cleaned_data.get('roster_file')
        if file:
            valid_extensions = ('.csv', '.xlsx', '.xlsm')
            if not file.name.lower().endswith(valid_extensions):
                raise forms.ValidationError('Unsupported file format. Please upload a .csv, .xlsx, or .xlsm file.')
            
            # 5 MB upload limit
            if file.size > 5 * 1024 * 1024:
                raise forms.ValidationError('Roster file size cannot exceed 5 MB.')
        return file

    def clean(self):
            cleaned_data = super().clean()
            event_date = cleaned_data.get('event_date')

            # 1. Combine shared date with time-only inputs into datetime objects for the model
            for field_name in ['start_time_1', 'end_time_1', 'start_time_2', 'end_time_2']:
                t = cleaned_data.get(field_name)
                if event_date and t:
                    cleaned_data[field_name] = datetime.combine(event_date, t)
                elif not event_date and t:
                    self.add_error('event_date', 'Event date is required when times are specified.')

            # 2. Validate Session 1 time order
            start_1 = cleaned_data.get('start_time_1')
            end_1 = cleaned_data.get('end_time_1')
            if start_1 and end_1 and end_1 <= start_1:
                self.add_error('end_time_1', 'End time (1) must be later than the start time (1).')

            # 3. Validate Session 2 time order and overlap check
            start_2 = cleaned_data.get('start_time_2')
            end_2 = cleaned_data.get('end_time_2')
            session_type = cleaned_data.get('session_type')

            if session_type and str(session_type) not in ['1', '2']: # When 2 sessions are active
                if start_2 and end_2:
                    if end_2 <= start_2:
                        self.add_error('end_time_2', 'End time (2) must be later than the start time (2).')
                    if start_1 and end_1 and start_2 < end_1:
                        self.add_error('start_time_2', 'Session 2 cannot overlap with Session 1 (must start at or after Session 1 ends).')

            return cleaned_data