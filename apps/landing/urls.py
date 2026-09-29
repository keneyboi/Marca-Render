from django.urls import path
from .views import landing_view, contact_us


urlpatterns = [
    path('', landing_view, name='landing'),
    path('contact/', contact_us, name='contact_us'),
]
