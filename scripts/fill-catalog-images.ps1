# Fills missing catalog images from Wikimedia Commons (reusable licenses only, with author / license / source).
# Runs inside the admin-service container of the compose project "smartkitchen".
#   .\scripts\fill-catalog-images.ps1 --dry-run         # show what would be set
#   .\scripts\fill-catalog-images.ps1 --limit 10        # set at most 10
#   .\scripts\fill-catalog-images.ps1                   # set all missing
docker compose -p smartkitchen exec -T admin-service node dist/scripts/fill-catalog-images.js @args
exit $LASTEXITCODE
