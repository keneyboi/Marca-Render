import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0007_delete_unassigned_officers')]

    operations = [
        migrations.AlterField(
            model_name='officer',
            name='officer',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='admin_links',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='officer',
            name='admin',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='managed_officers',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddConstraint(
            model_name='officer',
            constraint=models.UniqueConstraint(
                fields=('officer', 'admin'), name='unique_officer_admin'
            ),
        ),
    ]