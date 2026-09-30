from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST
from apps.core.models import Officer

from .forms import AddOfficerForm

User = get_user_model()


def _require_admin(user):
    if not user.is_admin:
        raise PermissionDenied("Only admins can manage officers.")


@login_required(login_url='login')
def show_officer(request):
    _require_admin(request.user)
    officers = (
        User.objects
        .filter(admin_links__admin=request.user)
        .order_by('username')
    )
    return render(request, "officer/officer.html", {'officers': officers})


@login_required(login_url='login')
@require_POST
def create_officer(request):
    _require_admin(request.user)

    form = AddOfficerForm(request.POST, admin=request.user)
    if not form.is_valid():
        first_error = next(iter(form.errors.values()))[0]
        messages.error(request, f'Failed to add officer: {first_error}')
        return redirect('officer')

    officer = form.save()
    messages.success(request, f'"{officer.get_full_name() or officer.username}" was added as an officer.')
    return redirect('officer')


@login_required(login_url='login')
@require_POST
def delete_officer(request, officer_id):
    _require_admin(request.user)

    link = get_object_or_404(
        Officer.objects.select_related('officer'),
        officer_id=officer_id,
        admin=request.user,
    )
    name = link.officer.get_full_name() or link.officer.username
    link.delete()
    messages.success(request, f'"{name}" was removed from your officers.')
    return redirect('officer')