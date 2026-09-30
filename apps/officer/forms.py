from django import forms
from django.contrib.auth import get_user_model

from apps.core.models import Officer

User = get_user_model()


class AddOfficerForm(forms.Form):
    email = forms.EmailField()

    def __init__(self, *args, admin, **kwargs):
        super().__init__(*args, **kwargs)
        self.admin = admin
        self.officer_user = None

    def clean_email(self):
        email = self.cleaned_data['email'].strip().lower()

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise forms.ValidationError('No account found with that email. They need to register first.')

        if user.type != User.UserType.OFFICER:
            raise forms.ValidationError('That account is not an officer account.')

        if Officer.objects.filter(officer=user, admin=self.admin).exists():
            raise forms.ValidationError('That user is already your officer.')

        self.officer_user = user
        return email

    def save(self):
        Officer.objects.get_or_create(officer=self.officer_user, admin=self.admin)
        return self.officer_user