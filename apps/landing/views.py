from django.shortcuts import render, redirect
from django.contrib import messages
from django.core.mail import send_mail
from django.conf import settings
from apps.core.forms import ContactForm

# Create your views here.
def landing_view(request):
    return render(request, 'landing/landing.html')




def contact_us(request):
    if request.method == 'POST':
        form = ContactForm(request.POST)
        if form.is_valid():
            name = form.cleaned_data['name']
            email = form.cleaned_data['email']
            user_message = form.cleaned_data['message']

            subject = f"New Contact Us Inquiry from {name}"
            body = f"Sender Name: {name}\nSender Email: {email}\n\nMessage:\n{user_message}"

            try:
                send_mail(
                    subject=subject,
                    message=body,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[settings.ADMIN_EMAIL],  
                    fail_silently=False,
                )
                messages.success(request, "Thank you! Your message has been sent successfully.")
            except Exception as e:
                print(f"Email error: {e}")
                messages.error(request, "Failed to send your message. Please try again later.")

            return redirect('landing')
        else:
            messages.error(request, "Please fill in all required fields correctly.")

    return redirect('landing')