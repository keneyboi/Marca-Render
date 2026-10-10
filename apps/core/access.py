from django.contrib.auth import get_user_model

User = get_user_model()


def get_officer_admins(user):
    """All admins that have added this officer."""
    return User.objects.filter(managed_officers__officer=user).order_by('username')


def get_data_owner(request):
    """The admin whose data the current user is working in.

    Admins -> themselves. Officers -> the admin chosen in the switcher,
    falling back to their first admin. None if they haven't been added yet.
    """
    user = request.user
    if user.is_admin:
        return user

    admins = list(get_officer_admins(user))    
    active_id = request.session.get('active_admin_id')

    owner = next((a for a in admins if a.pk == active_id), None) \
            or (admins[0] if admins else None)
    if owner and request.session.get('active_admin_id') != owner.pk:
        request.session['active_admin_id'] = owner.pk
    return owner