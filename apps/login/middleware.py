from django.conf import settings
from django.shortcuts import redirect
from django.urls import NoReverseMatch, reverse


class LoginRequiredMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response

        # List of named URL patterns that DO NOT require login
        # Adjust these names to match your urls.py route names
        self.public_named_urls = [
            "login",
            "landing",
            "register",  # Add any other public route names here
        ]

    def __call__(self, request):
        # 1. Allow authenticated users to proceed immediately
        if request.user.is_authenticated:
            return self.get_response(request)

        path = request.path_info

        # 2. Allow static and media files
        if settings.STATIC_URL and path.startswith(settings.STATIC_URL):
            return self.get_response(request)

        if settings.MEDIA_URL and path.startswith(settings.MEDIA_URL):
            return self.get_response(request)

        # 3. Allow explicitly defined public URLs
        for url_name in self.public_named_urls:
            try:
                public_path = reverse(url_name)
                if path == public_path or path.startswith(public_path):
                    return self.get_response(request)
            except NoReverseMatch:
                # Silently skip if a URL pattern name hasn't been defined yet
                continue

        # 4. Redirect unauthenticated users trying to access protected views
        return redirect('landing')