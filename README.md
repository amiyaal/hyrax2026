# Ein Gedi 2026 Hyrax Dashboard

This repository contains the cleaned 2026 hyrax trapping dataset and a static dashboard for GitHub Pages.

## Publish on GitHub Pages

1. Create a new empty GitHub repository.
2. In this folder, add the remote:

```bash
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
```

3. Commit and push:

```bash
git add .
git commit -m "Publish Ein Gedi 2026 hyrax dashboard"
git branch -M main
git push -u origin main
```

4. In the GitHub repo settings, open `Pages`.
5. Set the source to:
   `Deploy from a branch`
6. Choose:
   Branch `main`
   Folder `/docs`

The published site will use the self-contained files in `docs/`.

## Local Structure

- `docs/` GitHub Pages publish folder
- `site/` local working dashboard
- `data/` cleaned CSV and OCR outputs
- `assets/` debug crops and contact sheets
