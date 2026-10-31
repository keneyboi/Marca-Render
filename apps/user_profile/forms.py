from django import forms
from django.contrib.auth import get_user_model

User = get_user_model()

class UserProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ['first_name', 'last_name']
        widgets = {
            'first_name': forms.TextInput(attrs={'class': 'form-input-pill', 'placeholder': 'First Name'}),
            'last_name': forms.TextInput(attrs={'class': 'form-input-pill', 'placeholder': 'Last Name'}),
        }