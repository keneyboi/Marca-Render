from django.db import migrations


def delete_unassigned(apps, schema_editor):
    Officer = apps.get_model('core', 'Officer')
    Officer.objects.filter(admin__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [('core', '0006_alter_user_type_officer')]

    operations = [
        migrations.RunPython(delete_unassigned, migrations.RunPython.noop),
    ]