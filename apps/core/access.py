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

    admins = get_officer_admins(user)
    active_id = request.session.get('active_admin_id')

    owner = admins.filter(pk=active_id).first() if active_id else None
    if owner is None:
        owner = admins.first()
        if owner:
            request.session['active_admin_id'] = owner.pk
    return owner